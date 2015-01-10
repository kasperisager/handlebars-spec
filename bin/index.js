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

tests.add = function (spec) {
  if (!spec || !spec.template) return;

  var key = (spec.description + '-' + spec.it).toLowerCase();

  for (var i = 0; i < 20; i++) {
    var name = key + '-' + ('0' + i).slice(-2);

    if (indices.indexOf(name) === -1) {
      if (program.output) {
        var output    = path.resolve(program.output)
          , patchName = path.basename(output)
          , patchFile = path.dirname(output) + '/../patch/' + patchName;

        if (fs.existsSync(path.resolve(patchFile))) {
          var patch = require(patchFile);

          if (patch.hasOwnProperty(name)) {
            spec = extend(true, spec, patch[name]);
          }
        }
      }

      tests.push(spec);
      indices.push(name);
      break;
    }
  }
};

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

var extractLambdas = function(data) {
    var fns;
    for( var x in data ) {
        if( typeof data[x] === 'function' ) {
            if( typeof fns === 'undefined' ) {
                fns = {};
            }
            fns[x] = {
                '!code': true,
                javascript: data[x].toString()
            };
        } else if( typeof data[x] === 'object' ) {
            var childfns = extractLambdas(data[x]);
            if( childfns ) {
                if( typeof fns === 'undefined' ) {
                    fns = {};
                }
                fns[x] = childfns;
            }
        }
    }
    return fns;
};

global.Handlebars    = Handlebars;
global.handlebarsEnv = Handlebars.create();

global.beforeEach = function (next) {
  next();
};

global.CompilerContext = {
  compile: function (template, options) {
    // Push template unto context
    context.template = template;
    context.compileOptions = options;
    
    var compiledTemplate = Handlebars.compile(template, options);
    
    return function (data, options) {
      if (options && options.hasOwnProperty('data')) {
        data = extend(true, data, options.data);
      }

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
    context.compileOptions = options;
    return Handlebars.compile(template, options);
  }
};

global.describe = function (description, next) {
  // Push suite description unto context
  context.description = description;
  next();
};

global.it = function (description, next) {
  // Push test spec unto context
  context.it = description;
  next();
};

global.equal = global.equals = function (actual, expected, message) {
  var spec = {
      description : context.description
    , it          : context.it
    , template    : context.template
    , data        : context.data
    , expected    : expected
    };
  if( context.compileOptions ) {
    spec.compileOptions = context.compileOptions;
  }

  // Remove template and data from context
  delete context.template;
  delete context.data;
  delete context.knownHelpersOnly;
  delete context.compileOptions;

  if (message) spec.message = message;

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

  tests.add(spec);
};

global.shouldCompileTo = function (string, hashOrArray, expected) {
  shouldCompileToWithPartials(string, hashOrArray, false, expected);
};

global.shouldCompileToWithPartials = function (string, hashOrArray, partials, expected, message) {
  compileWithPartials(string, hashOrArray, partials, expected, message);
};

global.compileWithPartials = function (string, hashOrArray, partials, expected, message) {
  var helpers = false;

  if (util.isArray(hashOrArray)) {
    data     = hashOrArray[0];
    helpers  = extractHelpers(hashOrArray[1]);
    partials = hashOrArray[2];
  } else {
    data = hashOrArray;
  }

  var spec = {
      description : context.description
    , it          : context.it
    , template    : string
    , data        : data
    };

  if (partials) spec.partials = partials;
  if (helpers)  spec.helpers  = helpers;
  /*if (expected)*/ spec.expected = expected;
  if (message)  spec.message  = '' + message;
  
  var lambdas = extractLambdas(data);
  if( lambdas ) {
      spec.lambdas = lambdas;
  }

  tests.add(spec);
};

global.shouldThrow = function (callback, error, message) {
  try {
    callback();
  } catch (err) {}

  var spec = {
      description : context.description
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
