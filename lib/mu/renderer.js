var Stream   = require('./stream');
var BUFFER_LENGTH = 1024 * 8;
var MAX_STACK_SIZE = 1000;

var nextTick = (typeof setImmediate == 'function') ? setImmediate : process.nextTick;

exports.render = render;


function render(render, contextData, renders, stream, callback) {
  var context = new Context(stream, contextData, renders);

  render.process(context, function() {
    nextTick(callback);
  });
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

Context.prototype.getVal = function(name, render, callback) {
  var val = this.walkToFind(name),
    self = this;
  
  if (typeof(val) === 'function') {
    if (typeof(render) === 'object' && render.process && typeof(render.process) === 'function') {
      var stream = new Stream(), result = "";
      stream.on('data', function (part) {
        result += part;
      });
      var context = new Context(stream, self.context, self.renders);

      render.process(context, function() {
        val = val.call(self.smashContext(), result);
        callback(val, result);
      });
    } else {
      val = val.call(self.smashContext(), render);
      callback(val);
    }
  } else {
    callback(val);
  }
};

Context.prototype.getStrVal = function(name, render, callback) {
  this.getVal(name, render, function(val) {
    if (val === null || typeof val === 'undefined') {
      callback('');
    } else {
      callback(val.toString());
    }
  });
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

  return obj;
}

Context.prototype.pushValLevel = function(level) {
  this.context.push(level || {});
};

Context.prototype.popValLevel = function() {
  return this.context.pop();
};

Context.prototype.setVal = function(name, value) {
  this.context[this.context.length-1][name] = value;
};

Context.prototype.getNextFunc = function(next) {
  var self = this;
  function startNext() {
    try {
      next();
    } catch (err) {
      console.log(err);
      self.stream.emit('error', err);
      nextTick(startNext);
    }
  }
  return function() {
    if (self.stream.paused) {
      self.stream.once('resumed', function () {
        nextTick(startNext);
      });
    } else if (++self.stackSize % MAX_STACK_SIZE == 0) {
      nextTick(startNext);
    } else {
      startNext();
    }
  }
};

exports.tokenRenders = {};

exports.tokenRenders.Static = function(text) {
  this.text = text;
}
exports.tokenRenders.Static.prototype.process = function(context, next) {
  context.write(this.text);
  context.getNextFunc(next)();
}

exports.tokenRenders.UTag = function(name) {
  this.name = name;
}
exports.tokenRenders.UTag.prototype.process = function(context, next) {
  context.getStrVal(this.name, '', function(val) {
    context.write(val);
    context.getNextFunc(next)();
  });
}

exports.tokenRenders.ETag = function(name) {
  this.name = name;
}
exports.tokenRenders.ETag.prototype.process = function(context, next) {
  context.getStrVal(this.name, '', function(val) {
    context.write(escape(val));
    context.getNextFunc(next)();
  });
}

exports.tokenRenders.Section = function(name, render) {
  this.name = name;
  this.render = render;
};
exports.tokenRenders.Section.prototype.process = function(context, next) {
  var self = this;
  context.getVal(self.name, self.render, function (res) {
    if (res) {
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
      } else {
        self.render.process(context, context.getNextFunc(next));
      }
    } else {
      context.getNextFunc(next)();
    }
  });
};

exports.tokenRenders.InvertedSection = function(name, render) {
  this.name = name;
  this.render = render;
}
exports.tokenRenders.InvertedSection.prototype.process = function(context, next) {
  var self = this;
  context.getVal(self.name, self.render, function (res, renderRes) {
    if (!res || res.length === 0) {
      if(renderRes) {
        context.write(renderRes);
        context.getNextFunc(next)();
      } else {
        self.render.process(context, context.getNextFunc(next));
      }
    } else {
      context.getNextFunc(next)();
    }
  });
}

exports.tokenRenders.LocateSlot = function(name, render) {
  this.name = name;
  this.render = render;
}
exports.tokenRenders.LocateSlot.prototype.process = function(context, next) {
  var res = context.getValRender(this.name);
  if (!res) {
    this.render.process(context, context.getNextFunc(next));
  } else {
    res.process(context, context.getNextFunc(next));
  }
}

exports.tokenRenders.DefineSlot = function(name, render) {
  this.name = name;
  this.render = render;
}
exports.tokenRenders.DefineSlot.prototype.process = function(context, next) {
  context.setVal(this.name, this.render);
}

exports.tokenRenders.ParentPartial = function(name, render) {
  this.name = name;
  this.render = render;
}
exports.tokenRenders.ParentPartial.prototype.process = function(context, next) {
  context.pushValLevel();
  var self = this;
  self.render.process(context, function() {
    var parentRender = context.getRender(self.name);
    parentRender.process(context, function() {
      context.pushPopLevel();
      context.getNextFunc(next)();
    });
  });
}

exports.tokenRenders.Partial = function(name) {
  this.name = name;
}
exports.tokenRenders.Partial.prototype.process = function(context, next) {
  var render = context.getRender(this.name);
  render.process(context, context.getNextFunc(next));
}

exports.tokenRenders.Multi = function() {
  this.renders = [];
}
exports.tokenRenders.Multi.prototype.add = function(render) {
  this.renders.push(render);
}
exports.tokenRenders.Multi.prototype.process = function(context, next) {
  var i=0, self = this;
  function process() {
    if(i>=self.renders.length) {
      context.getNextFunc(next)();
    } else {
      var render = self.renders[i++];
      render.process(context, context.getNextFunc(process));
    }
  }
  process();
}

function escapeReplace(char) {
  switch (char) {
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '&': return '&amp;';
    case '"': return '&quot;';
    default: return char;
  }
}

function escape(string) {
  return string.replace(/[&<>"]/g, escapeReplace);
}