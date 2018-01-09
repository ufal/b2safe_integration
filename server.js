let app = require('./app');
let port = process.env.PORT || 3000;

app.listen(port, function() {
	console.log('Server started on: ' + port);
});

module.exports = app;
