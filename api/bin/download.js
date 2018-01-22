#!/usr/bin/env node

const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const config = require('config');
const program = require('commander');
const rp = require('request-promise');
const fs = require('fs');
const mime = require('mime-types');
const md5File = require('md5-file');
const loginController = require('../controllers/loginController');
const spinner = require('cli-spinner').Spinner;
const splitFile = require('split-file');

const logger = require('../logger/logger');

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


MongoClient.connect(config.db.url, function(err, database) {
  if (err) { return console.log(err); }
  run(database, config);
});

var downloading = new spinner('downloading .. %s');
downloading.setSpinnerString('|/-\\');

var merging = new spinner('merging .. %s');
merging.setSpinnerString('|/-\\');


var token = null;


function run(db, config) {

  loginController.getToken(db, config, function(t) {	

    token = t;

    db.collection("item").findOne({'handle' : handle}, async function(err, item) {		
      if(err) {
        res.send(err);
      } else {
        var names = [];
        if(item) {
          if(item.status === 'COMPLETED') {
            if(item.splitted === 1) {
              for(var i in item.splitfiles) {
                var splitfile = item.splitfiles[i];
                names.push(output + "/" + splitfile.name);
                console.log(splitfile.name);
                await download_file(splitfile.name, handle, db, config);
              }

              merging.start();
              var f = item.filename.split("/");
              f = f[f.length-1];							
              await splitFile.mergeFiles(names, output + "/" + f)
              .then(function (){
                for(var i in names) {
                  var name = names[i];
                  fs.unlinkSync(name);
                }
                merging.stop();
                console.log(" Done");
                console.log("Verifying ...")
                var checksum = md5File.sync(output + "/" + f);
                if(checksum === item.checksum) {
                  console.log("File Download Completed.")
                } else {
                  console.log("checksum failed.")
                }
                db.close();
              })
              .catch(function (err){
                for(var i in names) {
                  var name = names[i];
                  fs.unlinkSync(name);
                }
                merging.stop();
                console.log(err);
                db.close();
              });							

            } else {
              await download_file(result.replication_data.filename, handle, db, config);
              db.close();
            }
          } else {
          }
        } else {
          console.log("Handle not found.")
        }
      }
    });	
  });
}


async function download_file(filename, handle, db, config) {

  var handle2name = handle.replace("/", "_");

  var options = {
      encoding: null,
      uri: config.b2safe.url + "/api/registered" + config.b2safe.path + "/" + handle2name + "/" + filename,
      method: "GET",
      auth: {
        "bearer": token
      },
      formData: {
        "download" :  "true"
      },		
  };

  downloading.start();

  await rp(options)
  .then(function (data) {
    fs.writeFileSync(output + "/" + filename, data, "binary");
    console.log(" COMPLETED")
  })
  .catch(function (error) {
    console.log(" ERROR");		
  });

  downloading.stop();
}
