var querystring = require('querystring');
var rp = require('request-promise');
var loginController = require('../controllers/loginController');
var fs = require('fs');
var datetime = require('node-datetime');
var splitFile = require('split-file');
var mime = require('mime-types');
var md5File = require('md5-file');


function createFolder(item, db, config, callback) {

	console.log("In create folder");
	
	loginController.getToken(db, config, function(token) {

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
			console.log("folder creation response : " + response.statusCode);
			if(response.statusCode === 200) { // folder already exists
				callback(item, token, db, config);
			}
			
		})
		.catch(function (error) {
			console.log("folder creation catch : " + error.statusCode);
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
					if(data.Meta.status === 200) {
						callback(item, token, db, config);
					} 
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
	
	console.log("In split replication.");
	
	db.collection("item").updateOne( {'handle' : item.handle, 'filename': item.filename}, { $set: { 'splitted': 1 }});
	
	splitFile.splitFileBySize(item.filename, parseInt(config.b2safe.maxfilesize) * 1000 * 1000)
	  .then( async (names) => {
		  
		  var error = false;
		  var splitverified = true;
		  var error_msg = "";
		  
		  for(var i in names) {
			  			  
			  var name = names[i];
			  
			  console.log(name);			  

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
						console.log(data);
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
						console.log(err);
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
	
	var filesize = item.filesize;
	console.log(filesize);
	if(parseInt(filesize) >= parseInt(config.b2safe.maxfilesize)) {
		console.log("Its a big file");
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
		console.log(data);
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
		console.log(err);
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
	db.collection("item").find({status : "QUEUED"}).toArray(function(err, items) {
		if(err) {
			console.log(err);
		} else {
			if(items.length>0) {

				console.log(items.length + " item(s) are available for replication.")

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
									console.log(err);
								} else {
									createFolder(item, db, config, doReplicate);
								}
							});
				}
			} else {				
				console.log("Nothing to replicate");				
			}
		}
	});
};