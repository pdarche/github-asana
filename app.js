/**
 * Module dependencies.
 */

var express = require('express')
  , github_asana = require('./lib/github-asana')

var app = module.exports = express.createServer();

// Configuration
app.configure(function(){
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes
app.get('/', function(req,res){res.send("All systems go")})
//app.post('/', github_asana.index);
app.post('/issue-event', github_asana.issueEvent)
//app.post('/test', github_asana.testHandler)
//app.get('/test', github_asana.testEvent)

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log("Listening on " + port);
});
