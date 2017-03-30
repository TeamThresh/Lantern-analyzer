var db = require('./db');
var analyzer = require('./analyzer');

db.p.then(function() {
	db.resourcemodels.find({}).toArray(function(e, docs) {
		var work = function(idx) {
			if( idx >= docs.length ) {
				console.log('done');
				process.exit();
				return;
			}
			console.log(idx + '/' + docs.length);
			var package = analyzer.parsePackage(docs[idx]);
			db.analyzed.isPackageExists(package.package_name).then(function(b) {
				if( ! b )
					db.analyzed.putPackage(package.package_name);
				db.analyzed.putDump(package.package_name, package.dumps[0]).then(function() {
					work(idx + 1);
				});
			});
		};
		work(0);
	});
});