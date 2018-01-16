const querystring = require('querystring');
const rp = require('request-promise');
const loginController = require('../controllers/loginController');
const fs = require('fs');
const datetime = require('node-datetime');
const splitFile = require('split-file');
const mime = require('mime-types');
const md5File = require('md5-file');

const logger = require('../logger/logger');


function createFolder(item, db, config, callback) {

	logger.debug("function called replicationScheduler.createFolder");
	
	loginController.getToken(db, config, function(token, err) {

		var handle2name = item.handle.replace("/", "_");

		var options = {
				uri: config.b2safe.url + '/api/registered/' + config.b2safe.path + "/" + handle2name,
				method: 'HEAD',
				auth: {
					'bearer': token
				},
				json: true,
				resolveWithFullResponse: true
		};

		rp(options)
		.then(function (response) {
			logger.debug("folder exists : " + response.statusCode);
			// folder already exists
			callback(item, token, db, config);			
		})
		.catch(function (error) {
			logger.debug("folder not found : " + error.statusCode);
			if(error.statusCode === 404) { // folder not found

				var options = {
						uri: config.b2safe.url + '/api/registered?path=' + config.b2safe.path + "/" + handle2name,
						method: 'POST',
						auth: {
							'bearer': token
						},
						json: true
				};

				rp(options)
				.then(function (data) {			
					callback(item, token, db, config);
				})
				.catch(function (error) {
					if (error.statusCode === 400) { // folder already exists
						callback(item, token, db, config);
					} else {
						db.collection("item").updateOne(
								{'handle' : item.handle, 'filename': item.filename},
								{$set: {
									'status' : 'ERROR',
									'end_time' : new Date().toISOString(),
									'replication_error': data.Response.errors }
								});						
					}
				});

			}
		});

	});	
}

function splitReplicate(item, token, db, config) {
	
	logger.debug("function called replicationScheduler.splitReplicate");
	
	db.collection("item").updateOne( {'handle' : item.handle, 'filename': item.filename}, { $set: { 'splitted': 1 }});
	
	splitFile.splitFileBySize(item.filename, parseInt(config.b2safe.maxfilesize) * 1000 * 1000)
	  .then( async (names) => {
		  
		  var error = false;
		  var splitverified = true;
		  var error_msg = "";
		  
		  for(var i in names) {
			  			  
			  var name = names[i];
			  
			  logger.debug(name);			  

			  var start_time = new Date().toISOString();
				  
			  var checksum = md5File.sync(name);
			  var stats = fs.statSync(name);
			  var filesize = stats.size / 1000000; // file size in megabytes
			  
			  var f = name.split("/");
			  f = f[f.length-1];
			  
			  var options = {
					  uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + item.handle.replace("/", "_") + "/" + f,
					  method: 'PUT',
					  auth: {
						  'bearer': token
					  },
					  formData: {
						  'file' :  fs.createReadStream(name),
						  'pid_await': "true",
						  'force': "true"
					  },			      
					  json: true
				};

			  
				await rp(options)
					.then(function (data) {
						logger.debug(data);
						var end_time = new Date().toISOString();
						if(data.Meta.status === 200) {
							var serverchecksum = data.Response.data.checksum;
							var verified = checksum === serverchecksum;
							splitverified = splitverified && verified;
							db.collection("item").updateOne(
									{'handle' : item.handle, 'filename': item.filename},
									{$addToSet: {
										'splitfiles' : 
											{ 	'name' : f,
												'status': 'COMPLETED',
												'checksum': checksum,
												'filesize': filesize,
												'start_time': start_time,
												'verified' : verified,
												'end_time': end_time,
												'replication_data': data.Response.data
											}
										}
									}
								);						
						} else {
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
											'end_time': end_time,
											'replication_error': data.Response.errors
										}
									}
								}
							);
							error = true;
							error_msg = data.Response.errors;
						}			
					})
					.catch(function (err) {
						logger.error(err);
						db.collection("item").updateOne(
							{'handle' : item.handle, 'filename': item.filename},
							{$addToSet: {
								'splitfiles' : 
									{
										'name' : name,
										'status': 'ERROR',
										'start_time': start_time,
										'end_time': end_time,
										'replication_error': err
									}
								}
							}
						);
						error = true;
						error_msg = err;						
				});
				
				if (error) break;
				
		  }

		  for(var i in names) {
				var name = names[i];
				fs.unlinkSync(name);
		  }		  
		  
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
			  
		  } else {
			  
			  	options = {
					  uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + item.handle.replace("/", "_"),
					  method: 'GET',
					  auth: {
						  'bearer': token
					  },
					  json: true
				};
			  
				db.collection("item").updateOne(
						{'handle' : item.handle, 'filename': item.filename},
						{$set:
							{
								'verified' : splitverified,
								'status' : 'COMPLETED',
								'end_time' : new Date().toISOString()
							}
						});			  
		  }
		  
		  
	  }).catch((err) => {
			db.collection("item").updateOne(
					{'handle' : item.handle, 'filename': item.filename},
					{$set:
						{
							'status' : 'ERROR',
							'end_time' : new Date().toISOString(),
							'replication_error': err
						}
					});
	  });
}

