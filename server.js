const app = require('./app');
const port = process.env.PORT || 3000;
const logger = require('./api/logger/logger');

app.listen(port, function () {
  logger.trace();
  logger.info('Server started on: ' + port);
});

module.exports = app;
