var querystring = require('querystring');
var http = require("http");

exports.doLogin = function(req, res, db, config) {



};

exports.getToken = function(db, config) {
	
	var token = null;
	
	db.collection('user').find({'status' : true}).toArray(function(err, results) {
		if(results.length == 0) {
			
		} else {
			token = results[0].token;
		}
	});
	
	return token;
};


login = function(db, config) {
	
	var resopnse = "";
	
	var post_data = querystring.stringify({
		'username' : config.b2safe.username,
		'password': config.b2safe.password
	});		
	
	var post_options = {
	      host: config.b2safe.url,
	      path: '/auth/b2safeproxy',
	      method: 'GET',
	      headers: {
	          'Content-Type': 'application/x-www-form-urlencoded',
	          'Content-Length': Buffer.byteLength(post_data)
	      }	      
	};
	
	var request = http.request(post_options, function(response) {
		response.setEncoding('utf8');
		response.on('data', function (data) {
			if(data.Meta.status === "200") {
				var token = data.Response.token;
				
				updateToken(token, db);
				
			} else {
				response = "{'status' : 500}";
			}
		});				
	});
	
	request.on('error', function(err) {
		res.send(err);
	});
	
	request.end();	
};


updateToken = function (token, db, config) {
	
	var user = db.collection('user');
	user.findandmodify({
		query: {'username' : config.b2safe.username},
		update: {$set: {'valid' : false}}
	});
	
	
	
};