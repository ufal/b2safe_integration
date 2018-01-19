const querystring = require('querystring');
const rp = require('request-promise');
const fs = require('fs');
const mime = require('mime-types');
const md5File = require('md5-file');
const loginController = require('./loginController');
const logger = require('../logger/logger');


exports.listItems = function(req, res, db, config) {

    logger.debug("function called itemController.listItems");

    db.collection("item").aggregate([ {"$group" : {
        "_id":"$handle",
        "fileList": {
            "$push" : {
                "handle": "$handle",
                "filename": "$filename",
                "filesize": "$filesize",
                "splitted": "$splitted",
                "splitfiles": "$splitfiles",
                "checksum": "$checksum",
                "user-checksum": "$user-checksum",
                "verified": "$verified",
                "status": "$status",
                "start_time": "$start_time",
                "end_time": "$end_time",
                "replication_data": "$replication_data",
                "replication_error": "$replication_error"
            }
        }, 
        "count": {"$sum": 1}
    }} ],
    function(err, items) {
        if (err) {
            res.send(err);					
        } else {
            res.send(items);
        }
    });
};

exports.retrieve = function(req, res, db, config) {

    logger.debug("function called itemController.retrieve");

    var handle = req.query.handle;

    db.collection("item").findOne({'handle' : handle}, function(err, result) {		
        if(err) {
            res.send(err);
        } else {
            if(result) {
                if(result.status === 'COMPLETED') {

                    var handle2name = handle.replace("/", "_");
                    var f = result.replication_data.filename;

                    loginController.getToken(db, config, function(token, err) {					
                        var options = {
                                encoding: null,
                                uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name + "/" + f,
                                method: 'GET',
                                auth: {
                                    'bearer': token
                                },
                                formData: {
                                    'download' :  "true"
                                },		
                        };

                        rp(options)
                        .then(function (data) {
                            res.writeHead(200, {"Transfer-Encoding": "chunked",
                                "Content-Type" : mime.lookup(f),
                                "Content-Disposition" : "attachment; filename=" + f
                            });
                            res.write(data, 'binary');
                            res.end();

                        })
                        .catch(function (error) {
                            logger.error(error);
                        });
                    });

                } else {
                    res.send({response: result.status});
                }
            } else {
                res.send({respnose: 404});
            }
        }
    });
}

function addToQueue(handle, fileToReplicate, filesize, checksum, userChecksum, db, config, callback) {

    logger.debug("function called itemController.addToQueue");

    var response = {};
    db.collection("item").insertOne({'handle' : handle, 'filename' : fileToReplicate, 'filesize': filesize, 'checksum': checksum, 'user-checksum': userChecksum, 'status' : 'QUEUED'}, function(err, result) {
        if(err) {
            callback(null, {status: "ERROR", replication_error: err});
        } else {
            callback({response: "QUEUED"}, null);
        }
    });
}

function replicateFile(handle, fileToReplicate, userChecksum, db, config, callback) {

    logger.debug("function called itemController.replicateFile");

    var response = {};
    var checksum = md5File.sync(fileToReplicate);
    var stats = fs.statSync(fileToReplicate);
    var filesize = stats.size / 1000000; // file size in megabytes

    if(userChecksum){
        logger.debug("checksum = " + checksum);
        if(checksum !== userChecksum) {
            db.collection("item").insertOne({'handle' : handle, 'filename' : fileToReplicate, 'filesize': filesize, 'checksum': checksum, 'user-checksum': userChecksum, 'status' : 'ERROR', 'replication_error': {'checksum-error': 'User provided checksum did not match with the file checksum'}}, function(err, result) {
                if(err) {				
                    callback(null, {status: "ERROR", replication_error: err});
                } else {
                    callback(null, response = {status: "checksum error"});
                }
            });
        }
    }

    db.collection("item").findOne({'handle' : handle, 'filename': fileToReplicate}, function(err, item) {		
        if(err) {
            logger.error(err);
            response = {status: "ERROR", replication_error: err};
        } else {
            if(item) {
                if(item.status === 'QUEUED' || item.status === 'IN PROGRESS') {
                    logger.debug("Already in progress.");
                    callback({response: item.status}, null);
                } else {
                    logger.debug(item.status);
                    logger.debug("requeue.");		

                    db.collection("item").updateOne(
                            {'handle' : item.handle, 'filename': item.filename},
                            {$set:
                            {
                                'status' : 'QUEUED',
                                'checksum': checksum,
                                'replication_error': null,
                                'start_time' : null
                            }
                            },
                            function(err, res){
                                if(err) {
                                    callback({status: "ERROR", replication_error: err}, err);
                                } else {
                                    callback({response: 'QUEUED'}, null);
                                }
                            }
                    );
                }
            } else {
                logger.debug("adding to queue.");				
                addToQueue(handle, fileToReplicate, filesize, checksum, userChecksum, db, config, function(response, error){
                    callback(response, error);
                });
            }
        }

    });
}

exports.replicate = function(req, res, db, config) {

    logger.debug("function called itemController.replicate");

    var toReplicate = req.body.filename;
    var handle = req.body.handle;
    var userChecksum = req.body.checksum;

    logger.debug(handle + " " + toReplicate);

    if(handle && toReplicate) {

        if(!fs.existsSync(toReplicate)) {
            logger.error("Uploaded path not exist");
            res.send({response: "Uploaded path not exist"});
        }

        var stats = fs.statSync(toReplicate);

        if(stats.isFile()) {
            replicateFile(handle, toReplicate, userChecksum, db, config, function (response, err) {
                res.send(response);
            });
        } else
            if(stats.isDirectory()){			
                var files = fs.readdirSync(toReplicate);
                for(var i in files) {
                    var file = files[i];
                    var fstat = fs.statSync(toReplicate + "/" + file);
                    if(fstat.isFile()) {
                        var response = replicateFile(handle, toReplicate + "/" + file, "", db, config);
                    }
                }
            }

    } else {
        res.send({response: "ERROR"});
    }

};

