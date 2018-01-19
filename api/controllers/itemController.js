const fs = require('fs');
const mime = require('mime-types');
const md5File = require('md5-file');
const logger = require('../logger/logger');
const loginController = require('./loginController');
const b2safeAPI = require('./eudatHttpApiController');

function addToQueue(handle, fileToReplicate, filesize, checksum, userChecksum,
        db, config, callback) {

    logger.trace();

    db.collection("item").insertOne({
        'handle' : handle,
        'filename' : fileToReplicate,
        'filesize' : filesize,
        'checksum' : checksum,
        'user-checksum' : userChecksum,
        'status' : 'QUEUED'
    }, function(error, result) {
        if (error) {
            logger.error(error);
            callback(null, {
                status : "ERROR",
                replication_error : error
            });
        } else {
            callback({
                response : "QUEUED"
            }, null);
        }
    });
}

function replicateFile(handle, fileToReplicate, userChecksum, db, config,
        callback) {

    logger.trace();

    var checksum = md5File.sync(fileToReplicate);
    var stats = fs.statSync(fileToReplicate);
    var filesize = stats.size / 1000000;

    logger.debug("checksum: " + checksum + " fileSize: " + filesize);

    if (userChecksum) {
        if (checksum !== userChecksum) {
            db
                    .collection("item")
                    .insertOne(
                            {
                                'handle' : handle,
                                'filename' : fileToReplicate,
                                'filesize' : filesize,
                                'checksum' : checksum,
                                'user-checksum' : userChecksum,
                                'status' : 'ERROR',
                                'replication_error' : {
                                    'checksum-error' : 'User provided checksum did not match with the file checksum'
                                }
                            }, function(error, result) {
                                if (error) {
                                    logger.error(error);
                                    callback(null, {
                                        status : "ERROR",
                                        replication_error : error
                                    });
                                } else {
                                    callback(null, {
                                        status : "checksum error"
                                    });
                                }
                            });
        }
    }

    db.collection("item").findOne(
            {
                'handle' : handle,
                'filename' : fileToReplicate
            },
            function(error, item) {
                if (error) {
                    logger.error(error);
                    callback(null, {
                        status : "ERROR",
                        replication_error : error
                    });
                } else {
                    if (item) {
                        if (item.status === 'QUEUED'
                                || item.status === 'IN PROGRESS') {
                            logger.debug("Already in progress.");
                            callback({
                                response : item.status
                            }, null);
                        } else {
                            logger.debug(item.status);
                            logger.debug("requeue.");

                            db.collection("item").updateOne({
                                'handle' : item.handle,
                                'filename' : item.filename
                            }, {
                                $set : {
                                    'status' : 'QUEUED',
                                    'checksum' : checksum,
                                    'replication_error' : null,
                                    'start_time' : null
                                }
                            }, function(err, res) {
                                if (err) {
                                    callback({
                                        status : "ERROR",
                                        replication_error : err
                                    }, err);
                                } else {
                                    callback({
                                        response : 'QUEUED'
                                    }, null);
                                }
                            });
                        }
                    } else {
                        addToQueue(handle, fileToReplicate, filesize, checksum,
                                userChecksum, db, config, function(response,
                                        error) {
                                    callback(response, error);
                                });
                    }
                }

            });
}

function removeSingleFile(item, db, config, callback) {

    logger.trace();

    var handle2name = item.handle.replace("/", "_");
    var f = item.filename.split("/");
    f = f[f.length - 1];

    loginController.getToken(db, config, function(token, error) {

        if (error) {
            callback(false, error);
        } else {
            b2safeAPI.remove(handle2name + "/" + f, token, config, function(
                    data, error) {
                if (error) {
                    if (error.statusCode === 404) {
                        logger
                                .debug(item.handle
                                        + " does not exist on server.");
                    } else {
                        callback(false, error);
                        return;
                    }
                } else {
                    logger.debug(item.filename
                            + " is removed from b2safe server.");
                }

                logger.debug("removing the folder ..");
                b2safeAPI.remove(handle2name, token, config, function(data,
                        error) {
                    if (error) {
                        if (error.statusCode === 404) {
                            logger.debug(item.handle
                                    + " does not exist on server.");
                        } else {
                            callback(false, error);
                            return;
                        }
                    } else {
                        logger.debug(handle2name
                                + " folder is removed from server.");
                    }
                    logger.debug("removing entry from local db ..");
                    db.collection("item").deleteOne({
                        'handle' : item.handle,
                        'filename' : item.filename
                    }, function(error, data) {
                        if (error) {
                            callback(false, error);
                        } else {
                            logger.debug("local database entry removed.");
                            callback(true, null);
                        }
                    });
                });
            });

        }

    });

}

