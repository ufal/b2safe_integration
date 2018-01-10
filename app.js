let express = require('express');
let MongoClient = require('mongodb').MongoClient;
let bodyParser = require('body-parser');
let config = require('config');
let cron = require('node-cron');
let rs = require('./api/crons/replicationScheduler');
var loginController = require('./api/controllers/loginController');
let morgan = require('morgan');

let app = express();

if(config.util.getEnv('NODE_ENV') !== 'test') {
    app.use(morgan('combined'));
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// make at least the basic available even without db
// - testing
require('./api/routes')(app, null, config);

async function initialize(db, config) {
	await db.listCollections({name: "item"})
    		.next(function(err, collinfo) {
    			if (collinfo) {
    				console.log(collinfo);
    			} else {
    				db.createCollection('item');
    			}
    });
	await db.listCollections({name: "user"})
		.next(function(err, collinfo) {
			if (collinfo) {
				console.log(collinfo);
			} else {
				db.createCollection('user');
				loginController.doLogin(null, null, db, config);
			}
	});	
	
}

MongoClient.connect(config.db.url, function(err, database) {
	if (err) { return console.log(err); }
	
	require('./api/routes')(app, database, config);
	initialize(database, config);
		
	cron.schedule('*/3 * * * * *', function() {
		rs.run(database, config, null);
	});
});

module.exports = app;
