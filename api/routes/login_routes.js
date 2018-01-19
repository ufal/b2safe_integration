const loginController = require('../controllers/loginController');

module.exports = function(app, db, config) {

    app.post('/login', function(req, res) {
        loginController.doLogin(req, res, db, config);
    });

};