const loginRoutes = require('./login_routes');
const itemRoutes = require('./item_routes');

module.exports = function(app, db, config) {
	loginRoutes(app, db, config);
	itemRoutes(app, db, config);
};