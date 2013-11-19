var fs     = require('fs'),
    path   = require('path'),
    mu     = require('../lib/mu'),
    pump   = require('util').pump;

require('nodetime').profile({
    accountKey: 'e71ac6593a98f8d405d61ba6f21aaa65dfd4ca67', 
    appName: 'muws'
});

mu.root = path.join(__dirname, 'examples');

var js   = fs.readFileSync(path.join(mu.root, 'complex.js')).toString(),
    text = fs.readFileSync(path.join(mu.root, 'complex.txt')).toString();

js = eval('(' + js + ')');

var RUNS = parseInt(process.argv[2] || "1000000");

mu.compile('complex.html', function (err, compiled) {
  if (err) {
    throw err;
  }
  
  process.stdout.pipe(mu.render('complex.html', js));

  var i = 0, d = new Date();
  
  (function go() {
    if (i++ < RUNS) {
      mu.render('complex.html', js).on('end', function () { go(); });
    }
  }())
  
  process.addListener('exit', function () {
    require('util').debug("Time taken: " + ((new Date() - d) / 1000) + "secs");
  });
});
