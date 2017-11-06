var querystring = require('querystring');
var http = require("http");

var loginController = require('./loginController');

exports.listItems = function(req, res, db, config) {

	//get the token already exist
	var token = loginController.getToken(db, config);
	
	var post_options = {
	      host: config.b2safe.url,
	      path: '/api/registered' + config.b2safe.path,
	      auth: 'Bearer ' + token,
	      method: 'GET',
	};
	
	var request = http.request(post_options, function(response) {
		response.setEncoding('utf8');
		response.on('data', function (data) {
			if(data.Meta.status === "200") {
				res.send(data.Response.data);
			} else {
				res.send(data.Meta);
			}
		});				
	});
	
	request.on('error', function(err) {
		res.send(err);
	});
	
	request.end();

};

exports.replicate = function(req, res, db, config) {
	
	var fileToReplciate = req.query.filename;
	var handle = req.query.handle;
	
	//put the file in dababase
	//handle as id
	
	var response = '{"pid" : ' + handle + ', "status" : "queued"}';
	res.send(response);
	
};

exports.getStatus = function(req, res, db, config) {
	
	var handle = req.query.handle;
	
	var status = '';
	// get status from database
	
	var response = '{"pid" : ' + handle + ', "status" : ' + status + '}';
	res.send(response);
	
};

exports.retrieve = function(req, res, db, config) {		
	
	var handle = req.query.handle;	
	
};


exports.remove = function(req, res, db, config) {		
	
	var handle = req.query.handle;	
	
};