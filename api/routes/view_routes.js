var fs = require('fs');

module.exports = function(app, db, config) {

	app.get('/', (req, res) => {
		res.writeHead(200, {'Content-Type': 'text/html'});
        fs.createReadStream('api/views/index.html').pipe(res);		
	});
	
};