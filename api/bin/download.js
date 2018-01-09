#!/usr/bin/env node

var express = require('express');
var MongoClient = require('mongodb').MongoClient;
var config = require('config');
var program = require('commander');
var rp = require('request-promise');
var fs = require('fs');
var mime = require('mime-types');
var md5File = require('md5-file');
var loginController = require('../controllers/loginController');


program
	.option('-h, --handle <handle>', 'The handle of the item')
	.option('-o, --output <output>', 'The path of the output folder')
	.action(function() {
		console.log('handle: %s output: %s',
				program.handle, program.output);
	})
	.parse(process.argv);


MongoClient.connect(config.db.url, function(err, database) {
	if (err) { return console.log(err); }
	run(database, config);
	database.close();
});


function run(db, config) {
	
	var handle = program.handle;
	var output = program.output;
	
	db.collection("item").findOne({'handle' : handle}, function(err, result) {		
		if(err) {
			res.send(err);
		} else {
			if(result) {
				if(result.status === 'COMPLETED') {
					
					var handle2name = handle.replace("/", "_");
					var f = result.replication_data.filename;
					
					loginController.getToken(db, config, function(token) {					
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
							console.log(data.body);
						})
						.catch(function (error) {
							console.log(error);
						});
					});
					
				} else {
					
				}
			} else {
				console.log("Handle not found.")
			}
		}
	});	
		
}
