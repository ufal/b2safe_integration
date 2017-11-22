var querystring = require('querystring');
var rp = require('request-promise');
var fs = require('fs');
var mime = require('mime-types')
var md5File = require('md5-file')

var loginController = require('./loginController');

exports.listItems = function(req, res, db, config) {
	db.collection("item").find({}).toArray(function(err, items) {
		if(err) {
			console.log(err);
		} else {
			res.send(items);
		}
	});
};

exports.retrieve = function(req, res, db, config) {
	
	console.log("in retrieve");	
	var handle = req.query.handle;
	
	db.collection("item").findOne({'handle' : handle}, function(err, result) {		
		if(err) {
			res.send(err);
		} else {
			console.log(result);
			if(result) {
				if(result.status === 'COMPLETED') {
					
					var handle2name = handle.replace("/", "_");
					var f = result.replication_data.filename;
					
					loginController.getToken(db, config, (token) => {					
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

exports.replicate = function(req, res, db, config) {
	
	console.log("item controller replicate");
	
	var fileToReplciate = req.body.filename;
	var handle = req.body.handle;
	
	if(handle && fileToReplciate) {
		
		if(!fs.existsSync(fileToReplciate)) {
			res.send({response: "Uploaded file not exist"});
		}
		
		var checksum = md5File.sync(fileToReplciate);
		
		db.collection("item").findOne({'handle' : handle}, function(err, result) {		
			if(err) {
				res.send(err);
			} else {
				if(result) {
					if(result.status === 'QUEUED') {
						res.send({response: "ALREADY QUEUED"});
					} else {
						res.send({response: result.status});
					}
				} else {
					db.collection("item").insertOne({'handle' : handle, 'filename' : fileToReplciate, 'checksum': checksum, 'status' : 'QUEUED'}, function(err, result) {
						if(err) {
							res.send(err);
						} else {
							res.send({response: "QUEUED"});
						}
					});
				}
			}
					
		});
	} else {
		res.send({response: "ERROR"});
	}
	
};

exports.getStatus = function(req, res, db, config) {
	
	var handle = req.query.handle;
	
	console.log("in getStatus");	
	
	db.collection("item").findOne({'handle' : handle}, function(err, result) {
		if(err) {
			res.send(err);
		} else {
			console.log(result);
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
			console.log(result);
			if(result) {
				loginController.getToken(db, config, (token) => {					
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