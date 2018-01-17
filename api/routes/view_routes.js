const fs = require('fs');

module.exports = function(app) {

	app.get('/', function(req, res) {
		res.writeHead(200, {'Content-Type': 'text/html'});
        fs.createReadStream('api/views/index.html').pipe(res);
	});
	
	app.get('/script.js', function(req, res) {
		res.writeHead(200, {'Content-Type': 'text/script'});
        fs.createReadStream('api/views/js/script.js').pipe(res);
	});	

    app.get('/status', function(req, res) {
        res.json({
            status: "alive"
        });
    });

};