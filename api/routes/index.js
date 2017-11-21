const loginRoutes = require('./login_routes');
const itemRoutes = require('./item_routes');
const viewRoutes = require('./view_routes');

module.exports = function(app, db, config) {
	loginRoutes(app, db, config);
	itemRoutes(app, db, config);
	viewRoutes(app, db, config);
};