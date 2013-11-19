var Stream   = require('./stream');
var parcer   = require('./parser');
var BUFFER_LENGTH = 1024 * 8;
var MAX_STACK_SIZE = 100;

var nextTick = (typeof setImmediate == 'function') ? setImmediate : process.nextTick;

var rendersCache = {};

exports.render = render;
function render(render, contextData, renders, stream, callback) {
  var context = new Context(stream, contextData, renders);
  render.process(context, function() {
    nextTick(callback);
  });
}

exports.renderSync = renderSync;
function renderSync(render, contextData, renders, stream) {
  var context = new Context(stream, contextData, renders);
  return render.processSync(context);
}

function dump(v, tab) {
  if(!tab)tab="";
  switch (typeof v) {
      case "object":
          for (var i in v) {
              console.log(tab+i+":");
              dump(v[i],tab+" ");
          }
          break;
      case "function":
          break;
      default: //number, string, boolean, null, undefined 
          console.log(tab+typeof v+":"+v);
          break;
  }
}

var Context = function(stream, contextData, renders) {
  this.stream = stream;
  if (!Array.isArray(contextData)) {
    contextData = [contextData];
  }
  this.context = contextData;
  this.renders = renders;
  this.stackSize = 0;
}

Context.prototype.getRender = function(name) {
  return this.renders[name][0].tokens;
};

Context.prototype.write = function(text) {
  this.stream.emit('data', text);
};

Context.prototype.getVal = function(name) {
  if(name=='.') {
    return this.context[this.context.length-1];
  }
  return this.walkToFind(name);
};

Context.prototype.getStrVal = function(name) {
  var val = this.getVal(name);
  if (val === null || typeof val === 'undefined') {
    return '';
  } else if (typeof val === 'function') {
    val = val.call(this.smashContext());
    if (typeof val === 'function') {
      val = val.call(this.smashContext());
    }
    return val.toString();
  }
  return val.toString();
};

Context.prototype.getValRender = function(name) {
  var val = this.getVal(name);
  if (val === null || typeof val === 'undefined') {
    return false;
  } else {
    if (typeof(val) === 'object' && val.process && typeof(val.process) === 'function') {
      return val;
    } else {
      return new exports.tokenRenders.Static(val.toString());
    }
  }
};

