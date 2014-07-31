var util   = require('util'),
    Buffer = require('buffer').Buffer,
    renderer = require('./renderer'),
    
    carriage = '__MU_CARRIAGE__',
    carriageRegExp = new RegExp(carriage, 'g'),
    newline = '__MU_NEWLINE__',
    newlineRegExp = new RegExp(newline, 'g');

exports.parse = function (template) {
  var parser = new Parser(template);
  return parser.tokenize();
}

function Parser(template) {
  this.template = template.replace(/\r\n/g, carriage)
                          .replace(/\n/g, newline);
  
  this.render   = new renderer.tokenRenders.Multi();
  this.partials = [];
  this.buffer   = this.template;
  this.state    = 'static'; // 'static' or 'tag'
  this.currentLine = '';
  this.sections = [['', this.render]];
  
  this.setTag(['{{', '}}']);
}

Parser.prototype = {
  tokenize: function () {
    while (this.buffer) {
      this.state === 'static' ? this.scanText() : this.scanTag();
    }
    
    if (this.sections.length>1) {
      throw new Error('Encountered an unclosed section.');
    }

    this.optimizeRender();
    
    return {partials: this.partials, tokens: this.render};
  },
  optimizeRender:function () {
    function optimize (render) {
      if(render.render) {
        render.render = optimize(render.render);
      } else if (render.renders && render.renders.length==1) {
        return render.renders[0];
      };
      return render;
    }
    this.render = optimize(this.render);
  },

  currentRender: function () {
    return this.sections[this.sections.length-1][1];
  },
  
  setTag: function (tags) {
    this.otag = tags[0] || '{{';
    this.ctag = tags[1] || '}}';
  },
  
  scanText: function () {
    var index = this.buffer.indexOf(this.otag);
    
    if (index === -1) {
      index = this.buffer.length;
    }
    
    var content = this.buffer.substring(0, index)
                             .replace(carriageRegExp, '\r\n')
                             .replace(newlineRegExp, '\n');
    
    if (content !== '') {
      var tokenRender = new renderer.tokenRenders.Static(content);
      this.currentRender().add(tokenRender);
    }
   
    var line = this.currentLine + content;

    this.currentLine = line.substring(line.lastIndexOf('\n') + 1, line.length);
    this.buffer = this.buffer.substring(index + this.otag.length);
    this.state  = 'tag';
  },
  
  scanTag: function () {
    var ctag    = this.ctag,
        matcher = 
      "^" +
      "\\s*" +                           // Skip any whitespace
                                         
      "(#|\\^|/|=|!|<|>|&|\\[|\\]|\\@|\\{)?" +       // Check for a tag type and capture it
      "\\s*" +                           // Skip any whitespace
      "(.+?)" +  // Capture the text inside of the tag
      "\\s*" +                           // Skip any whitespace
      "\\}?" +                           // Skip balancing '}' if it exists
      "(?:" + e(ctag) + ")" +            // Find the close of the tag
                                         
      "(.*)$"                            // Capture the rest of the string
      ;
    matcher = new RegExp(matcher);
    
    var match = this.buffer.match(matcher);
    
    if (!match) {
      throw new Error('Encountered an unclosed tag: "' + this.otag + this.buffer + '"');
    }
    
    var sigil     = match[1],
        content   = match[2].trim(),
        remainder = match[3],
        tagText   = this.otag + this.buffer.substring(0, this.buffer.length - remainder.length);
    switch (sigil) {
    case undefined:
      var tokenRender = new renderer.tokenRenders.ETag(content, tagText);
      this.currentRender().add(tokenRender);
      break;
      
    case '>':
    case '<':
      var tokenRender = new renderer.tokenRenders.Partial(content, tagText);
      this.currentRender().add(tokenRender);

      this.partials.push(content);
      break;
      
    case '{':
    case '&':
      var tokenRender = new renderer.tokenRenders.UTag(content, tagText);
      this.currentRender().add(tokenRender);
      break;
    
    case '!':
      // Ignore comments
      break;
    
    case '=':
      content = content.substring(0, content.length-1);
      this.setTag(content.split(' '));
      break;
    
    case '#':
    case '^':
      var multiRender = new renderer.tokenRenders.Multi();
      var tokenRender = sigil === '#' ? new renderer.tokenRenders.Section(content, multiRender, tagText) : new renderer.tokenRenders.InvertedSection(content, multiRender, tagText);
      
      this.currentRender().add(tokenRender);
      this.sections.push([content, multiRender, tokenRender]);
      break;
    
    case ']':
      var multiRender = new renderer.tokenRenders.Multi();
      var tokenRender = new renderer.tokenRenders.LocateSlot(content, multiRender, tagText);
      
      this.currentRender().add(tokenRender);
      this.sections.push([content, multiRender, tokenRender]);
      break;
    
    case '[':
      var multiRender = new renderer.tokenRenders.Multi();
      var tokenRender = new renderer.tokenRenders.DefineSlot(content, multiRender, tagText);
      
      this.currentRender().add(tokenRender);
      this.sections.push([content, multiRender, tokenRender]);
      break;

    case '@':
      var multiRender = new renderer.tokenRenders.Multi();
      var bodyRender = new renderer.tokenRenders.DefineSlot('body', multiRender);
      var parentMultiRender = new renderer.tokenRenders.Multi();
      var partialRender = new renderer.tokenRenders.ParentPartial(content, parentMultiRender, tagText);

      this.partials.push(content);
      
      this.currentRender().add(partialRender);
      this.sections.push([content, multiRender, partialRender, function() {
        var filtredRenders = [];
        multiRender.renders.forEach(function(render) {
          if (render instanceof renderer.tokenRenders.DefineSlot) {
            parentMultiRender.add(render);
          } else {
            filtredRenders.push(render);
          }
        });
        parentMultiRender.add(bodyRender);
        multiRender.renders = filtredRenders;
      }]);
      break;
    
    case '/':
      var res    = this.sections.pop() || [],
          name   = res[0],
          render = res[2],
          endFunc = res[3];
      if (!name) {
        throw new Error('Closing unopened ' + content);
      } else if (name !== content) {
        throw new Error("Unclosed section " + name);
      }
      if(typeof endFunc == "function") {
        endFunc();
      }
      render.setEndText(tagText);
      break;
    }
    
    this.buffer = remainder;
    this.state  = 'static';
  }
}


//
// Used to escape RegExp strings
//
function e(text) {
  // thank you Simon Willison
  if(!arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  
  return text.replace(arguments.callee.sRE, '\\$1');
}
