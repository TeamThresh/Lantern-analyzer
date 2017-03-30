var db = require('./db');

function parsePackage(data) {
	var package = {
		'package_name': data.package_name,
		'dumps': []
	};
	var dump = parseData(data);
	package.dumps.push(dump);
	return package;
}

function parseData(data) {
	var dump = {
		'timestamp': data.launch_time,
		'device_info': data.device_info,
		'dump_interval': data.dump_interval,
		'activities': [],
		'nodes': [],
		'links': []
	};

	var topActivity = undefined;
	var createdActivities = [];
	data.data.forEach(function(d) {
		parseDatum(d, dump.activities, dump.nodes, dump.links, topActivity, createdActivities);
	});

	return dump;
}

function parseDatum(data, activities, nodes, links, topActivity, createdActivities) {
	// render 덤프 데이터
	if( data.type == 'render' ) {
		// onCreated 콜백일때
		if( data.lifecycle_name == 'onCreated' ) {
			// resumed 기다리고 있던 액티비티가 있으면 빼버리고 이 친구를 새로 넣는다
			// 없으면 이 친구를 새로 넣는다
			(function() {
				createdActivities.forEach(function(a) {
					if( a.name == data.activity_name ) {
						a.onCreatedTimestamp = data.callback_time;
						return;
					}
				});
				createdActivities.push({
					'name': data.activity_name,
					'onCreatedTimestamp': data.callback_time;
				});
			})();
		}
		// onResumed 콜백일때
		else if( data.lifecycle_name == 'onResumed' ) {
			// 우선 activities에 있으면 꺼내고 없으면 새로 만들어 꺼내온다
			var a = (function() {
				activities.forEach(function(a) {
					if( a.name == data.activity_name )
						return a;
				});
				var a = {
					'name': data.activity_name,
					'render': [],
					'res': [],
					'crash': []
				};
				activities.push(a);
				return a;
			})();
			// createdActivities 에 있으면 render정보로도 추가
			createdActivities.forEach(function(createdActivity, i) {
				if( createdActivity.name == data.activity_name ) {
					createdActivity.render.push({
						'on_created_timestamp': createdActivity.onCreatedTimestamp,
						'on_resumed_timestamp': data.callback_time,
						'elapsed_time': data.callback_time - createdActivity.onCreatedTimestamp,
						'timestamp': data.callback_time
					});
					createdActivities.splice(i, 1);
				}
			});
			// node와 link 추가
			(function() {
				nodes.forEach(function(n) {
					if( n.name == data.activity_name ) {
						n.usage_count++;
						return;
					}
				});
				nodes.push({
					'name': data.activity_name,
					'usage_count': 1,
					'crash_count': 0
				});
			})();
			// node는 이전에 열려있던 top Activity가 있어야만 가능
			if( topActivity !== undefined ) {
				(function() {
					links.forEach(function(l) {
						if( l.source == topActivity.name && l.target == data.activity_name ) {
							l.value++;
							return;
						}
					});
					l.push({
						'source': topActivity.name,
						'target': data.activity_name,
						'value': 1
					});
				})();
			}

			// top activity로 지정
			topActivity = a;
		}
	}
	// res 덤프일때
	else if( data.type == 'res' ) {

	}
	// crash 덤플일때
	else if( data.type == 'crash' ) {

	}
}