var assert = require('assert'),
    fs     = require('fs'),
    path   = require('path'),
    mu     = require('../lib/mu');

mu.root = path.join(__dirname, 'examples');

var testing = {};

function testAsync(template, view, rightResult, name, fn) {
  console.log("Testing: "+name);
  testing[name] = true;
  var buffer = '';

  mu.renderText(template, view)
    .on('data', function (c) { buffer += c.toString(); })
    .on('end', function () {
      if(buffer!==rightResult) {
        console.log(name+'\033[31m[failed]\033[37m'+JSON.stringify(buffer)+'!=='+JSON.stringify(rightResult));
      } else if(testing[name]) {
        delete(testing[name]);
        console.log(name + ' \033[32m[passed]\033[37m');
      } else {
        testing[name] = false;
        console.log(name + '\033[31m[twice end]\033[37m');
      }
      fn();
    });
}

function testGlobals(fn) {
  mu.globals = {test1: true};
  testAsync('{{#test1}}ok1{{/test1}} {{#test2}}ok2{{/test2}} {{#test3}}ok3{{/test3}}', {test2: true}, 'ok1 ok2 ', 'globals', function() {
    mu.globals = {};
    fn();
  });
}

function testArrayInView(fn) {
  mu.globals = {test1: true};
  testAsync('{{#test1}}ok1{{/test1}} {{#test2}}ok2{{/test2}} {{#test3}}ok3{{/test3}}', [{test2: true}, {test3: true}], 'ok1 ok2 ok3', 'array_in_view', function() {
    mu.globals = {};
    fn();
  });
}

testGlobals(function() {
  testArrayInView(function() {
    if(!process.argv[2]) {
      fs.readdir(mu.root, function(err, files) {
        var testsList = prepareTestsList(files);
        startAllTestsSync(testsList, function() {
          startAllTests(testsList);
        });
      });
    } else {
      var testsList = prepareTestsList([process.argv[2], process.argv[3], process.argv[4]]);
      startAllTestsSync(testsList, function() {
        startAllTests(testsList);
      });
    }
  });
});

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
          testing[name] = false;
          console.log(name + '\033[31m[twice end]\033[37m');
        }
      });
  });
}

function startAllTestsSync(testsList, fn) {
  var tests = [];
  testsList.forEach(function (data) {
    tests.push(data);
  });
  (function next() {
    if(tests.length==0) return fn();
    var data = tests.shift();
    var name = data.name;
    var js   = fs.readFileSync(path.join(mu.root, name + '.js')).toString(),
        text = fs.readFileSync(path.join(mu.root, name + '.txt')).toString();
    name += "Sync";
    
    console.log("Testing sync: " + name+ " from "+data.tplName);
    js = eval('(' + js + ')');
    
    testing[name] = true;

    mu.compile(data.tplName, function(err, parsed) {
      var buffer = mu.renderSync(parsed, js);
      if(buffer!==text) {
        console.log(name+'\033[31m[failed]\033[37m'+JSON.stringify(buffer)+'!=='+JSON.stringify(text));
      } else if(testing[name]) {
        delete(testing[name]);
        console.log(name + ' \033[32m[passed]\033[37m');
      } else {
        testing[name] = false;
        console.log(name + '\033[31m[twice end]\033[37m');
      }
      next();
    });
  })();
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
    process.exit(1);
  }
});