var util = require('util');
var request = require('request');
var GitHubApi = require("github");
var proxy = require('nodeproxy');
var config = require('../config.js');
var asana_key = String(process.env.ASANA_KEY)
var asana_base_url = 'https://app.asana.com/api/1.0';
var userMapping = {
    'pdarche':'6347075638782'
}
var workspaces = {
    'datakind.org' : '6325821815997'
}

var github = new GitHubApi({
    version: "3.0.0",
    timeout: 5000
});

github.authenticate({
    type: "basic",
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_PASS
});

function getCommits(req) {
  var payload;
  if (typeof req.body.payload === 'object') {
      payload = req.body.payload;
  } else {
      payload = JSON.parse(req.body.payload);
  }
  return payload.commits;
}

function normalizeVerb(str) {
    str = str.toLowerCase(str);
    if (str == 'fixing' || str == 'fixes' || str == 'fixed' || str == 'fix' || str == 'close' || str == 'closed' || str == 'closes') {
        return 'fix';
    } else if (str=='addressing' || str == 'referencing' || str == 'addresses' || str == 're' || str == 'ref' || str == 'references' || str == 'see') {
        return 'see';
    } else if (str == 'breaking' || str == 'breaks' || str == 'unfixes' || str == 'reopen' || str == 'reopens' || str == 're-opens' || str == 're-open') {
        return 'break';
    }
    
    throw "Unknown Verb Error";
}

function getTaskActions(commits) {
  var tasks=[];
  for (var i in commits) {
    var regex_verb = /(Referencing|Addressing|References|Addresses|Reopening|Re-opening|Re-opens|Breaking|Unfixes|Unfixing|Reopens|Re-open|Fixing|Closes|Closing|Closed|Breaks|Reopen|Fixed|Close|Fixes|Refs|Ref|Fix|See|Re)/i
    ,regex_id   = /#(\d+)/i
    ,regex_stop = /\w(\.)/i
    ,words    = commits[i].message.split(" ")
    ,current_verb = ''
    ,current_id   = ''
    ,updated_verb_or_id = false; // used to flag when we really ought to push values to the task list

    for (var w in words) {
        var word = words[w]
        ,sub_words = word.split(","); // Retrieves words split by commas
        for (var sw in sub_words){
            // Match verbs/ids out of individual words
            var sub_word = sub_words[sw];
            var id = regex_id.exec(sub_word);
            var verb = regex_verb.exec(sub_word);
            var stop = regex_stop.exec(sub_word);
            
            if (id !== null) {
                current_id = id[1];
                updated_verb_or_id = true;
                
                // For every matched ID, we attach a 'see' task so there is always a comment (regardless of verbs)
                tasks.push({
                    verb:'see'
                    ,id:current_id
                    ,message:commits[i].author.username + ' referenced this issue from a commit\n'+commits[i].id.slice(0,7)+' '+commits[i].message+'\n'+commits[i].url
                });
            } else if (verb !== null) {
                current_verb = verb[1];
                current_id = ''; // We reset the current_id here because a new verb is in play
                updated_verb_or_id = true;
            }
            
            if (current_id != '' && current_verb != '' && updated_verb_or_id) {
                if (normalizeVerb(current_verb)!='see') { // We already track every ID with a 'see' verb above
                    tasks.push({
                        verb:normalizeVerb(current_verb)
                        ,id:current_id
                    });
                }
                updated_verb_or_id = false; // Don't push another element until it is unique
            }
            
            if (stop !== null) { // When we encounter a word that ends with a period, reset.
                current_verb = '',
                current_id = '',
                updated_verb_or_id = false;
            }
        }
        
    }
  }
  
  return tasks;
}

function sendTaskCommentsToAsana(tasks) {
  var auth = 'Basic ' + new Buffer(asana_key+":").toString('base64');
  for (var i in tasks) {
    var task = tasks[i];
    if (task.verb=='fix') {
        request.put({
            url: asana_base_url+"/tasks/"+task.id, 
            json: {data: {completed:true}},
            headers: {"Authorization":auth}
          }, apiCallback);
    } else if (task.verb=='break') {
        request.put({
            url: asana_base_url+"/tasks/"+task.id, 
            json: {data: {completed:false}},
            headers: {"Authorization":auth}
          }, apiCallback);
    } else if (task.verb=='see') {
        request.post({
            url: asana_base_url+"/tasks/"+task.id+"/stories", 
            json: {data: {text:task.message}},
            headers: {"Authorization":auth}
          }, apiCallback);
    }
  }
}

function apiCallback (error, response, body) {
    if (!error && response.statusCode == 200) {
        console.log(body)
    } else {
        console.log(response.statusCode+': '+error);
        console.log(util.inspect(response.body));
    }
}

function githubToAsanaCallback (error, response, body) {
    if (!error && response.statusCode == 201) {
	var is = this.issue
	
	console.log('issue', is.issue.user)
	github.issues.edit({
	  user: is.issue.user.login, 
	  repo: is.repository.name, 
          number: is.issue.number, 
	  title: is.issue.title, 
	  body: 'Asana Task #' + body.data.id + ' ' + is.issue.body
	}, function(err, res){ 
	  if(!err){
	     console.log(res)
	  }
	})
    } else {
        console.log(response.statusCode+': '+error);
        console.log(util.inspect(response.body));
    }
}

function createTaskFromIssue(issue){  
  //console.log('getting a new issue', issue);
  var auth = 'Basic ' + new Buffer(asana_key+":").toString('base64')
    , description = 'GitHub Issue ' + issue.issue.number + ': ' + issue.issue.body + ' ' + issue.issue.html_url
    , assigneeId = userMapping[issue.issue.assignee.login]
    , due_date = null
    , title = issue.issue.title
    , workspaceId = workspaces['datakind.org']
    , data
    , self = this;

  if(issue['issue'].hasOwnProperty('milestone')) 
    due_date = issue.issue.milestone.due_on;

  data = {
    data: { 
      name: title, 
      workspace: workspaceId, 
      assignee: assigneeId, 
      notes: description, 
      due_on: due_date 
    }
  };

  self.issue = issue;
 
  request.post({
    url: asana_base_url + "/tasks/",
    json: data,
    headers: {"Authorization":auth}
  }, proxy(githubToAsanaCallback, self)) //githubToAsanaCallback);
  
}

function createTaskCommentFromIssueComment(comment){
  console.log(comment);
}

exports.index = function(req, res){
  var commits = getCommits(req);
  var actions = getTaskActions(commits);
  sendTaskCommentsToAsana(actions);
  res.send("Updated Asana.");
};

exports.issueEvent = function(req,res){
  var action = req.body.action,
      body = req.body;
  console.log('the action is', action)
  if (action === 'opened') createTaskFromIssue(body)
  if (action === 'created') createTaskCommentFromIssueComment(body)
  res.send('All quiet on the server front')
};


/*
exports.testHandler = function(req,res){
  console.log('request boy', req.body)
  res.send('got it')
}

function test(){
  var auth = 'Basic ' + new Buffer(asana_key+":").toString('base64')
  var dataz = { 
     name: 'New Issue',
     assignee: '6347075638782',
     notes: '',
     due_on: '2013-09-30T07:00:00Z'
  }
 
  console.log('outgoing data is', dataz)

  request.post({
    //url: asana_base_url+'/workspaces/'+ workspaceId+'/tasks/',
    url: '/test',
    json: dataz,
    headers: {'Authorization': auth}
  }, function(error, response, body){ console.log('the res is', response)});
}

exports.testEvent = function(req, res){
  test();
}
*/


