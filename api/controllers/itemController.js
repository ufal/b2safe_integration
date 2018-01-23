const fs = require('fs');
const mime = require('mime-types');
const md5File = require('md5-file');
const path = require('path');
const logger = require('../logger/logger');
const loginController = require('./loginController');
const b2safeAPI = require('./eudatHttpApiController');

exports.updateError = function (error, response, item, db, config, callback) {
  db.collection("item").updateOne(
      {'handle' : item.handle, 'filename': item.filename},
      {$set:
      {
        'status' : 'ERROR',
        'end_time' : new Date().toISOString(),
        'replication_error': error
      }
      });
  callback(response, error);
}


function addToQueue(handle, fileToReplicate, filesize, checksum, userChecksum,
    db, config, callback) {

  logger.trace();

  db.collection("item").insertOne({
    'handle' : handle,
    'filename' : fileToReplicate,
    'filesize' : filesize,
    'checksum' : checksum,
    'user-checksum' : userChecksum,
    'status' : 'QUEUED',
    'replication_data' : null,
    'replication_error' : null

  }, function (error, result) {
    if (error) {
      logger.error(error);
      callback(null, error);
    } else {
      callback({response : "QUEUED"}, null);
    }
  });
}

function replicateFile(handle, fileToReplicate, userChecksum, db, config,
    callback) {

  logger.trace();

  var checksum = null;
  var stats = null;
  var filesize = null;
  try{
    checksum = md5File.sync(fileToReplicate);
    stats = fs.statSync(fileToReplicate);
    filesize = stats.size / 1000000;
  } catch(error) {
    logger.error(error);
    return;
  }

  var resolvedPath = path.resolve(fileToReplicate);
  logger.debug(resolvedPath);

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
          }, function (error, result) {
            if (error) {
              logger.error(error);
              callback(null, error);
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
      function (error, item) {
        if (error) {
          logger.error(error);
          callback(null, error);
        } else {
          if (item) {
            if (item.status === 'QUEUED' || item.status === 'IN PROGRESS') {
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
                  'replication_data' : null,
                  'replication_error' : null,
                  'start_time' : null
                }
              }, function (error, res) {
                if (error) {
                  callback(null, error);
                } else {
                  callback({response : 'QUEUED'}, null);
                }
              });
            }
          } else {
            addToQueue(handle, fileToReplicate, filesize, checksum,
                userChecksum, db, config, function (response, error) {
              callback(response, error);
            });
          }
        }

      });
}

