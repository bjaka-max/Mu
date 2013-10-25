var assert = require('assert'),
    fs     = require('fs'),
    path   = require('path'),
    mu     = require('../lib/mu');

mu.root = path.join(__dirname, 'examples');

var testing = {};

if(!process.argv[2]) {
  fs.readdir(mu.root, function(err, files) {
    var testsList = prepareTestsList(files);
    startAllTests(testsList);
  });
} else {
  var testsList = prepareTestsList([process.argv[2], process.argv[3], process.argv[4]]);
  startAllTests(testsList);
}

function prepareTestsList(fileList) {
  var testsList = [];
  var checkList = {};
  fileList.forEach(function (fileName) {
    var ext = path.extname(fileName);
    var name = path.basename(fileName, ext);
    if(!checkList[name]) {
      checkList[name] = {};
    }
    checkList[name][ext] = true;
  });
  for(var name in checkList) {
    var tplName;
    if(checkList[name]['.html']) {
      tplName = name + '.html';
    }
    if(checkList[name]['.mustache']) {
      tplName = name + '.mustache';
    }
    var existTpl = tplName;
    var existJs = checkList[name]['.js'];
    var existResult = checkList[name]['.txt'];
    if(existTpl && existJs && existResult) {
      testsList.push({tplName:tplName, name:name});
    }
  }
  return testsList;
}

function startAllTests(testsList) {
  testsList.forEach(function (data) {
    var name = data.name;
    var js   = fs.readFileSync(path.join(mu.root, name + '.js')).toString(),
        text = fs.readFileSync(path.join(mu.root, name + '.txt')).toString();
    
    console.log("Testing: " + name+ " from "+data.tplName);
    js = eval('(' + js + ')');
    
    var buffer = '';
    testing[name] = true;

    mu.compileAndRender(data.tplName, js)
      .on('data', function (c) { buffer += c.toString(); })
      .on('end', function () {
        if(buffer!==text) {
          console.log(name+'\033[31m[failed]\033[37m'+JSON.stringify(buffer)+'!=='+JSON.stringify(text));
        } else if(testing[name]) {
          delete(testing[name]);
          console.log(name + ' \033[32m[passed]\033[37m');
        } else {
          console.log(name + '\033[31m[twice end]\033[37m');
        }
      });
  });
}

process.on('exit', function() {
  var failedTests = [];
  for(var failedTest in testing) {
    failedTests.push(failedTest);
  }
  if(failedTests.length==0) {
    console.log('All done.');
  } else {
    console.log('Failed \033[31m', failedTests, '\033[37m');
  }
});