function removeSplittedFileFinalize(item, db, config, callback) {

    logger.trace();

    loginController.getToken(db, config, function(token, error) {
        if (error) {
            logger.error(error);
            callback(false, error);
        } else {
            var handle2name = item.handle.replace("/", "_");

            b2safeAPI.remove(handle2name, token, config, function(data, error) {
                if (error) {
                    if (error.StatusCodeError === 404) {
                        logger.info("folder " + item.handle
                                + " not available on server.");
                        logger.info("removing the local db entry.");
                        db.collection("item").deleteOne({
                            'handle' : item.handle,
                            'filename' : item.filename
                        }, function(error, response) {
                            callback(response, error);
                        });
                    } else {
                        callback(data, error);
                    }
                } else {
                    logger.info("folder " + item.handle + " removed.");
                    db.collection("item").deleteOne({
                        'handle' : item.handle,
                        'filename' : item.filename
                    }, function(error, response) {
                        callback(response, error);
                    });
                }
            });
        }
    });
}

function removeSplittedFilePartial(item, index, db, config, callback) {

    logger.trace();

    if (item.splitfiles) {
        if (index >= item.splitfiles.length) {
            logger.info("itemController.removeSplittedFilePartial "
                    + item.filename + " completed.");
            removeSplittedFileFinalize(item, db, config, callback);
            return;
        }
    } else {
        logger.info("itemController.removeSplittedFilePartial " + item.filename
                + " completed.");
        removeSplittedFileFinalize(item, db, config, callback);
        return;
    }

    loginController.getToken(db, config, function(token, err) {
        if (err) {
            logger.error(err);
            callback(false, err);
        } else {
            var handle2name = item.handle.replace("/", "_");
            var splitfile = item.splitfiles[index];

            b2safeAPI.remove(handle2name + "/" + splitfile, token, config,
                    function(data, error) {
                        if (error) {
                            logger.error(splitfile.name + " ERROR "
                                    + error.statusCode);
                            callback(false, error);
                        } else {
                            logger.debug(splitfile.name + " removed.");
                            removeSplittedFilePartial(item, index + 1, db,
                                    config, callback);
                        }
                    });

        }
    });

}

function removeSplittedFile(item, db, config, callback) {

    logger.trace();

    removeSplittedFilePartial(item, 0, db, config, function(response, error) {

    });
}

exports.listItems = function(req, res, db, config) {

    logger.trace();

    db.collection("item").aggregate([ {
        "$group" : {
            "_id" : "$handle",
            "fileList" : {
                "$push" : {
                    "handle" : "$handle",
                    "filename" : "$filename",
                    "filesize" : "$filesize",
                    "splitted" : "$splitted",
                    "splitfiles" : "$splitfiles",
                    "checksum" : "$checksum",
                    "user-checksum" : "$user-checksum",
                    "verified" : "$verified",
                    "status" : "$status",
                    "start_time" : "$start_time",
                    "end_time" : "$end_time",
                    "replication_data" : "$replication_data",
                    "replication_error" : "$replication_error"
                }
            },
            "count" : {
                "$sum" : 1
            }
        }
    } ], function(error, items) {
        if (error) {
            logger.error(error);
            res.send(error);
        } else {
            res.send(items);
        }
    });
};

exports.status = function(req, res, db, config) {

    logger.trace();

    var handle = req.query.handle;

    db.collection("item").findOne({
        'handle' : handle
    }, function(err, result) {
        if (err) {
            res.send(err);
        } else {
            if (result) {
                res.send({
                    response : result.status
                });
            } else {
                res.send({
                    response : "ERROR"
                });
            }
        }
    });
};

