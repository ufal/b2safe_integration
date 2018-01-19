const rp = require('request-promise');
const fs = require('fs');
const mime = require('mime-types');
const loginController = require('./loginController');
const logger = require('../logger/logger');


exports.remove = function (location, token, config, callback) {
    
    logger.debug("eudatHttpApiController.remove called.");
    
    let options = {
            encoding: null,
            uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + location,
            method: 'DELETE',
            auth: {
                'bearer': token
            }
    };
    
    rp(options)
    .then(function (data) {
        logger.debug(data);
        callback(data, null);
    })
    .catch(function (error) {
        logger.error(error);
        callback(null, error);
    });    
    
}

exports.createFolder = function (location, token, config, callback) {
    
    logger.debug("eudatHttpApiController.createFolder called.");
    
    let options = {
            uri: config.b2safe.url + '/api/registered' + config.b2safe.path + "/" + location,
            method: 'HEAD',
            auth: {
                'bearer': token
            },
            json: true,
            resolveWithFullResponse: true
    };

    // HEAD request to check if folder already exists
    rp(options)
    .then(function (response) {
        logger.debug("folder exists : " + response.statusCode);
        callback({}, null);
    })
    .catch(function (error) {
        logger.debug("folder not found : " + error.statusCode);
        if(error.statusCode === 404) { // folder not found
            let options = {
                    uri: config.b2safe.url + '/api/registered?path=' + config.b2safe.path + "/" + location,
                    method: 'POST',
                    auth: {
                        'bearer': token
                    },
                    json: true
            };
            // POST request to create a folder
            rp(options)
            .then(function (data) {
                logger.debug(data);
                callback(data, null);
            })
            .catch(function (error) {
                logger.error(error);
                if (error.statusCode === 400) { // folder already exists
                    callback({}, null);
                } else {
                    callback(null, error);
                }
            });

        }
    }); 
    
}