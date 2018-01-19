const fs = require('fs');
const datetime = require('node-datetime');
const splitFile = require('split-file');
const md5File = require('md5-file');
const path = require('path');
const logger = require('../logger/logger');
const loginController = require('../controllers/loginController');
const b2safeAPI = require('../controllers/eudatHttpApiController');

var processing = false;
var itemBeingProcessedNow = 0;

function splitReplicateFinalize(item, names, splitverified, error, error_msg, db, config, callback) {

    logger.trace();

    if(error) {
        db.collection("item").updateOne(
                {'handle' : item.handle, 'filename': item.filename},
                {$set:
                {
                    'status' : 'ERROR',
                    'end_time' : new Date().toISOString(),
                    'replication_error': error_msg
                }
                });
        callback(false, error);
    } else {
        db.collection("item").updateOne(
                {'handle' : item.handle, 'filename': item.filename},
                {$set:
                {
                    'verified' : splitverified,
                    'status' : 'COMPLETED',
                    'replication_error' : '',
                    'end_time' : new Date().toISOString()
                }
                });	
        callback(true, null);
    }

    for(var i in names) {
        var name = names[i];
        fs.unlinkSync(name);
    }
}

function splitReplicatePartial(item, names, index, splitverified, db, config, callback) {

    logger.trace();

    if(index >= names.length) {
        logger.debug("replicationScheduler.splitReplicatePartial " + item.filename + " completed.");
        splitReplicateFinalize(item, names, splitverified, false, null, db, config, callback);
        return;
    }

    var name = names[index];
    logger.debug(name);

    loginController.getToken(db, config, function(token, error) {

        if(error) {
            db.collection("item").updateOne(
                    {'handle' : item.handle, 'filename': item.filename},
                    {$set: {
                        'status' : 'ERROR',
                        'end_time' : new Date().toISOString(),
                        'replication_error': error }
                    });
            callback(false, error);
        } else {

            var start_time = new Date().toISOString();

            var checksum = md5File.sync(name);
            var stats = fs.statSync(name);
            var filesize = stats.size / 1000000; // converting megabytes to
            // bytes

            var f = path.basename(name);
            var handle2name = item.handle.replace("/", "_");

            b2safeAPI.putFile(fs.createReadStream(name), handle2name + "/" + f, true, true, token, config, function(data, error) {
                if(error) {                    
                    db.collection("item").updateOne(
                            {'handle' : item.handle, 'filename': item.filename},
                            {$addToSet: {
                                'splitfiles' : 
                                {
                                    'name' : name,
                                    'status': 'ERROR',
                                    'checksum': checksum,
                                    'filesize': filesize,                                               
                                    'start_time': start_time,
                                    'end_time': new Date().toISOString(),
                                    'replication_error': data.Response.errors
                                }
                            }
                            },
                            function(error, response) {
                                if(error) {
                                    logger.debug(error);
                                    callback(false, error);
                                } else {
                                    splitReplicateFinalize(item, names, splitverified, true, data.Response.errors, db, config, callback);
                                }
                            }
                    );
                } else {
                    var serverchecksum = data.Response.data.checksum;
                    var verified = checksum === serverchecksum;
                    db.collection("item").updateOne(
                            {'handle' : item.handle, 'filename': item.filename},
                            {$addToSet: {
                                'splitfiles' : 
                                {   'name' : f,
                                    'status': 'COMPLETED',
                                    'replication_error' : '',
                                    'checksum': checksum,
                                    'filesize': filesize,
                                    'start_time': start_time,
                                    'verified' : verified,
                                    'end_time': new Date().toISOString(),
                                    'replication_data': data.Response.data
                                }
                            }
                            },
                            function(error, response) {
                                if(error) {
                                    logger.debug(error);
                                    callback(false, error);
                                } else {
                                    splitReplicatePartial(item, names, index+1, splitverified && verified, db, config, callback);                         
                                } 
                            }
                    );
                }
            });            
        }
    });
}

function splitReplicate(item, token, db, config, callback) {

    logger.trace();

    db.collection("item").updateOne( {'handle' : item.handle, 'filename': item.filename}, { $set: { 'splitted': 1 }});

    splitFile.splitFileBySize(item.filename, parseInt(config.b2safe.maxfilesize) * 1000000)
    .then(function (names){
        splitReplicatePartial(item, names, 0, true, db, config, callback);
    }).catch(function(error){
        db.collection("item").updateOne(
                {'handle' : item.handle, 'filename': item.filename},
                {$set:
                {
                    'status' : 'ERROR',
                    'end_time' : new Date().toISOString(),
                    'replication_error': error
                }
                });
        callback(false, error);
    });
}