function removeSingleFile(item, db, config, callback) {

  logger.trace();

  var handle2name = item.handle.replace("/", "_");
  var f = path.basename(item.filename);

  loginController.getToken(db, config, function (token, error) {

    if (error) {
      callback(false, error);
    } else {
      b2safeAPI.remove(handle2name + "/" + f, token, config, function (data,
          error) {
        if (error) {
          if (error.statusCode === 404) {
            logger.debug(item.handle + " does not exist on server.");
          } else {
            callback(false, error);
            return;
          }
        } else {
          logger.debug(item.filename + " is removed from b2safe server.");
        }

        logger.debug("removing the folder ..");
        b2safeAPI.remove(handle2name, token, config, function (data, error) {
          if (error) {
            if (error.statusCode === 404) {
              logger.debug(item.handle + " does not exist on server.");
            } else {
              callback(false, error);
              return;
            }
          } else {
            logger.debug(handle2name + " folder is removed from server.");
          }
          logger.debug("removing entry from local db ..");
          db.collection("item").deleteOne({
            'handle' : item.handle,
            'filename' : item.filename
          }, function (error, data) {
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

  loginController.getToken(db, config, function (token, error) {
    if (error) {
      logger.error(error);
      callback(false, error);
    } else {
      var handle2name = item.handle.replace("/", "_");
      var f = path.basename(item.filename);

      b2safeAPI.remove(handle2name + "/" + f + ".info", token, config,
          function (data, error) {
        if (error) {
          if (error.StatusCodeError !== 404) {
            callback(data, error);
            return;
          }
        }
        b2safeAPI.remove(handle2name, token, config,
            function (data, error) {
          if (error) {
            if (error.StatusCodeError === 404) {
              logger.info("folder " + item.handle
                  + " not available on server.");
              logger.info("removing the local db entry.");
              db.collection("item").deleteOne({
                'handle' : item.handle,
                'filename' : item.filename
              }, function (error, response) {
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
            }, function (error, response) {
              callback(response, error);
            });
          }
        });

      });

    }
  });
}

function removeSplittedFilePartial(item, index, db, config, callback) {

  logger.trace();

  if (item.splitfiles) {
    if (index >= item.splitfiles.length) {
      logger.info("itemController.removeSplittedFilePartial " + item.filename
          + " completed.");
      removeSplittedFileFinalize(item, db, config, callback);
      return;
    }
  } else {
    logger.info("itemController.removeSplittedFilePartial " + item.filename
        + " completed.");
    removeSplittedFileFinalize(item, db, config, callback);
    return;
  }

  loginController.getToken(db, config,
      function (token, error) {
    if (error) {
      logger.error(error);
      callback(false, error);
    } else {
      var handle2name = item.handle.replace("/", "_");
      var splitfile = item.splitfiles[index];

      b2safeAPI
      .remove(handle2name + "/" + splitfile.name, token, config,
          function (data, error) {
        if (error) {
          if (error.statusCode === 404) {
            removeSplittedFilePartial(item, index + 1, db, config,
                callback);
          } else {
            logger.error(splitfile.name + " ERROR "
                + error.statusCode);
            callback(false, error);
          }
        } else {
          logger.debug(splitfile.name + " removed.");
          removeSplittedFilePartial(item, index + 1, db, config,
              callback);
        }
      });

    }
  });

}

function removeSplittedFile(item, db, config, callback) {

  logger.trace();
  removeSplittedFilePartial(item, 0, db, config, callback);

}

function removeFile(item, db, config, callback) {
  
  logger.trace();

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
    removeSplittedFile(item, db, config, function (response, error) {
      logger.trace();
      if (error) {
        logger.error(error);
        this.updateError(error, false, item, db, config, callback);
      } else {
        callback(true, null);
      }
    });
  } else {
    removeSingleFile(item, db, config, function (response, error) {
      if (response) {
        callback(true, null);
      } else {
        db.collection("item").updateOne({
          'handle' : item.handle,
          'filename' : item.filename
        }, {
          $set : {
            'status' : 'ERROR',
            'end_time' : new Date().toISOString(),
            'replication_error' : error
          }
        });
        callback(false, error);
      }
    });
  } 
  
}

function removeFolderFinalize(handle, db, config, callback) {

  logger.trace();

  loginController.getToken(db, config, function (token, error) {
    if (error) {
      logger.error(error);
      callback(false, error);
    } else {
      var handle2name = handle.replace("/", "_");

      b2safeAPI.remove(handle2name, token, config,
          function (data, error) {
        if (error) {
          if (error.StatusCodeError === 404) {
            logger.info("folder " + handle + " not available on server.");
          }
          callback(data, error);
        } else {
          logger.info("folder " + handle + " removed.");
          callback(data, error);
        }
      });

    }
  });
}

function removeFolder(handle, items, index, db, config, callback) {
  
  logger.trace();
  
  if(index >= items.length) {
    removeFolderFinalize(handle, db, config, function(response, error){
      callback(response, error);
    });
  } else {
    var item = items[index];
    removeFile(item, db, config, function(response, error) {
      if(error) {        
      } else {  
        removeFolder(handle, items, index+1, db, config, callback);
      }
    });
  }
}

exports.listItems = function (req, res, db, config) {

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
        },
      },
      "count" : {
        "$sum" : 1
      }
    }},
    {"$sort" : {
      "end_time" : -1
    }    
  } ], function (error, items) {
    if (error) {
      logger.error(error);
      res.send(error);
    } else {
      logger.debug(items);
      res.send(items);
    }
  });
};

exports.status = function (req, res, db, config) {

  logger.trace();

  var handle = req.query.handle;

  db.collection("item").findOne({
    'handle' : handle
  }, function (error, result) {
    if (error) {
      res.send(error);
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

exports.remove = function (req, res, db, config) {

  logger.trace();

  var handle = req.query.handle;
  var filename = req.query.filename;

  logger.debug(handle + " " + filename);
  
  var query = {'handle' : handle};
  if(filename) {
    query['filename'] = filename;
  }

  db.collection("item").find(query).toArray(function (error, items) {
    if (error) {
      logger.error(error);
      res.send(error);
    } else {
      if (items.length === 1) {
        logger.debug("itemController.remove single file");
        var item = items[0];
        removeFile(item, db, config, function(response, error) {
          if(error) {
            res.send("{response: ERROR}");
          } else {
            res.send("{response: DELETED}");
          }
        });
      } else if(items.length > 1) {
        logger.debug("deleting folder " + handle);
        removeFolder(handle, items, 0, db, config, function(response, error) {
          if(error) {
            res.send("{response: ERROR}");
          } else {
            res.send("{response: DELETED}");
          }          
        });
      }
    }
  });

}

exports.retrieve = function (req, res, db, config) {

  logger.trace();

  var handle = req.query.handle;

  db.collection("item").findOne(
      {
        'handle' : handle
      },
      function (error, result) {
        if (error) {
          res.send(error);
        } else {
          if (result) {
            if (result.status === 'COMPLETED') {

              var handle2name = handle.replace("/", "_");
              var f = result.replication_data.filename;

              loginController.getToken(db, config, function (token, error) {
                if(error) {
                  res.send({
                    response : error
                  });                  
                } else {
                  b2safeAPI.downloadFile(handle2name + "/" + f, token, config,
                      function (data, error) {
                    if (error) {
                      logger.error(error);
                      res.send({
                        response : data.status
                      });
                    } else {
                      res.writeHead(200, {
                        "Transfer-Encoding" : "chunked",
                        "Content-Type" : mime.lookup(f),
                        "Content-Disposition" : "attachment; filename=" + f
                      });
                      res.write(data, 'binary');
                      res.end();
                    }
                  });
                }
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

exports.replicate = function (req, res, db, config) {

  logger.trace();

  var toReplicate = req.body.filename;
  var handle = req.body.handle;
  var userChecksum = req.body.checksum;

  logger.debug(handle + " " + toReplicate);

  if (handle && toReplicate) {

    handle = handle.trim();
    toReplicate = toReplicate.trim();

    if (!fs.existsSync(toReplicate)) {
      logger.error("Uploaded path not exist");
      res.send({
        response : "Uploaded path not exist"
      });
    }

    var stats = fs.statSync(toReplicate);

    if (stats.isFile()) {
      replicateFile(handle, toReplicate, userChecksum, db, config, function (
          response, error) {
        res.send(response);
      });
    } else if (stats.isDirectory()) {
      var files = fs.readdirSync(toReplicate);
      for ( var i in files) {
        var file = files[i];
        var fstat = fs.statSync(toReplicate + "/" + file);
        if (fstat.isFile()) {
          replicateFile(handle, toReplicate + "/" + file, "", db, config,
              function (response, error) {

          });
        }
      }
      res.send({
        response : 'QUEUED'
      });
    }

  } else {
    res.send({
      response : "ERROR"
    });
  }

};