function doReplicate(item, token, db, config) {	
	
	logger.debug("function called replicationScheduler.doReplicate");
	
	var filesize = item.filesize;
	if(parseInt(filesize) >= parseInt(config.b2safe.maxfilesize)) {
		logger.debug("Its a big file " + filesize + " .. splitting.");
		splitReplicate(item, token, db, config);
		return;
	}
	
	var f = item.filename.split("/");
	f = f[f.length-1];
	
	var options = {
			uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + item.handle.replace("/", "_") + "/" + f,
			method: 'PUT',
			auth: {
				'bearer': token
			},
			formData: {
				'file' :  fs.createReadStream(item.filename),
				'pid_await': "true",
				'force': "true"
			},			      
			json: true
	};

	rp(options)
	.then(function (data) {
		logger.debug(data);
		if(data.Meta.status === 200) {
			var checksum = item.checksum;
			var serverchecksum = data.Response.data.checksum;
			var verified = checksum === serverchecksum;
			db.collection("item").updateOne(
					{'handle' : item.handle, 'filename': item.filename},
					{$set: {
						'status' : 'COMPLETED',
						'verified' : verified,
						'end_time' : new Date().toISOString(),
						'replication_data': data.Response.data }
					});						
		} else {
			db.collection("item").updateOne(
					{'handle' : item.handle, 'filename': item.filename},
					{$set: {
						'status' : 'ERROR',
						'end_time' : new Date().toISOString(),
						'replication_error': data.Response.errors }
					});						
		}			
	})
	.catch(function (err) {
		logger.error(err);
		db.collection("item").updateOne(
				{'handle' : item.handle, 'filename': item.filename},
				{$set:
				{
					'status' : 'ERROR',
					'end_time' : new Date().toISOString(),
					'replication_error': err
				}
				});						
	});
}


exports.run = function(db, config, callback) {
	
	logger.debug("function called replicationScheduler.run");
	
	db.collection("item").find({status : "QUEUED"}).toArray(function(err, items) {
		if(err) {
			logger.error(err);
		} else {
			if(items.length>0) {

				logger.info(items.length + " item(s) are available for replication.")

				for(var i in items) {
					var item = items[i];
					db.collection("item").updateOne(
							{'handle' : item.handle, 'filename': item.filename},
							{$set:
								{
									'status' : 'IN PROGRESS',
									'start_time' : new Date().toISOString()
								}
							},
							function(err, res) {
								if(err) {
									logger.error(err);
								} else {
									createFolder(item, db, config, doReplicate);
								}
							});
				}
			} else {				
				logger.debug("Nothing to replicate");				
			}
		}
	});
};