exports.remove = function(req, res, db, config) {

    logger.trace();

    var handle = req.query.handle;
    var filename = req.query.filename;

    logger.debug(handle + " " + filename);

    db.collection("item").find({
        'handle' : handle
    }).toArray(
            function(err, items) {
                if (err) {
                    logger.err(err);
                    res.send(err);
                } else {

                    if (items.length === 1) {
                        logger.debug("itemController.remove single file");
                        var item = items[0];
                        db.collection("item").updateOne({
                            'handle' : item.handle,
                            'filename' : item.filename
                        }, {
                            $set : {
                                'status' : 'DELETING',
                                'start_time' : new Date().toISOString()
                            }
                        });

                        if (item.splitted === 1) {
                            removeSplittedFile(item, db, config, function(
                                    response, err) {
                                if (response) {
                                    res.send({
                                        response : "DELETED"
                                    });
                                } else {
                                    db.collection("item").updateOne(
                                            {
                                                'handle' : item.handle,
                                                'filename' : item.filename
                                            },
                                            {
                                                $set : {
                                                    'status' : 'ERROR',
                                                    'end_time' : new Date()
                                                            .toISOString(),
                                                    'replication_error' : err
                                                }
                                            });
                                }
                            });
                        } else {
                            removeSingleFile(item, db, config, function(
                                    response, err) {
                                if (response) {
                                    res.send({
                                        response : "DELETED"
                                    });
                                } else {
                                    db.collection("item").updateOne(
                                            {
                                                'handle' : item.handle,
                                                'filename' : item.filename
                                            },
                                            {
                                                $set : {
                                                    'status' : 'ERROR',
                                                    'end_time' : new Date()
                                                            .toISOString(),
                                                    'replication_error' : err
                                                }
                                            });
                                }
                            });
                        }
                    } else {

                    }

                }
            });

}

exports.retrieve = function(req, res, db, config) {

    logger.trace();

    var handle = req.query.handle;

    db
            .collection("item")
            .findOne(
                    {
                        'handle' : handle
                    },
                    function(err, result) {
                        if (err) {
                            res.send(err);
                        } else {
                            if (result) {
                                if (result.status === 'COMPLETED') {

                                    var handle2name = handle.replace("/", "_");
                                    var f = result.replication_data.filename;

                                    loginController
                                            .getToken(
                                                    db,
                                                    config,
                                                    function(token, err) {

                                                        b2safeAPI
                                                                .downloadFile(
                                                                        handle2name
                                                                                + "/"
                                                                                + f,
                                                                        token,
                                                                        config,
                                                                        function(
                                                                                data,
                                                                                error) {
                                                                            if (error) {
                                                                                logger
                                                                                        .error(error);
                                                                                res
                                                                                        .send({
                                                                                            response : data.status
                                                                                        });
                                                                            } else {
                                                                                res
                                                                                        .writeHead(
                                                                                                200,
                                                                                                {
                                                                                                    "Transfer-Encoding" : "chunked",
                                                                                                    "Content-Type" : mime
                                                                                                            .lookup(f),
                                                                                                    "Content-Disposition" : "attachment; filename="
                                                                                                            + f
                                                                                                });
                                                                                res
                                                                                        .write(
                                                                                                data,
                                                                                                'binary');
                                                                                res
                                                                                        .end();
                                                                            }
                                                                        });

                                                    });

                                } else {
                                    res.send({
                                        response : result.status
                                    });
                                }
                            } else {
                                res.send({
                                    respnose : 404
                                });
                            }
                        }
                    });
}

exports.replicate = function(req, res, db, config) {

    logger.trace();

    var toReplicate = req.body.filename;
    var handle = req.body.handle;
    var userChecksum = req.body.checksum;

    logger.debug(handle + " " + toReplicate);

    if (handle && toReplicate) {

        if (!fs.existsSync(toReplicate)) {
            logger.error("Uploaded path not exist");
            res.send({
                response : "Uploaded path not exist"
            });
        }

        var stats = fs.statSync(toReplicate);

        if (stats.isFile()) {
            replicateFile(handle, toReplicate, userChecksum, db, config,
                    function(response, error) {
                        res.send(response);
                    });
        } else if (stats.isDirectory()) {
            var files = fs.readdirSync(toReplicate);
            for ( var i in files) {
                var file = files[i];
                var fstat = fs.statSync(toReplicate + "/" + file);
                if (fstat.isFile()) {
                    replicateFile(handle, toReplicate + "/" + file, "", db,
                            config, function(response, error) {
                                res.send(response);
                            });
                }
            }
        }

    } else {
        res.send({
            response : "ERROR"
        });
    }

};