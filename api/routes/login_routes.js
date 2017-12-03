let loginController = require('../controllers/loginController');

module.exports = function(app, db, config) {

	app.post('/login', (req, res) => {
		loginController.doLogin(req, res, db, config);
	});
	
};