#!/usr/bin/env node

var program = require('commander')
  , fs = require('fs')
  , path = require('path')
  , util = require('util')
  , extend = require('extend')
  , Handlebars = require('handlebars');

program
  .version('0.0.0')
  .usage('[options] <file ...>')
  .option('-o, --output [file]', 'write JSON output to a file')
  .parse(process.argv);

var tests   = []  // Array containg the actual specs
  , indices = []  // Temp array for auto-incrementing test indices
  , context = {}; // Current test context
var skipKeys = [
  'multiple global helper registration-multiple global helper registration',
  'regressions-can pass through an already-compiled ast via compile/precompile'
];

tests.add = function (spec) {
  if (!spec || !spec.template) return;

  var key = (spec.description + '-' + spec.it).toLowerCase();
  //console.log(key);
  
  // Skip some
  // @todo patch these in manually?
  if( skipKeys.indexOf(key) !== -1 ) {
    return;
  }

  for (var i = 0; i < 20; i++) {
    var name = key + '-' + ('0' + i).slice(-2);
    
    // Make sure not duplicate ID
    if (indices.indexOf(name) !== -1) {
      continue;
    }
    
    if (program.output) {
      var output    = path.resolve(program.output)
        , patchName = path.basename(output)
        , patchFile = path.dirname(output) + '/../patch/' + patchName;

      if (fs.existsSync(path.resolve(patchFile))) {
        var patch = require(patchFile);
        
        if (patch.hasOwnProperty(name)) {
          if( patch[name] === null ) {
            // Note: setting to null means to skip the test. These will most
            // likely be implementation-dependant
            break;
          }
          spec = extend(true, spec, patch[name]);
          // Using nulls in patches to unset things
          stripNulls(spec);
        }
      }
    }

    tests.push(spec);
    indices.push(name);
    break;
  }
};

