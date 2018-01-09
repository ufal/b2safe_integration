var querystring = require('querystring');
var rp = require('request-promise');

function testToken (token, config, callback) {
	
	var options = {
	      uri: config.b2safe.url + '/auth/b2safeproxy',
	      method: 'GET',
	      auth: {
              'bearer': token
	      },
	      json: true
	};
		
	rp(options)
		.then(function (data){
			if(data.Meta.status === 200) {
				callback(true);
			} else {
				callback(false);
			}			
		})
		.catch(function (err) {
			callback(false);	
		});	
}


async function updateToken(token, db, config) {	
	await db.collection("user").update(
		{ 'username' : config.b2safe.username },
		{
			'username' : config.b2safe.username,
			'token' : token
		},
		{ upsert: true }
	);
}


async function login(db, config, callback) {
	
	console.log("In Login");
	
	var token = "";
	var response = "";
	
	var options = {
	      uri: config.b2safe.url + '/auth/b2safeproxy',
	      method: 'POST',
	      formData: {
	  		'username' : config.b2safe.username,
			'password': config.b2safe.password,
	      },
	      json: true
	};
	
	await rp(options)
		.then(function (data){
			console.log(data);
			if(data.Meta.status === 200) {
				token = data.Response.data.token;
				updateToken(token, db, config);
				response = data;				
			} else {
				response = data;
			}			
		})
		.catch(function (err) {
			response = err;			
		});
	
	callback(response);
}

exports.getToken = function(db, config, callback) {	
	db.collection('user').findOne({'username' : config.b2safe.username}, function(err, result) {
		if(err) {
			callback(err);
		} else {
			testToken(result.token, config, function(valid) {
				if(valid) {
					callback(result.token);
				} else {
					login(db, config, function(data) {
						console.log(data.Response);
						callback(data.Response.data.token);
					});
				}
			});
		}
	});
}
 
exports.doLogin = function(req, res, db, config) {
	login(db, config, function(response) {
		res.send(response);
	});	
};
