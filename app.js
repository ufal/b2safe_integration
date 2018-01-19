const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cron = require('node-cron');
const config = require('config');
const logger = require('./api/logger/logger');
const rs = require('./api/crons/replicationScheduler');
const loginController = require('./api/controllers/loginController');

const app = express();

logger.info('Starting application');

if(config.util.getEnv('NODE_ENV') !== 'test') {
    app.use(morgan('combined'));
}

logger.debug("NODE_ENV = " + config.util.getEnv('NODE_ENV'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//make at least the basic available even without db
//- testing
require('./api/routes')(app, null, config);

function initialize(db, config, callback) {
    
    logger.trace();
    
    db.listCollections({name: "item"})
    .next(function(err, collinfo) {
        if (collinfo) {
            logger.debug('"item" collection exists.');
        } else {
            logger.debug('Creating "item" collection.');
            db.createCollection('item');
        }
        db.listCollections({name: "user"})
        .next(function(err, collinfo) {
            if (collinfo) {
                logger.debug('"user" collection exists.');
                callback(null);
            } else {
                logger.debug('Creating "user" collection.');
                db.createCollection('user');
                logger.debug('Updating the token');
                loginController.getToken(db, config, function (token, err) {
                    if(err) {
                        callback(err);
                    } else {
                        logger.debug("Token generated.");
                        callback(null);
                    }
                });
            }
        });	
    });
}

MongoClient.connect(config.db.url, function(err, database) {
    
    logger.trace();
    
    if (err) { return console.log(err); }

    require('./api/routes')(app, database, config);
    initialize(database, config, function(err) {
        if(err) {
            logger.error("Initialization error = " + err);
        } else {
            logger.debug("Initializing the cron job.");	
            cron.schedule(config.replicationCronJob.timer, function() {
                rs.run(database, config, null);
            });
        }
    });
});

module.exports = app;
