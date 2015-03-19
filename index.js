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

//functions to format tumblr posts

function rowNotEmpty(set, rep, weight){          //return TRUE if row has at least one value that's not an empty string
    if ((set!="")||(rep!="")||(weight!="")){
        return true;
    }
    return false;
}

function rowNotEmptyCardio(time, calories){      //return TRUE if row has at least one value that's not an empty string
    if ((time!="")||(calories!="")){
        return true;
    }
    return false;
}

function entryNotEmpty(entryString){             //return TRUE if entry is not an empty string
    if (entryString!=""){
        return true;
    }
    return false;
}

function addWeightBar(exerName, weight){         //if exercise has weight bar, double weight value and add 45
    if (exerName=="Deadlifts"||exerName=="Bench Press"||exerName=="Squats"||exerName=="Military Press"){
        return (weight*2)+45;
    }
    return weight;
}

//end functstion to format tumblr posts

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
                console.log(data);
                
                var fullEntryText='';
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
                        var name = exerciseData.exerciseName;
                        var tableEntryText="";
                     
                        console.log(exerciseData.dataTableName);
                     
                        if (exerciseData.dataTableName=="dataTableExercise"){
                            for (z=0; z<exerciseData.arrayLength; z++){
                                (function(z) {
                                var sets = exerciseData.sets[z];
                                var reps = exerciseData.reps[z];
                                var weight = exerciseData.weights[z];
                                if (rowNotEmpty(sets, reps, weight)){
                                    weight = addWeightBar(name, weight);
                                    if (name=="Leg Curl Raise"){
                                        if (sets>1){
                                            tableEntryText += newline+sets+front+reps+endLCR1;
                                        } else {
                                            tableEntryText += newline+reps+endLCR0
                                        }
                                    } else {
                                        if (sets>1) {
                                            tableEntryText += newline+sets+front+reps+middle+weight+end;
                                        } else {
                                            tableEntryText += newline+reps+middle+weight+endNoSets;
                                        }
                                    }
                                    client2.hget("max weight", name, function (err, obj) {
                                      if (name=="Pull Ups"){  //special handling for "Pull Ups"
                                            if (weight<obj) {
                                                client2.hset("max weight", name, weight);
                                            }
                                      }else if ((obj==null)||(weight>obj)){
                                          client2.hset("max weight", name, weight);
                                      }
                                    });
                                }
                            })(z);
                            }
                            if (entryNotEmpty(tableEntryText)){
                                fullEntryText += newline+newline+name.bold()+tableEntryText;
                            }
                        } else if (exerciseData.dataTableName=="dataTableCardio"){
                            var time = exerciseData.time;
                            var calories = exerciseData.calories;
                     
                            if (rowNotEmptyCardio(time, calories)){
                                tableEntryText += newline+time+cardioMiddle+calories+cardioEnd;
                                fullEntryText += newline+newline+name.bold()+tableEntryText;
                     
                                client2.hget("max cardio", name, function (err, obj) {
                                  if ((obj==null)||((calories/time)>obj)){
                                    client2.hset("max cardio", name, calories/time);
                                  };
                                });
                            }
                        } else {
                            console.log("Error with constructing entryText");
                        }
                    })()
                }
                if (fullEntryText!=""){
                    client.text('oldstreetsbtb.tumblr.com',
                        { 'title': newName,
                        'body': fullEntryText},
                        function (err, resp) {
                            if (err==null){
                                socket.emit('Tumblr post successful');
                            } else {
                                console.log('Tumblr post not successful.');
                            }
                        }
                    );
                } else {
                    socket.emit('Entry text is empty');  
                }
            });
        });
});