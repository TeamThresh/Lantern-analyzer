module.exports = {
	work: function() {
		var mongoose = require('mongoose');

		// mongoose promise 플러그인 적용
		mongoose.Promise = global.Promise;
		// db 연결 및 model 생성
		var db = mongoose.createConnection('localhost');
		var lanternRawDB = db.useDb('lantern_raw_db');
		var resourcemodels = lanternRawDB.model('resourcemodels', mongoose.Schema({}, {strict: false}), 'resourcemodels');
		var analyzerDB = db.useDb('analyzer_db');
		var activitiesCollection = analyzerDB.model('activities', mongoose.Schema({}, {strict: false}), 'activities');

		/**
		 * activity 분석
		 */
		var p; // promise 용
		var packages = []; // package 관리
		var Package = function(packageName) { // 패키지 생성자
			return {
				'package_name': packageName,
				'dumps': [],
			};
		};
		var Dump = function(timestamp, deviceInfo, dumpInterval) { // Dump 생성자
			return {
				'timestamp': timestamp,
				'device_info': deviceInfo,
				'dump_interval': dumpInterval,
				'activities': [],
				// activity 추가용 함수
				addActivity: function(name, onCreatedCallbackTime, onResumedCallbackTime) {
					// 이미 있으면 render 정보 추가
					this.activites.forEach(function(a) {
						if( a.name == name ) {
							a.addRender(onCreatedCallbackTime, onResumedCallbackTime);
							return;
						}
					});
					// 없으면 액티비티 새로 만들고 render정보 삽입
					var a = new Activity(name);
					a.addRender(onCreatedCallbackTime, onResumedCallbackTime);
				},
				'nodes': [],
				addNode: function(name) { // activity(node) 추가 함수
					// 이미 있는 노드라면 usage 증가시킨다
					for( var i=0; i<this.nodes.length; i++ ) {
						if( this.nodes[i].name == name ) {
							this.nodes[i].usage++;
							return;
						}
					}
					// 없으니 새로 만든다
					var node = {
						'name': name,
						'usageCount': 1,
						'crashCount': 0
					};
					this.nodes.push(node);
				},
				addCrashNode: function(activityName) { // activity(node)에 크래시 추가
					for( var i=0; i<this.nodes.length; i++ ) {
						if( this.nodes[i].name == activityName ) {
							this.nodes[i].crashCount++;
							return;
						}
					}
				},
				'links': [],
				addLink: function(sourceActivityName, targetActivityName) { // relation(link) 추가 함수
					// 두 노드의 index 가지고 이미 있으면 value를 1 증가시킨다
					for( var i=0; i<this.links.length; i++ ) {
						if( this.links[i].source == sourceActivityName
							&& this.links[i].target == targetActivityName ) {
							this.links[i].value++;
							return;
						}
					}
					// 없으면 새로 만든다
					var link = {
						'source': sourceActivityName,
						'target': targetActivityName,
						'value': 1
					};
					this.links.push(link);
				}
			};
		};
		// Activity 생성자
		var Activity = function(name) {
			return {
				'name': name,
				'render': [],
				addRender: function(onCreatedCallbackTime, onResumedCallbackTime) {
					this.render.push({
						'on_created_callback_time': onCreatedCallbackTime,
						'on_resumed_callback_time': onResumedCallbackTime,
						'elapsed_time': onResumedCallbackTime - onCreatedCallbackTime,
						'timestamp': onResumedCallbackTime
					});
				},
				'res': [],
				addRes: function(threads, memory, cpu, vmstat, timestamp) {
					this.res.push({
						'threads': threads,
						'memory': memory,
						'cpu': cpu,
						'vmstat': vmstat,
						'timestamp': timestamp
					});
				},
				'crash': [],
				addCrash: function(name, timestamp, stacktrace) {
					this.crash.push({
						'name': name,
						'timestamp': timestamp,
						'stacktrace': stacktrace
					});
				}
			};
		};
		// 일단 모든 raw 데이터를 가져온다
		console.log('모든 raw 요청 쿼리');
		var p = resourcemodels.find({}).exec();
		p = p.then(function(docs) {
			return new Promise(function(resolve, reject) {
				console.log('쿼리 반환 완료');
				// dump들 순회
				docs.forEach(function(doc, idx) {
					// 먼저 package name이 새로운 거라면 새로 추가한다
					// 이미 있는 거라면 그대로 가져온다
					doc = doc._doc;
					console.log(idx + '번째 패키지 ' + doc.package_name);
					var package = (function() {
						for( var i=0; i<packages.length; i++ ) {
							if( packages[i].packageName == doc.package_name )
								return packages[i];
						}
						var package = new Package(doc.package_name);
						packages.push(package);
						return package;
					})();

					// onCreated만 호출된 상태의 activity들
					var tempActivities = [];
					// 현재 열려있는 activity (activities 배열의 원소를 reference한다)
					var topActivity = {};
					// data 순회
					doc.data.forEach(function(data) {
						// res 덤프라면 액티비티 스택가지고 작업
						if( data.type == 'res' ) {
							// app이나 app.activity_stack 없으면 건너뛰기
							if( ! data.app || ! data.app.activity_stack )
								return;
							// 직전 스택과 비교하여 변화가 있는지(증가변화만)
							if( stack.length < data.app.activity_stack.length ) {
								// 새로 추가된 액티비티에 대해 사용량 증가시킨다
								// 어디까지 똑같은지 알아내고
								var i = 0;
								for( i = 0; i<stack.length; i++ ) {
									if( stack[i] != data.app.activity_stack[i] )
										break;
								}
								// 틀린 곳부터 새로운 액티비티로 인식한다
								for( i=i; i<data.app.activity_stack.length; i++ ) {
									// 새로운 노드로 등록시킨다(이미 있으면 알아서 usage증가)
									package.addNode(data.app.activity_stack[i]);
									// 직전 액티비티와 현재 액티비티를 relation(link) 관계 시킨다
									// 만약 stack상에서 root activity라면 link target이 될 수 없다
									if( i == 0 )
										continue;
									// 아니면 같은 액티비티가 스택에 연속되게 뜬거면 무시한다
									else if( data.app.activity_stack[i - 1] == data.app.activity_stack[i] )
										continue;
									// 이전거와 현재꺼를 연결시킨다
									package.addLink(data.app.activity_stack[i-1],
										data.app.activity_stack[i]);
								}
							}
							// 변화됐든 안됐든 지금 덤프의 액티비티 스택을 저장한다
							stack = data.app.activity_stack;
							// crash 덤프라면
						} else if( data.type == 'crash' ) {
							// 직전까지 열려있던 액티비티 스택의 마지막것을 기준으로 오류를 등록한다
							// 액티비티 스택이 없다면.. res덤프 찍히기전에 crash 덤프가 찍힌 것. 무시한다
							if( stack.length > 0 ) {
								var lastActivityName = stack[stack.length - 1];
								package.addCrashNode(lastActivityName);
							}
							// render 정보로 UI 로딩 속도와 현재 열려있는 activity를 얻는다
						} else if( data.type == 'render' ) {
							// onCreated일때 꼬여있을 수 있으니 onResumed까지 안왔던 같은 이름의 activity의 callback_time을 갱신한다
							if( data.lifecycle_name == 'onCreated' ) {
								(function() {
									for( var activity in tempActivities ) {
										if( activity.name == data.activity_name ) {
											// 이미 있는 (onResumed를 기다리는) 액티비티가 있었으면
											// 꼬인것이므로 새로온 onCreated의 callbakc time으로 갱신
											activity.onCreatedCallbackTime = data.callback_time;
											return;
										}
									}
									// 없으면 새로 만든다
									// 주의할 것은 tempActivities에 들어가는 activity는 진짜 activity 객체가 아니다
									tempActivities.push({
										'name': data.activity_name,
										'onCreatedCallbackTime': data.callback_time
									});
								})();
								// onResumed 라면
							} else if( data.lifecycle_name == 'onResumed' ) {
								// 여기서는 되게 중요한게
								// onCreated와 짝을 이루어 onResumed이 된거면
								// 그 시간을 같이 기록하고 걸린시간을 elaspedTime에 넣으면 되지만
								// 짝이 없는 onResumed가 있다면
								// 아마 화면나갔거나 화면을 껏다가 다시 킨것이므로
								// 그냥 rendering 정보는 추가하지 않고 topActivity로 등록시킨다
								(function() {
									for( var i = 0; i < tempActivities; i++ ) {
										var activity = tempActivities[i];
										// tempActivities 에서 이미 기다리고 있던 activity 정보가 있다면
										if( activity.name == data.activity_name ) {
											activity.onResumedCallbackTime = data.callback_time;
											// 빼내서 activities에 추가
											tempActivities.splice(i, 1);
											// topActivity로 지정
											topActivity = activities[activities.length - 1];
											// 새로운 액티비티가 열렸으니 link(relation)을 추가한다
											package
									}
								})();
							}
						}
					}); // end doc.data.forEach
				}); // end docs.forEach

				// analyzer DB에 저장
				activitiesCollection.remove({}, function(err) {
					activitiesCollection.insertMany(packages, function(err, result) {
						console.log(result.length + '개의 패키지 저장 완료');
						resolve();
					});
				});
			}); // end Promise
		}); // end of p.then
		return p;
	}
};