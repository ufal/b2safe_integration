const querystring = require('querystring');
const rp = require('request-promise');
const logger = require('../logger/logger');

function testToken(token, config, callback) {

    logger.debug("function called loginController.testToken");	
    logger.debug(token);

    var options = {
            uri: config.b2safe.url + '/auth/b2safeproxy',
            method: 'GET',
            timeout: 30000,
            auth: {
                'bearer': token
            },
            json: true
    };

    logger.debug("calling /auth/b2safeproxy");

    rp(options)
    .then(function (data){
        logger.debug("loginController.testToken rp->callback");
        logger.debug(data.Meta.status);
        if(data.Meta.status === 200) {
            callback(true, null);
        } else {
            callback(false, null);
        }			
    })
    .catch(function (err) {
        logger.error(err);
        callback(false, err);	
    });	
}


function updateToken(token, db, config, callback) {	

    logger.debug("function called loginController.updateToken");

    db.collection("user").update(
            { 'username' : config.b2safe.username },
            {
                'username' : config.b2safe.username,
                'token' : token
            },
            { upsert: true },
            function (err, res) {
                callback(res, err);
            }
    );
}


function login(db, config, callback) {

    logger.debug("function called loginController.login");

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

    rp(options)
    .then(function (data){
        logger.debug(data);
        if(data.Meta.status === 200) {
            token = data.Response.data.token;
            updateToken(token, db, config, function (res, err){
                if(err) {
                    callback(res, err);
                } else {
                    callback(data, null);
                }
            });				
        } else {
            callback(null, data.Meta);
        }			
    })
    .catch(function (err) {
        callback(null, err);			
    });
}

exports.getToken = function(db, config, callback) {	

    logger.debug("function called loginController.getToken");

    db.collection('user').findOne({'username' : config.b2safe.username}, function(err, result) {
        if(err) {
            callback(null, err);
        } else {
            testToken(result.token, config, function(valid, err) {
                logger.debug("loginController.getToken->testToken->callback");
                if(err) {					
                    logger.debug("loginController.getToken->testToken->callback - error");
                    callback(null, err);
                } else
                    if(valid) {
                        logger.debug("loginController.getToken->testToken->callback - token is valid");
                        callback(result.token, null);
                    } else {
                        logger.debug("loginController.getToken->testToken->callback - token is not valid");
                        login(db, config, function(data, err) {
                            if(err) {
                                callback(null, err);
                            } else{
                                callback(data.Response.data.token, null);
                            }						
                        });
                    }
            });
        }
    });
}

exports.doLogin = function(req, res, db, config, callback=null) {

    logger.debug("function called loginController.doLogin");

    login(db, config, function(response, err) {
        if(res) {
            if(err) {
                res.send(err);
            } else {
                res.send(response);
            }
        }
        if(callback) {
            callback(response, err);
        }
    });	
};
