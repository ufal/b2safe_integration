let fs = require('fs');

module.exports = function(app) {

	app.get('/', (req, res) => {
		res.writeHead(200, {'Content-Type': 'text/html'});
        fs.createReadStream('api/views/index.html').pipe(res);
	});

    app.get('/alive', (req, res) => {
        res.json({
            status: "alive"
        });
    });

};