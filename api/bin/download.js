#!/usr/bin/env node

const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const config = require('config');
const program = require('commander');
const fs = require('fs');
const mime = require('mime-types');
const md5File = require('md5-file');
const path = require('path');
const spinner = require('cli-spinner').Spinner;
const splitFile = require('split-file');
const logger = require('../logger/logger');
const loginController = require('../controllers/loginController');
const b2safeAPI = require('../controllers/eudatHttpApiController');

program
.option('-hdl, --handle <handle>', 'The handle of the item')
.option('-o, --output <output>', 'The path of the output folder')
.action(function() {
  console.log('handle: %s output: %s',
      program.handle, program.output);
})
.parse(process.argv);

var handle = program.handle;
var output = program.output;

if(!handle || !output) {
  program.help();
  process.exit(-1);
}

if (!fs.existsSync(output)) {
  console.log('Output path not exists.');
  fs.mkdirSync(output);
}

var stats = fs.lstatSync(output);

if(!stats.isDirectory()) {
  console.log('Output path must be a directory.');
  process.exit(-1);
}

var downloading = new spinner('downloading .. %s');
downloading.setSpinnerString('|/-\\');

var merging = new spinner('merging .. %s');
merging.setSpinnerString('|/-\\');

function downloadSplittedFile(item, token, index, db, config, callback){
  logger.trace();
  if(index>=item.splitfiles.length) {
    merging.start();
    var names = [];
    for(var i in item.splitfiles){
      names.push(output + "/" + item.splitfiles[i].name);
    }    
    var filename = item.replication_data.filename.replace(".info", "");
    splitFile.mergeFiles(names, output + "/" + filename)
    .then(function(){
      merging.stop();
      console.log("Verifying checksum");
      var checksum = md5File.sync(output + "/" + filename);
      if(checksum === item.checksum) {
        console.log("verified.")        
      } else {
        logger.error("unable to verify checksum.")
      }
      for(var i in names) {
        var name = names[i];
        fs.unlinkSync(name);
      }      
      callback(true, null);
    })
    .catch(function(error){
      merging.stop();
      callback(false, error);      
    });
  } else {
    var handle2name = item.handle.replace("/", "_");
    var filename = item.splitfiles[index].name;
    console.log(handle2name + "/" + filename);
    downloading.start(); 
    b2safeAPI.downloadFile(handle2name + "/" + filename, token, config, function(response, error) {
      downloading.stop();
      if(error) {
        console.log(" ERROR");
        callback(null, error);
      } else {
        console.log(" DONE");
        fs.writeFileSync(output + "/" + filename, response, "binary");
        downloadSplittedFile(item, token, index+1, db, config, callback);
      }
    });    
  }
}

function downloadSingleFile(item, token, db, config, callback){
  logger.trace();
  if(item.status === 'COMPLETED') {
    if(item.splitted === 1) {
      downloadSplittedFile(item, token, 0, db, config, callback);
    } else {
      var handle2name = item.handle.replace("/", "_");
      var filename = item.replication_data.filename;      
      console.log(handle2name + "/" + filename);
      downloading.start();
      b2safeAPI.downloadFile(handle2name + "/" + filename, token, config, function(response, error) {
        downloading.stop();
        if(!error) {
          console.log(" DONE");
          fs.writeFileSync(output + "/" + item.replication_data.filename, response, "binary");
          console.log("Verifying checksum");
          var checksum = md5File.sync(output + "/" + item.replication_data.filename);          
          if(checksum === item.checksum) {
            console.log("verified.")
          } else {
            logger.error("unable to verify checksum.")
          }

        } else {
          console.log(" ERROR");
        }
        callback(response, error);        
      });
    }
  }
}

function downloadFolder(items, index, token, db, config, callback) {
  if(index>=items.length) {
    callback(true, null);
  } else {
    var item = items[index];
    downloadSingleFile(item, token, db, config, function(response, error) {
      if(!error){
        downloadFolder(items, index+1, token, db, config, callback);
      } else {
        logger.error(error);
        callback(response, error);
      }
    });
  }
}

function run(db, config, callback) {  
  logger.trace();  
  loginController.getToken(db, config, function(token) {
    db.collection("item").find({'handle' : handle}).toArray(function (error, items) {
      if(error) {
        logger.error(error);
      } else {
        if(items) {
          if(items.length>1) {
            console.log("downloading folder " + handle.replace("/", "_"));
            downloadFolder(items, 0, token, db, config, function(response, error) {
              callback();
            });
          } else if(items.length===1) {
            let item = items[0];
            downloadSingleFile(item, token, db, config, function(response, error) {              
              callback();              
            });
          } else {
            logger.error("No items found for the given handle: " + handle);
          }
        }
      }
    });
  });
}

MongoClient.connect(config.db.url, function(error, database) {
  if (error) {
    logger.error(error);
    return;
  }
  run(database, config, function(){
    database.close();
  });
});