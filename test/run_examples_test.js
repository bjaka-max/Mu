var assert = require('assert'),
    fs     = require('fs'),
    path   = require('path'),
    mu     = require('../lib/mu');

mu.root = path.join(__dirname, 'examples');

var testing = {};

[
  'boolean',
  'carriage_return',
  'comments',
  'complex',
  'date',
  'deep_partial',
  'delimiters',
  'dot_notation',
  'error_not_found',
  'escaped',
  'hash_instead_of_array',
  'inverted',
  'partial',
  'recursion_with_same_names',
  'reuse_of_enumerables',
  'simple',
  'tenthousand',
  'twice',
  'two_in_a_row',
  'unescaped'
].forEach(function (name) {
  var js   = fs.readFileSync(path.join(mu.root, name + '.js')).toString(),
      text = fs.readFileSync(path.join(mu.root, name + '.txt')).toString();
  
  js = eval('(' + js + ')');
  
  var buffer = '';
  console.log("Testing: " + name);
  testing[name] = true;

  mu.compileAndRender(name + '.html', js)
    .on('data', function (c) { buffer += c.toString(); })
    .on('end', function () {
      assert.equal(buffer, text);
      if(testing[name]) {
        delete(testing[name]);
        console.log(name + ' passed');
      } else {
        assert.ok(false, name + ' twice end');
      }
    });
});
