const loginRoutes = require('./login_routes');
const itemRoutes = require('./item_routes');
const viewRoutes = require('./view_routes');

module.exports = function (app, db, config) {
  viewRoutes(app);
  if (db) {
    loginRoutes(app, db, config);
    itemRoutes(app, db, config);
  }
};