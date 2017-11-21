
var itemController = require('../controllers/itemController');

module.exports = function(app, db, config) {

	app.get('/list', (req, res) => {
		itemController.listItems(req, res, db, config);
	});
	
	app.post('/replicate', (req, res) => {
		itemController.replicate(req, res, db, config);
	});

	app.get('/status', (req, res) => {
		itemController.getStatus(req, res, db, config);
	});
	
	app.get('/retrieve', (req, res) => {
		console.log("routes retrieve");
		itemController.retrieve(req, res, db, config);
	});

	app.get('/remove', (req, res) => {
		itemController.retrieve(req, res, db, config);
	});

};