function clone(v) {
    return (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
}

function stripNulls(data) {
  if( typeof data === 'object' ) {
    for( var x in data ) {
      if( data[x] === null ) {
        delete data[x];
      } else if( typeof data === 'object' ) {
        stripNulls(data[x]);
      }
    }
  }
}

var isFunction = function (object) {
  return !!(object && object.constructor && object.call && object.apply);
};

var isEmptyObject = function (object) {
  return !Object.keys(object).length;
};

var extractHelpers = function (data) {
  var helpers = {};

  if (!data || typeof data !== 'object') {
    return false;
  }

  Object.keys(data).forEach(function (el) {
    if (isFunction(data[el])) {
      helpers[el] = { javascript: '' + data[el] };
    }
  });

  return isEmptyObject(helpers) ? false : helpers;
};

var detectGlobalHelpers = function() {
  
};

var detectGlobalPartials = function() {
  this.prevGlobalPartials = {};
  var globalPartials;
  for( var x in global.handlebarsEnv.partials ) {
    if( global.handlebarsEnv.partials[x] !== this.prevGlobalPartials[x] ) {
      if( !globalPartials ) {
        globalPartials = {};
      }
      this.prevGlobalPartials[x] = globalPartials[x] = global.handlebarsEnv.partials[x];
    }
  }
  if( globalPartials ) {
    context.globalPartials = globalPartials;
  } else {
    delete context.globalPartials;
  }
}

var stringifyLambdas = function(data) {
    for( var x in data ) {
      if( data[x] instanceof Array ) {
        stringifyLambdas(data[x]);
      } else if( typeof data[x] === 'function' || data[x] instanceof Function ) {
        data[x] = {
          '!code' : true,
          'javascript' : data[x].toString()
        }
      } else if( typeof data[x] === 'object' ) {
        stringifyLambdas(data[x]);
      }
    }
}

global.Handlebars    = Handlebars;
global.handlebarsEnv = Handlebars.create();

global.beforeEach = function (next) {
  next();
};

global.CompilerContext = {
  compile: function (template, options) {
    // Push template unto context
    context.template = template;
    context.compileOptions = clone(options);
    
    var compiledTemplate = Handlebars.compile(template, options);
    
    return function (data, options) {
      // Note: merging data in the options causes tests to fail, possibly
      // a separate type of data?
      if (options && options.hasOwnProperty('data')) {
        data = extend(true, data, options.data);
        context.options = context.options || {};
      }
      //context.options = options;

      // Push template data unto context
      context.data = data;

      if (options && options.hasOwnProperty('helpers')) {
        // Push helpers unto context
        context.helpers = options.helpers;
      }
      return compiledTemplate(data, options);
    };
  },
  compileWithPartial: function(template, options) {
    // Push template unto context
    context.template = template;
    context.compileOptions = clone(options);
    return Handlebars.compile(template, options);
  }
};

global.describe = function (description, next) {
  // Push suite description unto context
  context.description = description;
  next();
  context.description = undefined;
};

global.it = function (description, next) {
  // Push test spec unto context
  context.it = description;
  delete context.globalPartials;
  next();
};

global.equal = global.equals = function (actual, expected, message) {
  var spec = {
      description : (context.description || context.it)
    , it          : context.it
    , template    : context.template
    , data        : context.data
    , expected    : expected
    };
  
  // Remove template and data from context
  delete context.template;
  delete context.data;
  delete context.knownHelpersOnly;
  
  if (message) spec.message = message;
  
  // Get options
  if( context.options ) {
    spec.options = context.options;
  }
  delete context.options;
  
  // Get compiler options
  if( context.compileOptions ) {
    spec.compileOptions = context.compileOptions;
  }
  delete context.compileOptions;
  
  // Get helpers
  if (context.hasOwnProperty('helpers')) {
    spec.helpers = extractHelpers(context.helpers);

    // Remove helpder from context
    delete context.helpers;
  }

  // If a template is found in the lexer, use it for the spec. This is true in
  // the case of the tokenizer.
  if (Handlebars.Parser.lexer.matched) {
    spec.template = Handlebars.Parser.lexer.matched;
  }
  
  // Convert lambdas to object/strings
  stringifyLambdas(spec.data);
  
  tests.add(spec);
};

global.shouldCompileTo = function (string, hashOrArray, expected) {
  shouldCompileToWithPartials(string, hashOrArray, false, expected);
};

global.shouldCompileToWithPartials = function (string, hashOrArray, partials, expected, message) {
  detectGlobalPartials();
  compileWithPartials(string, hashOrArray, partials, expected, message);
};

global.compileWithPartials = function (string, hashOrArray, partials, expected, message) {
  var helpers = false, data;

  if (util.isArray(hashOrArray)) {
    data     = hashOrArray[0];
    helpers  = extractHelpers(hashOrArray[1]);
    partials = hashOrArray[2];
  } else {
    data = hashOrArray;
  }
  
  var spec = {
      description : (context.description || context.it)
    , it          : context.it
    , template    : string
    , data        : data
    };
  
  if( context.exception ) {
    spec.exception = true;
    delete context.exception;
  }
  
  if (partials) spec.partials = partials;
  if (helpers)  spec.helpers  = helpers;
  spec.expected = expected;
  if (message)  spec.message  = '' + message;
  
  // Get options
  if( context.options ) {
    spec.options = context.options;
  }
  delete context.options;
  
  // Get compiler options
  if( context.compileOptions ) {
    spec.compileOptions = context.compileOptions;
  }
  delete context.compileOptions;
  
  if (context.globalPartials) {
    spec.globalPartials = context.globalPartials;
    delete context.globalPartials;
  }
  
  // Convert lambdas to object/strings
  stringifyLambdas(spec.data);
  stringifyLambdas(spec.partials);
  
  tests.add(spec);
};

global.shouldThrow = function (callback, error, message) {
  context.exception = true;
  
  try {
    callback();
  } catch (err) {}
  
  delete context.exception;

  var spec = {
      description : (context.description || context.it)
    , it          : context.it
    , template    : context.template
    , exception   : true
    };

  // Remove template from context
  delete context.template;

  if (message) spec.message = '' + message;

  tests.add(spec);
};

var input = path.resolve(program.args[0]);

fs.exists(input, function (exists) {
  if (exists) {
    require(input);
    
    try {
      var output = JSON.stringify(tests, null, '\t');
    } catch(e) {
      return console.log('Failed converting to JSON: ' + input + ' (' + e + ')');
    }

    if (!program.output) {
      return console.log(output);
    }

    var outputFile = path.resolve(program.output);

    fs.writeFile(outputFile, output, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log('JSON saved to ' + program.output);
      }
    });
  } else {
    console.log('The input file does not exist');
  }
});
