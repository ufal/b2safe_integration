var express = require('express');
var MongoClient = require('mongodb').MongoClient;
var bodyParser = require('body-parser');
var config = require('./config/config');
var cron = require('node-cron');
var rs = require('./api/crons/replicationScheduler');

var app = express();
module.exports = app;

app.use(bodyParser.urlencoded({ extended: true }));

MongoClient.connect(config.db.url, (err, database) => {
	if (err) { return console.log(err); }
	require('./api/routes')(app, database, config);
	cron.schedule('*/2 * * * * *', () => {
		rs.run(database, config, null);
	});
});
