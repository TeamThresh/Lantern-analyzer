var analyze = require('./analyze');
analyze.work().then(function() {
	console.log('done');
	process.exit();
});