function doReplicate(item, token, db, config, callback) {	

    logger.trace();

    logger.debug("replicating " + item.handle + "/" + path.basename(item.filename));

    var filesize = item.filesize;
    if(parseInt(filesize) >= parseInt(config.b2safe.maxfilesize)) {
        logger.debug("Its a big file " + filesize + "mb .. splitting.");
        splitReplicate(item, token, db, config, callback);
        return;
    }

    var f = path.basename(item.filename);
    var handle2name = item.handle.replace("/", "_");

    b2safeAPI.putFile(fs.createReadStream(item.filename), handle2name + "/" + f, true, true, token, config, function(data, error) {
        if(error) {
            db.collection("item").updateOne(
                    {'handle' : item.handle, 'filename': item.filename},
                    {$set: {
                        'status' : 'ERROR',
                        'end_time' : new Date().toISOString(),
                        'replication_error': error }
                    }
            );
            callback(false, error);
        } else {
            var checksum = item.checksum;
            var serverchecksum = data.Response.data.checksum;
            var verified = checksum === serverchecksum;
            db.collection("item").updateOne(
                    {'handle' : item.handle, 'filename': item.filename},
                    {$set: {
                        'status' : 'COMPLETED',
                        'replication_error' : '',
                        'verified' : verified,
                        'end_time' : new Date().toISOString(),
                        'replication_data': data.Response.data }
                    }
            );
            callback(true, null);
        }
    });

}

function createFolder(item, db, config, callback) {

    logger.trace();

    logger.debug("createFolder " + item.handle);

    loginController.getToken(db, config, function(token, error) {
        if(error) {            
            db.collection("item").updateOne(
                    {'handle' : item.handle, 'filename': item.filename},
                    {$set: {
                        'status' : 'ERROR',
                        'end_time' : new Date().toISOString(),
                        'replication_error': error }
                    });
            callback(false, error);
        } else {

            var handle2name = item.handle.replace("/", "_");

            b2safeAPI.createFolder(handle2name, token, config, function(data, error) {
                if(error) {
                    db.collection("item").updateOne(
                            {'handle' : item.handle, 'filename': item.filename},
                            {$set: {
                                'status' : 'ERROR',
                                'end_time' : new Date().toISOString(),
                                'replication_error': error.Response.errors }
                            });
                    callback(false, error);
                } else {
                    doReplicate(item, token, db, config, callback);
                }
            });
        }

    }); 
}

function processItem(item, db, config) {
    
    logger.trace();
    
    itemBeingProcessedNow ++;
    
    logger.debug("item being processed now: " + itemBeingProcessedNow);
    
    db.collection("item").updateOne(
            {'handle' : item.handle, 'filename': item.filename},
            {$set:
            {
                'status' : 'IN PROGRESS',
                'start_time' : new Date().toISOString()
            }
            },
            function(error, response) {
                if(error) {
                    logger.error(error);
                    db.collection("item").updateOne(
                            {'handle' : item.handle, 'filename': item.filename},
                            {$set:
                            {
                                'status' : 'ERROR',
                                'end_time' : new Date().toISOString(),
                                'replication_error': error                                                  
                            }
                            }
                    );
                    itemBeingProcessedNow --;
                } else {
                    createFolder(item, db, config, function (response, error) {
                        itemBeingProcessedNow --;
                    });
                }
            }
    );    
}

exports.run = function(db, config, callback) {

    logger.trace();

    if(processing) {
        logger.debug("replicationScheduler.run previous call not finished yet.");
    } else {
        processing = true;    
        db.collection("item").find({status : "QUEUED"}).toArray(function(error, items) {
            if(error) {
                logger.error(error);
            } else {

                logger.info(items.length + " item(s) available for replication.");

                for(var i in items) {
                    var item = items[i];
                    logger.info(item.handle + " QUEUED -> IN PROGRESS.");
                    if(itemBeingProcessedNow >= config.replicationCronJob.bandwidth) {
                        break;
                    } else {
                        processItem(item, db, config);
                    }
                                        
                }
            }
        });
    }
    processing = false;
};