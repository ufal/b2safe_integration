var querystring = require('querystring');
var rp = require('request-promise');
var loginController = require('../controllers/loginController');
var fs = require('fs');
var datetime = require('node-datetime');

function createFolder(item, db, config, callback) {

	console.log("in create folder");

	loginController.getToken(db, config, (token) => {

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
			if(response.statusCode === 200) { //folder already exists
				callback(item, db, config);
			}
			
		})
		.catch(function (error) {
			console.log("folder creation catch : " + error.statusCode);
			if(error.statusCode === 404) { //folder not found

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
						callback(item, db, config);
					} else {
						db.collection("item").updateOne(
								{'handle' : item.handle},
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


function doReplicate(item, db, config) {	
	loginController.getToken(db, config, (token) => {

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
				db.collection("item").updateOne(
						{'handle' : item.handle},
						{$set: {
							'status' : 'COMPLETED',
							'end_time' : new Date().toISOString(),
							'replication_data': data.Response.data }
						});						
			} else {
				db.collection("item").updateOne(
						{'handle' : item.handle},
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
					{'handle' : item.handle},
					{$set:
					{
						'status' : 'ERROR',
						'end_time' : new Date().toISOString(),
						'replication_error': err
					}
					});						
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
							{'handle' : item.handle},
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