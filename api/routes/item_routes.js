const itemController = require('../controllers/itemController');

module.exports = function(app, db, config) {

    app.get('/list', function(req, res) {
        itemController.listItems(req, res, db, config);
    });

    app.post('/replicate', function(req, res) {
        itemController.replicate(req, res, db, config);
    });

    app.get('/itemstatus', function(req, res) {
        itemController.getItemStatus(req, res, db, config);
    });

    app.get('/retrieve', function(req, res) {
        console.log("routes retrieve");
        itemController.retrieve(req, res, db, config);
    });

    app.delete('/remove', function(req, res) {
        itemController.remove(req, res, db, config);
    });

};