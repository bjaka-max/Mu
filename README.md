# MuwS - a fast, streaming Node.js Mustache engine (with slots)
[![Build Status](https://travis-ci.org/bjaka-max/MuwS.png?branch=master)](https://travis-ci.org/bjaka-max/MuwS)

## About slots

If your a use Mustache for generating html, your are must use construction like this:

###template.mustashe:
```text
{{>header}}{{!include html before content}}
content text
{{>footer}}{{!include html after content}}
```
###header.mustashe:
```html
<html>
    <head>
    </head>
    <body>
```
###footer.mustashe:
```html
    </body>
</html>
```
It is ugly, and split tags. I suggest use the slot mechanism.


###template.mustashe:
```text
{{@parent}}{{!include parent template}}
{{[content}}content text{{/content}}{{!fill content slot}}
{{/parent}}
```
###parent.mustashe:
```html
<html>
    <head>
    </head>
    <body>
    {{]content}}default content{{/content}}{{!define content slot}}
    </body>
</html>
```

## Install

    npm install muws

## Usage

There are a few ways to use mu 0.5. Here is the simplest:
```javascript
var mu = require('muws');

mu.root = __dirname + '/templates'
mu.compileAndRender('index.html', {name: "john"})
  .on('data', function (data) {
    console.log(data.toString());
  });
```
Here is an example mixing it with the http module:
```javascript
var http = require('http')
  , util = require('util')
  , mu   = require('muws');

mu.root = __dirname + '/templates';

  http.createServer(function (req, res) {

  var stream = mu.compileAndRender('index.html', {name: "john"});
  stream.pipe(res);

}).listen(8000);
```
Taking that last example here is a little trick to always compile the templates
in development mode (so the changes are immediately reflected).
```javascript
var http = require('http')
  , util = require('util')
  , mu   = require('muws');

mu.root = __dirname + '/templates';

http.createServer(function (req, res) {

  if (process.env.NODE_ENV == 'DEVELOPMENT') {
    mu.clearCache();
  }

  var stream = mu.compileAndRender('index.html', {name: "john"});
  stream.pipe(res);

}).listen(8000);
```

## Usage in express (http://expressjs.com/)

###start.js:
```javascript
var express = require('express');
var app = express();
var mu   = require('muws');
app.engine('mustache', mu.__express);

app.get('/', function(req, res){
    res.render('index.mustache', {text:'Hello World'});
});

app.listen(8000);
```
###views/index.mustashe:
```html
<html>
    <head>
    </head>
    <body>
    {{text}}
    </body>
</html>
```

## API

    mu.root

      A path to lookup templates from. Defaults to the working directory.

    mu.globals

      A object. Fields from this object will use in each view in application.

    mu.compileAndRender(String templateName, Object view)

      Returns: Stream

      The first time this function is called with a specific template name, the
      template will be compiled and then rendered to the stream. Subsequent
      calls with the same template name will use a cached version of the compiled
      template to improve performance (a lot).


    mu.compile(filename, callback)

      Returns nil
      Callback (Error err, Any CompiledTemplate)

      This function is used to compile a template. Usually you will not use it
      directly but when doing wierd things, this might work for you. Does not
      use the internal cache when called multiple times, though it does add the
      compiled form to the cache.


    mu.compileText(String name, String template, Function callback)

      Returns nil
      Callback (err, CompiledTemplate)

      Similar to mu.compile except it taks in a name and the actual string of the
      template. Does not do disk io. Does not auto-compile partials either.


    mu.render(Mixed filenameOrCompiledTemplate, Object view)

      Returns Stream

      The brother of mu.compile. This function takes either a name of a template
      previously compiled (in the cache) or the result of the mu.compile step.

      This function is responsible for transforming the compiled template into the
      proper output give the input view data.

    mu.renderSync(Mixed filenameOrCompiledTemplate, Object view)

      Returns rendered string

      Synchronous version of mu.render.

    mu.renderText(String template, Object view, Object partials)

      Returns Stream

      Like render, except takes a template as a string and an object for the partials.
      This is not a very performant way to use mu, so only use this for dev/testing.


    mu.clearCache(String templateNameOrNull)

      Clears the cache for a specific template. If the name is omitted, clears all cache.