exports.getItemStatus = function(req, res, db, config) {

    logger.debug("function called itemController.getItemStatus");

    var handle = req.query.handle;

    db.collection("item").findOne({'handle' : handle}, function(err, result) {
        if(err) {
            res.send(err);
        } else {
            if(result) {
                res.send({response: result.status});
            } else {
                res.send({response: "ERROR"});
            }
        }		
    });	
};

function removeSingleFile(item, db, config, callback) {

    logger.debug("function called itemController.removeSingleFile");

    var handle2name = item.handle.replace("/", "_");
    var f = item.filename.split("/");
    f = f[f.length-1];

    loginController.getToken(db, config, function(token, err) {
        if(err) {
            callback(false, err);
        } else {
            let options = {
                    encoding: null,
                    uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name + "/" + f,
                    method: 'DELETE',
                    auth: {
                        'bearer': token
                    }
            };

            rp(options)
            .then(function (data) {

                logger.debug(item.filename + " removed from b2safe server.");

                logger.debug("removing the folder ..");

                let options = {
                        encoding: null,
                        uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name,
                        method: 'DELETE',
                        auth: {
                            'bearer': token
                        }
                };

                rp(options)
                .then(function (data) {
                    logger.debug("folder " + item.handle + " removed.");
                    logger.debug("removing entry from local database ..");
                    db.collection("item").deleteOne({'handle' : item.handle, 'filename': item.filename}, function(err, del) {
                        if(err) {
                            callback(false, err);
                        } else {
                            logger.debug("local database entry removed.");
                            callback(true, null);
                        }
                    });								
                })
                .catch(function (error) {
                    if(error.statusCode === 404) {
                        logger.debug("folder " + item.handle + " not exist on b2safe server.");	
                        logger.debug("removing entry from local database ..");
                        db.collection("item").deleteOne({'handle' : item.handle, 'filename': item.filename}, function(err, del) {
                            if(err) {
                                callback(false, err);
                            } else {
                                logger.debug("local database entry removed.");
                                callback(true, null);
                            }
                        });								
                    }
                });						

            })
            .catch(function (err) {
                logger.error(item.filename + " ERROR " + error.statusCode);
                callback(false, err);
            });

        }

    });

}

function removeSplittedFile(item, db, config, callback) {

    logger.debug("function called itemController.removeSplittedFile");

    var handle2name = item.handle.replace("/", "_");

    loginController.getToken(db, config, async function(token, err) {

        for(var i in item.splitfiles) {
            var splitfile = item.splitfiles[i];

            var options = {
                    encoding: null,
                    uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name + "/" + splitfile.name,
                    method: 'DELETE',
                    auth: {
                        'bearer': token
                    }
            };

            await rp(options)
            .then(function (data) {
                logger.info(splitfile.name + " removed.");
            })
            .catch(function (error) {
                logger.error(splitfile.name + " ERROR " + error.statusCode);
            });


        }

        var options = {
                encoding: null,
                uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name,
                method: 'DELETE',
                auth: {
                    'bearer': token
                }
        };

        await rp(options)
        .then(function (data) {
            logger.info("folder " + item.handle + " removed.");
            db.collection("item").deleteOne({'handle' : item.handle, 'filename': item.filename}, function(err, del) {
                callback(true);
            });								
        })
        .catch(function (error) {
            if(error.statusCode === 404) {
                db.collection("item").deleteOne({'handle' : item.handle, 'filename': item.filename}, function(err, del) {
                    callback(true);
                });								
            }
        });

    });	
}

exports.remove = function(req, res, db, config) {

    logger.debug("function called itemController.remove");

    var handle = req.query.handle;
    var filename = req.query.filename;

    logger.debug(handle + " " + filename);

    db.collection("item").find({'handle' : handle}).toArray(function(err, items) {
        if(err) {
            logger.err(err);
            res.send(err);
        } else {

            if(items.length===1) {
                logger.debug("itemController.remove single file");
                var item = items[0];				
                db.collection("item").updateOne(
                        {'handle' : item.handle, 'filename': item.filename},
                        {$set:
                        {
                            'status' : 'DELETING',
                            'start_time' : new Date().toISOString()
                        }
                        }
                );			

                if(item.splitted===1) {						
                    removeSplittedFile(item, db, config, function (response, err) {
                        if(response) {
                            res.send({response: "DELETED"});
                        } else {
                            db.collection("item").updateOne(
                                    {'handle' : item.handle, 'filename': item.filename},
                                    {$set:
                                    {
                                        'status' : 'ERROR',
                                        'end_time' : new Date().toISOString(),
                                        'replication_error': err
                                    }
                                    }
                            );							
                        }
                    });
                } else {
                    removeSingleFile(item, db, config, function (response, err) {
                        if(response) {
                            res.send({response: "DELETED"});
                        } else {
                            db.collection("item").updateOne(
                                    {'handle' : item.handle, 'filename': item.filename},
                                    {$set:
                                    {
                                        'status' : 'ERROR',
                                        'end_time' : new Date().toISOString(),
                                        'replication_error': err
                                    }
                                    }
                            );							
                        }
                    });					
                }				
            } else {

            }

        }
    });

}