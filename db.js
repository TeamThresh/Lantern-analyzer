var mongoClient = require('mongodb').MongoClient;
var p; // Promise
var store = module.exports = {};

// db 연결 및 model 생성
store.p = mongoClient.connect('mongodb://localhost').then(function(db) {
	return new Promise(function(s, f) {
		store.resourcemodels = db.collection('resourcemodels');
		store.analyzed = db.collection('analyzed');

		// 필요한 몇몇 쿼리 함수들 warpping
		store.analyzed.isPackageExists = function(packageName) {
			return new Promise(function(s, f) {
				store.analyzed.count({'package_name': packageName}).then(function(c) {
					s(c > 0);
				});
			});
		};

		store.analyzed.putPackage = function(packageName) {
			return new Promise(function(s, f) {
				store.analyzed.insert({'package_name': packageName}).then(function() {
					s();
				});
			});
		};

		store.analyzed.putDump = function(packageName, dump) {
			return new Promise(function(s, f) {
				store.analyzed.update({'package_name': packageName}, {'$push': {'dumps': dump}}, {'upsert': true}).then(function() {
					s();
				});
			});
		};

		s();
	});
});