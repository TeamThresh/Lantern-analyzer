var mongoose = require('mongoose');
mongoose.connect('localhost');
var activitiesCollection = mongoose.model('activities', mongoose.Schema({}, {strict: false}), 'activities');

activitiesCollection.insertMany([{'a': 'b'}, {'c':'d'}], function(error, result) {
	console.log(result);
});