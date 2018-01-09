var querystring = require('querystring');
var rp = require('request-promise');
var fs = require('fs');
var mime = require('mime-types');
var md5File = require('md5-file');
var loginController = require('./loginController');

exports.listItems = function(req, res, db, config) {
	db.collection("item").aggregate([ {"$group" : {
											"_id":"$handle",
											"fileList": {
												"$push" : {
													"handle": "$handle",
													"filename": "$filename",
													"splitted": "$splitted",
													"checksum": "$checksum",
													"user-checksum": "$user-checksum",
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
	
	var handle = req.query.handle;
	
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
							res.writeHead(200, {"Transfer-Encoding": "chunked",
								"Content-Type" : mime.lookup(f),
								"Content-Disposition" : "attachment; filename=" + f
								});
							res.write(data, 'binary');
							res.end();
							
						})
						.catch(function (error) {
							console.log(error);
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

async function replicateFile(handle, fileToReplicate, userChecksum, db, config) {
	var response = {};
	var checksum = md5File.sync(fileToReplicate);
	var stats = fs.statSync(fileToReplicate);
	var filesize = stats.size / 1000000; // file size in megabytes
	
	if(userChecksum){
		if(checksum !== userChecksum) {
			await db.collection("item").insertOne({'handle' : handle, 'filename' : fileToReplicate, 'filesize': filesize, 'checksum': checksum, 'user-checksum': userChecksum, 'status' : 'ERROR', 'replication_error': {'checksum-error': 'User provided checksum did not match with the file checksum'}}, function(err, result) {
				if(err) {				
					response = {status: "ERROR", replication_error: err};
				} else {
					response = {status: "checksum error"};
				}
			});
			return response;
		}
	}
	
	await db.collection("item").findOne({'handle' : handle, 'filename': fileToReplicate}, function(err, result) {		
		if(err) {
			response = {status: "ERROR", replication_error: err};
		} else {
			if(result) {
				if(result.status === 'QUEUED') {
					response = {response: "ALREADY QUEUED"};
				} else {
					response = {response: result.status};
				}
			} else {
				response = addToQueue(handle, fileToReplicate, filesize, checksum, userChecksum, db, config);
			}
		}
				
	});	
	return response;
}

async function addToQueue(handle, fileToReplicate, filesize, checksum, userChecksum, db, config) {
	var response = {};
	await db.collection("item").insertOne({'handle' : handle, 'filename' : fileToReplicate, 'filesize': filesize, 'checksum': checksum, 'user-checksum': userChecksum, 'status' : 'QUEUED'}, function(err, result) {
		if(err) {
			response = {status: "ERROR", replication_error: err};
		} else {
			response = {response: "QUEUED"};
		}
	});	
	return response;
}

exports.replicate = function(req, res, db, config) {
	
	var toReplicate = req.body.filename;
	var handle = req.body.handle;
	var userChecksum = req.body.checksum;
	
	if(handle && toReplicate) {
		
		if(!fs.existsSync(toReplicate)) {
			res.send({response: "Uploaded path not exist"});
		}
		
		var stats = fs.statSync(toReplicate);
		
		if(stats.isFile()) {
			var response = replicateFile(handle, toReplicate, userChecksum, db, config);
			res.send(response);
		} else
		if(stats.isDirectory()){			
			fs.readdirSync(toReplicate).forEach(file => {
				var fstat = fs.statSync(toReplicate + "/" + file);
				if(fstat.isFile()) {
					var response = replicateFile(handle, toReplicate + "/" + file, "", db, config);
				}
			});
		}
		
	} else {
		res.send({response: "ERROR"});
	}
	
};

exports.getItemStatus = function(req, res, db, config) {
	
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


exports.remove = function(req, res, db, config) {		
	
	var handle = req.query.handle;
	
	db.collection("item").findOne({'handle' : handle}, function(err, result) {
		if(err) {
			res.send(err);
		} else {
			if(result) {
				loginController.getToken(db, config, function(token) {					
					var options = {
							encoding: null,
							uri: config.b2safe.url + '/api/registered' + result.replication_data.path,
							method: 'DELETE',
							auth: {
								'bearer': token
							}
					};

					rp(options)
					.then(function (data) {						
						db.collection("item").deleteOne({'handle' : handle}, function(err, del) {
							res.send({response: "DELETED"});
						});
					})
					.catch(function (error) {
						console.log(error);
					});
				});				
			} else {
				res.send({response: "ERROR"});
			}
		}		
	});	
		
};