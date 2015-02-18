var express = require('express');
var app = express();

var server = require('http').Server(app);
var io = require('socket.io')(server);

var json = require('json-update');
var tumblr = require('tumblr.js');
var client;
json.load('keys.json', function(err, obj) {
    client = tumblr.createClient({
        consumer_key: obj.consumer_key,
        consumer_secret: obj.consumer_secret,
        token: obj.token,
        token_secret: obj.token_secret
    });
});

var redis = require("redis");
var client2;
if (process.env.OPENSHIFT_REDIS_PORT) {
    client2 = redis.createClient(process.env.OPENSHIFT_REDIS_PORT,
                             process.env.OPENSHIFT_REDIS_HOST,
                             {auth_pass: process.env.REDIS_PASSWORD});
} else {
    client2 = redis.createClient(6379, "127.0.0.1");
}

server.listen(process.env.OPENSHIFT_NODEJS_PORT || 8080,
              process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1",
  function () {

    var host = server.address().address
    var port = server.address().port

    console.log('App listening at http://%s:%s', host, port)

});

var directory = __dirname + '/';

app.get('/', function (req, res) {
    res.sendFile(directory + 'index.html');
});

app.use('/', express.static('public'));

io.on('connection', function (socket) {
    console.log('got a connection');
    client2.hgetall("max weight", function (err, obj) {
        socket.emit('maxWeightRecord', obj || {})
      });
    client2.hgetall("max cardio", function (err, obj) {
        socket.emit('maxCardioRecord', obj || {})
      });
    socket.on('can I be awesome', function (data) {
        console.log('got request to be awesome (post to tumblr)');
        client.posts('oldstreetsbtb', function (err, resp) {
                numberOfPosts = resp.posts.length-1;
                var i = 0;
                var newName = ''
                while (i<=numberOfPosts) {
                    if (resp.posts[i].title.substring(0, 13)=='Workout Log #'){
                        var titleLength = resp.posts[i].title.length;
                        var oldEntryNumber = resp.posts[i].title.substring(13, titleLength);
                        var newEntryNumber = Number(oldEntryNumber)+1;
                        newName += 'Workout Log #'+newEntryNumber;
                        break;
                        }
                    i++;
                }
                
                var entryText='';
                var newline = "\n";
                var front = "x&nbsp;&nbsp;&nbsp;(";
                var middle = "x&nbsp;&nbsp;&nbsp;";
                var end = "lbs)";
                var endNoSets = "lbs";
                var endLCR0 = "x";
                var endLCR1 = "x)";
                
                var cardioMiddle = "min&nbsp;&nbsp;&nbsp;";
                var cardioEnd = "cal";
                
                for (y=0; y<data.numExerciseIDs; y++){
                    // Wrap for-body in another scope so that variable assignment exerciseData persists.
                    (function() {
                        var exerciseData = data["exerciseID"+y];
                        entryText += newline+newline+exerciseData.exerciseName.bold();
                        if (exerciseData.dataTableName=="dataTableExercise"){
                            for (z=0; z<exerciseData.arrayLength; z++){
                              // Wrap for-body in another scope and pass in z so it persists
                              (function(z) {
                                if (exerciseData.exerciseName=="Leg Curl Raise"){
                                    if (exerciseData.sets[z]>1){
                                        entryText += newline+exerciseData.sets[z]+front+exerciseData.reps[z]+endLCR1;
                                    } else {
                                        entryText += newline+exerciseData.reps[z]+endLCR0
                                    }
                                } else {
                                    if (exerciseData.sets[z]>1) {
                                        entryText += newline+exerciseData.sets[z]+front+exerciseData.reps[z]+middle+exerciseData.weights[z]+end;
                                    } else {
                                        entryText += newline+exerciseData.reps[z]+middle+exerciseData.weights[z]+endNoSets;
                                    }
                                }
                                client2.hget("max weight", exerciseData.exerciseName, function (err, obj) {
                                  if (exerciseData.exerciseName=="Pull Ups"){  //need this to get the properly assign negative max weight
                                        if (exerciseData.weights[z]<obj) {
                                            client2.hset("max weight", exerciseData.exerciseName, exerciseData.weights[z]);
                                        }
                                  }else if ((obj==null)||(exerciseData.weights[z]>obj)){
                                      client2.hset("max weight", exerciseData.exerciseName, exerciseData.weights[z]);
                                  }
                                });
                              })(z);
                            }
                            //client2.hgetall("max weight", function (err, obj) {
                                //console.log(obj);
                            //});
                     
                        } else if (exerciseData.dataTableName=="dataTableCardio"){
                            entryText += newline+exerciseData.time+cardioMiddle+exerciseData.calories+cardioEnd;
                            client2.hget("max cardio", exerciseData.exerciseName, function (err, obj) {
                              if ((obj==null)||((exerciseData.calories/exerciseData.time)>obj)){
                                client2.hset("max cardio", exerciseData.exerciseName, exerciseData.calories/exerciseData.time);
                              };
                            });
                            //client2.hgetall("max cardio", function (err, obj) {
                                //console.log(obj);
                            //});
                        } else {
                            // TODO: consider throwing an error instead
                            console.log("Error with constructing entryText"); 
                        }
                    })()
                }
                
                // Post to Tumblr!
                client.text('oldstreetsbtb.tumblr.com',
                    { 'title': newName,
                    'body': entryText},
                    function (err, resp) {
                        if (err==null){
                            socket.emit('Tumblr post successful');
                        } else {
                            console.log('Tumblr post not successful');
                        }
                    }
                );
            });
    });
});
