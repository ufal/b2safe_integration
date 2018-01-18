const querystring = require('querystring');
const rp = require('request-promise');
const loginController = require('../controllers/loginController');
const fs = require('fs');
const datetime = require('node-datetime');
const splitFile = require('split-file');
const mime = require('mime-types');
const md5File = require('md5-file');
const path = require('path');
const logger = require('../logger/logger');

var processing = false;

function createFolder(item, db, config, callback) {

	logger.debug("function called replicationScheduler.createFolder");
	logger.debug("createFolder " + item.handle);

	loginController.getToken(db, config, function(token, err) {

		if(err) {
			db.collection("item").updateOne(
					{'handle' : item.handle, 'filename': item.filename},
					{$set: {
						'status' : 'ERROR',
						'end_time' : new Date().toISOString(),
						'replication_error': err }
					});			
		} else {

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
										'replication_error': error.Response.errors }
									});						
						}
					});

				}
			});

		}

	});	
}

function splitReplicateFinalize(item, names, splitverified, error, error_msg, db, config) {
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
}

function splitReplicatePartial(item, names, index, db, config, splitverified, callback) {
	
	logger.debug("function called replicationScheduler.splitReplicatePartial");
	
	if(index >= names.length) {
		logger.debug("replicationScheduler.splitReplicatePartial " + item.filename + " completed.");
		callback(item, names, splitverified, false, null, db, config);
		return;
	}
	
	var name = names[index];
	logger.debug(name);
	
	loginController.getToken(db, config, function(token, err) {

		if(err) {
			db.collection("item").updateOne(
					{'handle' : item.handle, 'filename': item.filename},
					{$set: {
						'status' : 'ERROR',
						'end_time' : new Date().toISOString(),
						'replication_error': err }
					});			
		} else {
	
			var start_time = new Date().toISOString();
		
			var checksum = md5File.sync(name);
			var stats = fs.statSync(name);
			var filesize = stats.size / 1000000; // file size in megabytes
		
			var f = path.basename(name);
			var handle2name = item.handle.replace("/", "_");
		
			var options = {
					uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name + "/" + f,
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
			
			rp(options)
			.then(function (data) {
				logger.debug(data);
				var end_time = new Date().toISOString();
				if(data.Meta.status === 200) {
					var serverchecksum = data.Response.data.checksum;
					var verified = checksum === serverchecksum;
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
							},
							function(err, res) {
								if(!err) {
									splitReplicatePartial(item, names, index+1, db, config, splitverified && verified, callback);							
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
					
					callback(item, names, splitverified, true, data.Response.errors, db, config);
					
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
								'end_time': new Date().toISOString(),
								'replication_error': err
							}
						}
						}
				);
				callback(item, names, splitverified, true, err, db, config);
			});	
		}
	});
}

function splitReplicate(item, token, db, config) {

	logger.debug("function called replicationScheduler.splitReplicate");

	db.collection("item").updateOne( {'handle' : item.handle, 'filename': item.filename}, { $set: { 'splitted': 1 }});

	splitFile.splitFileBySize(item.filename, parseInt(config.b2safe.maxfilesize) * 1000 * 1000)
	.then(function (names){

		var splitverified = true;
		var error_msg = "";

		splitReplicatePartial(item, names, 0, db, config, true, splitReplicateFinalize);

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

	logger.debug("replicating " + item.handle + "/" + item.filename);

	var filesize = item.filesize;
	if(parseInt(filesize) >= parseInt(config.b2safe.maxfilesize)) {
		logger.debug("Its a big file " + filesize + " .. splitting.");
		splitReplicate(item, token, db, config);
		return;
	}

	var f = path.basename(item.filename);
	var handle2name = item.handle.replace("/", "_");

	var options = {
			uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + handle2name + "/" + f,
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
					}
			);						
		} else {
			logger.error(data.Response.errors);
			db.collection("item").updateOne(
					{'handle' : item.handle, 'filename': item.filename},
					{$set: {
						'status' : 'ERROR',
						'end_time' : new Date().toISOString(),
						'replication_error': data.Response.errors }
					}
			);						
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
				}
		);						
	});
}


exports.run = function(db, config, callback) {

	if(processing) {
		return;
	}

	processing = true;

	logger.debug("function called replicationScheduler.run");

	db.collection("item").find({status : "QUEUED"}).toArray(function(err, items) {
		if(err) {
			logger.error(err);
		} else {
			if(items.length>0) {

				logger.info(items.length + " item(s) are available for replication.")

				for(var i in items) {
					var item = items[i];

					logger.info(item.handle + " QUEUED -> IN PROGRESS.")

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
								} else {
									createFolder(item, db, config, doReplicate);
								}
							}
					);
				}
			} else {				
				logger.debug("Nothing to replicate");				
			}
		}
	});

	processing = false;
};