Context.prototype.walkToFind = function(name) {
  function contextLevelContains(context, fullPath) {
    var pathParts = fullPath.split('.');
    var obj = context;

    for (var i = 0; i < pathParts.length; i++) {
      var part = pathParts[i];

      if (typeof obj == 'object' && part in obj) {
        obj = obj[part];
      } else {
        obj = undefined;
        break;
      }
    }

    return obj;
  }

  var i = this.context.length;

  while (i--) {
    var result = contextLevelContains(this.context[i], name);

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

// TODO: if Proxy, make more efficient
// TODO: cache?
Context.prototype.smashContext = function() {
  if(this.smashCache) {
    return this.smashCache;
  }
  var obj = {};

  for (var i = 0; i < this.context.length; i++) {
    var level = this.context[i];

    if (level instanceof Date) {
      obj.__date = level;
    } else {
      for (var k in level) {
        obj[k] = level[k];
      }
    }
  }

  this.smashCache = obj;

  return obj;
}

Context.prototype.pushValLevel = function(level) {
  this.smashCache = undefined;
  this.context.push(level || {});
};

Context.prototype.popValLevel = function() {
  this.smashCache = undefined;
  return this.context.pop();
};

Context.prototype.setVal = function(name, value) {
  this.smashCache = undefined;
  this.context[this.context.length-1][name] = value;
};

Context.prototype.getNextFunc = function(next) {
  var self = this;
  return function() {
    if (self.stream.paused) {
      self.stream.once('resumed', function () {
        nextTick(next);
      });
    } else if (++self.stackSize % MAX_STACK_SIZE == 0) {
      nextTick(next);
    } else {
      next();
    }
  }
};

exports.tokenRenders = {};

exports.tokenRenders.Static = function(text) {
  this.text = text;
};
exports.tokenRenders.Static.prototype = {
  process: function(context, next) {
    context.write(this.processSync(context));
    context.getNextFunc(next)();
  },
  processSync: function(context) {
    return this.text;
  },
  getText: function() {
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.UTag = function(name, text) {
  this.name = name;
  this.text = text;
};
exports.tokenRenders.UTag.prototype = {
  process: function(context, next) {
    context.write(this.processSync(context));
    context.getNextFunc(next)();
  },
  processSync: function(context) {
    return context.getStrVal(this.name);
  },
  render: function(context, next) {
    return this.text;
  },
  getText: function() {
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.ETag = function(name, text) {
  this.name = name;
  this.text = text;
};
exports.tokenRenders.ETag.prototype = {
  process: function(context, next) {
    context.write(this.processSync(context));
    context.getNextFunc(next)();
  },
  processSync: function(context) {
    return escape(context.getStrVal(this.name));
  },
  getText: function() {
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

function processFunc(context, func, render) {
  var oldRender = global.render;
  global.render = function(text) {
    var render = rendersCache[text];
    if(!render) {
      parsed = parser.parse(template);
      render = parsed.tokens;
      rendersCache[text] = render;
    }
    return render.processSync(context).toString();
  }
  var val = func.call(context.smashContext(), render.getText(), global.render);
  if (typeof val === 'function') {
    val = val.call(context.smashContext(), render.getText(), global.render);
  }
  global.render = oldRender;
  return val;
}

exports.tokenRenders.Section = function(name, render, startText) {
  this.name = name;
  this.render = render;
  this.startText = startText;
};
exports.tokenRenders.Section.prototype = {
  process: function(context, next) {
    var self = this;
    var res = context.getVal(self.name);
    if (res && typeof res === 'function') {
      res = processFunc(context, res, self.render);
    }
    if (res!==false && res!==null && res!==undefined && res!==0 && res===res) {
      if (res instanceof Array) {
        var i=0;
        function process() {
          if(i>=res.length) {
            context.getNextFunc(next)();
          } else {
            var val = res[i++];
            context.pushValLevel(val);
            self.render.process(context, function() {
              context.popValLevel();
              context.getNextFunc(process)();
            });
          }
        }
        process();
      } else if (typeof res === 'object') {
        context.pushValLevel(res);
        self.render.process(context, function() {
          context.popValLevel();
          context.getNextFunc(next)();
        });
      } else if (typeof res === 'string') {
        context.write(res);
        context.getNextFunc(next)();
      } else {
        self.render.process(context, context.getNextFunc(next));
      }
    } else {
      context.getNextFunc(next)();
    }
  },
  processSync: function(context) {
    var res = context.getVal(this.name);
    var text = '';
    if (res && typeof res === 'function') {
      res = processFunc(context, res, self.render);
    }
    if (res!==false && res!==null && res!==undefined && res!==0 && res===res) {
      if (res instanceof Array) {
        res.forEach(function (val) {
          context.pushValLevel(val);
          text += this.render.processSync(context);
          context.popValLevel();
        });
      } else if (typeof res === 'object') {
        context.pushValLevel(res);
        text += this.render.processSync(context);
        context.popValLevel();
      } else if (typeof res === 'string') {
        text += res;
      } else {
        text += this.render.processSync(context);
      }
    }
    return text;
  },
  setEndText: function(endText) {
    this.endText = endText;
  },
  getText: function() {
    if(this.text) {
      return this.text;
    }
    this.text = this.startText+this.render.getText()+this.endText;
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.InvertedSection = function(name, render, startText) {
  this.name = name;
  this.render = render;
  this.startText = startText;
};
exports.tokenRenders.InvertedSection.prototype = {
  process: function(context, next) {
    var res = context.getVal(this.name);
    if (res && typeof res === 'function') {
      res = processFunc(context, res, this.render);
    }
    if (!res || res.length === 0) {
      this.render.process(context, context.getNextFunc(next));
    } else {
      context.getNextFunc(next)();
    }
  },
  processSync: function(context) {
    var res = context.getVal(this.name), text = "";
    if (!res || res.length === 0) {
      text = this.render.processSync(context);
    }
    return text;
  },
  setEndText: function(endText) {
    this.endText = endText;
  },
  getText: function() {
    if(this.text) {
      return this.text;
    }
    this.text = this.startText+this.render.getText()+this.endText;
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.LocateSlot = function(name, render, startText) {
  this.name = name;
  this.render = render;
  this.startText = startText;
};
exports.tokenRenders.LocateSlot.prototype = {
  process: function(context, next) {
    var res = context.getValRender(this.name);
    var currValLevel = context.popValLevel();
    if (!res) {
      this.render.process(context, pushLevelAndNext);
    } else {
      res.process(context, pushLevelAndNext);
    }
    function pushLevelAndNext() {
      context.pushValLevel(currValLevel);
      context.getNextFunc(next)();
    }
  },
  processSync: function(context) {
    var res = context.getValRender(this.name), text = "";
    var currValLevel = context.popValLevel();
    if (!res) {
      text = this.render.processSync(context);
    } else {
      text = res.processSync(context);
    }
    context.pushValLevel(currValLevel);
    return text;
  },
  setEndText: function(endText) {
    this.endText = endText;
  },
  getText: function() {
    if(this.text) {
      return this.text;
    }
    this.text = this.startText+this.render.getText()+this.endText;
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.DefineSlot = function(name, render, startText) {
  this.name = name;
  this.render = render;
  this.startText = startText;
};
exports.tokenRenders.DefineSlot.prototype = {
  process: function(context, next) {
    context.setVal(this.name, this.render);
    context.getNextFunc(next)();
  },
  processSync: function(context) {
    context.setVal(this.name, this.render);
    return '';
  },
  setEndText: function(endText) {
    this.endText = endText;
  },
  getText: function() {
    if(this.text) {
      return this.text;
    }
    this.text = this.startText+this.render.getText()+this.endText;
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.ParentPartial = function(name, render, startText) {
  this.name = name;
  this.render = render;
  this.startText = startText;
};
exports.tokenRenders.ParentPartial.prototype = {
  process: function(context, next) {
    var self = this;
    context.pushValLevel();
    self.render.process(context, function() {
      var parentRender = context.getRender(self.name);
      parentRender.process(context, function() {
        context.popValLevel();
        context.getNextFunc(next)();
      });
    });
  },
  processSync: function(context) {
    context.pushValLevel();
    this.render.process(context);
    var parentRender = context.getRender(this.name);
    var text = parentRender.processSync(context);
    context.popValLevel();
    return text;
  },
  setEndText: function(endText) {
    this.endText = endText;
  },
  getText: function() {
    if(this.text) {
      return this.text;
    }
    this.text = this.startText+this.render.getText()+this.endText;
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.Partial = function(name, text) {
  this.name = name;
  this.text = text;
};
exports.tokenRenders.Partial.prototype = {
  process: function(context, next) {
    var render = context.getRender(this.name);
    render.process(context, context.getNextFunc(next));
  },
  processSync: function(context) {
    var render = context.getRender(this.name);
    return render.processSync(context);
  },
  getText: function() {
    if(!rendersCache[this.text]) {
      rendersCache[this.text] = this;
    }
    return this.text;
  }
};

exports.tokenRenders.Multi = function() {
  this.renders = [];
}
exports.tokenRenders.Multi.prototype = {
  add: function(render) {
    this.renders.push(render);
  },
  process: function(context, next) {
    var i=0, self = this;
    function process() {
      if(i>=self.renders.length) {
        context.getNextFunc(next)();
      } else {
        var render = self.renders[i++];
        render.process(context, context.getNextFunc(process));
      }
    }
    try {
      process();
    } catch (err) {
      console.log(err);
      context.stream.emit('error', err);
      nextTick(process);
    }
  },
  processSync: function(context) {
    var text = '';
    this.renders.forEach(function (render) {
      text += render.processSync(context);
    })
    return text;
  },
  getText: function() {
    if(this.text) {
      return this.text;
    }
    var self = this;
    self.text = "";
    self.renders.forEach(function (render) {
      self.text += render.getText();
    });
    if(!rendersCache[self.text]) {
      rendersCache[self.text] = self;
    }
    return self.text;
  }
};

var entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': '&quot;',
  "'": '&#39;',
  "/": '&#x2F;'
};

function escapeReplace(char) {
  return entityMap[char] || char;
}

function escape(string) {
  return string.replace(/[&<>"'\/]/g, escapeReplace);
}