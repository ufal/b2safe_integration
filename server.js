const app = require('./app');
const port = process.env.PORT || 3000;
// security - be careful when binding to another address
const host = '127.0.0.1';
const logger = require('./api/logger/logger');

app.listen(port, '127.0.0.1', function () {
    logger.info('Server started on port: [%d]', port);
});

module.exports = app;