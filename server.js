var express = require('express');
var app = express();
var server = require("http").createServer(app);
var io = require('socket.io')(server);
var log = require('winston');
var redis = require('redis');
var dotenv = require('dotenv').config();
var db = redis.createClient({url:process.env.DB_URL});

var port = process.env.PORT;

var users_conntected = {};

log.add(log.transports.File, { filename: 'log.txt', json: false });
log.addColors({ info : 'green' });
log.remove(log.transports.Console);
log.add(log.transports.Console, { level: 'debug', colorize:true });

app.use('/', express.static(__dirname + "/public"));


var maxLog = 100;

var storeMessage = function(data, type) {
    var message = JSON.stringify({data: data, type: type});
    
    db.lpush("messages", message, function(err, response) {
        if(err) console.log(err);
        
        db.ltrim("messages", 0, maxLog-1);
        
        
    });
    
}



io.on('connection', function(client) {
    log.info("Client connected " + client.id);
    
    client.on('messages', function (data) {
        var msg = { username: users_conntected[client.id], msg: data };
        client.broadcast.emit('messages', msg);
        storeMessage(msg, 'messages');
        log.info("("+msg.username+"): " + msg.msg);
    });
    
    client.on('username', function (data) {
        var user_list = [];
        var match = false;
        for (var index in users_conntected) {
            if (data.toLowerCase() === users_conntected[index].toLowerCase()) {
                match = true;
                break;
            }
            user_list.push(users_conntected[index]);
        }
        
        if(match) {
            client.emit('username', "Taken");
        }
        else {
            user_list.push(data);
            users_conntected[client.id] = data;
            db.lrange("messages", 0, -1, function(err, messages) {
                if(err) console.log(err);
                messages = messages.reverse();
                messages.forEach(function(message){
                    message = JSON.parse(message);
                    if(message.type == "join")
                        client.emit("join", message.data);
                    else if(message.type =="left")
                        client.emit("left", message.data);
                    else if(message.type == "messages")
                        client.emit("messages", message.data);
                    else if(message.type == "system")
                        client.emit("system", message.data);
                });
            client.broadcast.emit("join", data );
            storeMessage(data, 'join');
            client.emit('username', user_list);
            log.info("Joined: " + data + " - " + client.id);
                
            });

        }
    });
    
    client.on("update", function(data) {
        var user_list = [];
        
        for (var index in users_conntected) {
            user_list.push(users_conntected[index]);
        }
        
        client.emit("update", user_list);
    })
    
    client.on('disconnect', function(data) {
       var username = users_conntected[client.id]
       client.broadcast.emit("left", username);
       storeMessage(username, 'left');
       log.info("Disconnected: " + username + " - " + client.id);
       delete users_conntected[client.id];
    });
    
});


app.get('/', function (req, res) {
    res.sendFile(__dirname + "/index.html");
});

server.listen(port, function() {
    console.log("Server listening on port " + port);
    storeMessage({ username: 'System', msg: "The server rebooted." } , 'system');
});
