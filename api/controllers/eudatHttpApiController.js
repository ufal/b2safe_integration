const request = require('request');
const logger = require('../logger/logger');

function call_uri(options, callback) {
    request(options, function (error, response, body) {
        logger.debug(response.statusCode);
        logger.debug(body);
        if (error) {
            logger.error(error);
            callback(null, error);
        } else {
            callback(body, null);
        }
    });
}

exports.nameFromHandle = function (h) {
    return h.replace(/\//g, "_").replace(/:/g, "_");
};

exports.remove = function (location, token, config, callback) {

    logger.trace(location);

    let options = {
        uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/"
        + location,
        method: 'DELETE',
        headers: {
            'Authorization': 'bearer ' + token
        },
        json: true
    };

    call_uri(options, callback);

};

exports.createFolder = function (location, token, config, callback) {

    logger.trace();

    let options = {
        uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/"
        + location,
        method: 'HEAD',
        headers: {
            'Authorization': 'bearer ' + token
        },
        json: true
    };

    // HEAD request to check if folder already exists
    request(options, function (error, response, body) {
        if (error) {
            logger.error(error);
            callback(null, error);
        } else {
            logger.debug("Folder not found : " + response.statusCode);
            if (response.statusCode === 404) { // folder not found
                let options = {
                    uri: config.b2safe.url + '/api/registered?path='
                    + config.b2safe.path + "/" + location,
                    method: 'POST',
                    headers: {
                        'Authorization': 'bearer ' + token
                    },
                    json: true
                };
                // POST request to create a folder
                request(options, function (error, response, body) {
                    if (error) {
                        logger.error(error);
                        callback(null, error);
                    } else {
                        logger.debug(body);
                        callback(body, null);
                    }
                });
            } else {
                logger.debug(response);
                callback({}, null);
            }
        }
    });
};

exports.putFile = function (stream, location, force, pid_await, token, config,
                            callback) {
    logger.trace();

    var options = {
        uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/"
        + location + "?force=" + force.toString() + "&pid_await=" + pid_await.toString(),
        method: 'PUT',
        headers: {
            'Authorization': 'bearer ' + token
        },
        formData: {
            'file': stream
        },
        json: true
    };

    call_uri(options, callback);

};

exports.downloadFile = function (location, token, config, callback) {
    logger.trace();

    var options = {
        uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/"
        + location + "?download=true",
        method: 'GET',
        encoding: null,
        headers: {
            'Authorization': 'bearer ' + token
        }
    };

    call_uri(options, callback);

};

exports.testToken = function (token, config, callback) {

    logger.trace();

    var options = {
        uri: config.b2safe.url + '/auth/b2safeproxy',
        method: 'GET',
        timeout: 30000,
        headers: {
            'Authorization': 'bearer ' + token
        },
        json: true
    };

    call_uri(options, callback);

};

exports.authenticate = function (config, callback) {

    logger.trace();

    var options = {
        uri: config.b2safe.url + '/auth/b2safeproxy',
        method: 'POST',
        form: {
            'username': config.b2safe.username,
            'password': config.b2safe.password,
        },
        json: true
    };

    call_uri(options, callback);

};