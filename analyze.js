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
				'packageName': packageName,
				'nodes': [],
				'links': [],
				addNode: function(activityName) { // activity(node) 추가 함수
					// 이미 있는 노드라면 usage 증가시킨다
					for( var i=0; i<this.nodes.length; i++ ) {
						if( this.nodes[i].name == activityName ) {
							this.nodes[i].usage++;
							return;
						}
					}
					// 없으니 새로 만든다
					this.nodes.push(new Node(activityName));
				},
				addCrashNode: function(activityName) { // activity(node)에 크래시 추가
					for( var i=0; i<this.nodes.length; i++ ) {
						if( this.nodes[i].name == activityName ) {
							this.nodes[i].crashCount++;
							return;
						}
					}
				},
				addLink: function(sourceActivityName, targetActivityName) { // relation(link) 추가 함수
					// precondition: 이미 등록되어있는 액티비티이어야한다
					// 액티비티 이름가지고 nodes 배열에서의 index를 찾는다
					var sourceNodeIndex;
					var targetNodeIndex;
					for( var i=0; i<this.nodes.length; i++ ) {
						if( this.nodes[i].name == sourceActivityName )
							sourceNodeIndex = i;
						else if( this.nodes[i].name == targetActivityName )
							targetNodeIndex = i;
					}
					// 두 노드의 index 가지고 이미 있으면 value를 1 증가시킨다
					for( var i=0; i<this.links.length; i++ ) {
						if( this.links[i].source == sourceNodeIndex
							&& this.links[i].target == targetNodeIndex ) {
							this.links[i].value++;
							return;
						}
					}
					// 없으면 새로 만든다
					this.links.push(new Link(sourceNodeIndex, targetNodeIndex));
				}
			};
		};
		var Node = function(activityName) { // activity(node) 생성자
			return {
				'name': activityName,
				'usage': 1,
				'value': 0,
				'crashCount': 0
			};
		};
		var Link = function(sourceNodeIndex, targetNodeIndex) { // relation(link) 생성자
			return {
				'source': sourceNodeIndex,
				'target': targetNodeIndex,
				'value': 1
			};
		};

		// 일단 모든 raw 데이터를 가져온다
		console.log('모든 raw 요청 쿼리');
		var p = resourcemodels.find({}).exec();
		p = p.then(function(err, docs) {
			return new Promise(function(resolve, reject) {
				console.log('쿼리 반환 완료');
				// 하나씩 순화하면서 activity stack 캡처한다
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
					// data 를 돌면서 activity 스택이 변하면 반영한다
					var stack = [];
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









