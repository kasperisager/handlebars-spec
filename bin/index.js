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

var tests = []
  , context = {};

tests.add = function (spec) {
  if (!spec || !spec.template) return;

  var key = (spec.description + '-' + spec.it).toLowerCase();

  for (var i = 0; i < 20; i++) {
    var name = key + '-' + ('0' + i).slice(-2);

    if (!tests.hasOwnProperty(name)) {
      if (program.output) {
        var patchFile = __dirname + '/../patch/' + path.basename(program.output);

        if (fs.existsSync(path.resolve(patchFile))) {
          var patch = require(patchFile);

          if (patch.hasOwnProperty(name)) {
            spec = extend(true, spec, patch[name]);
          }
        }
      }

      tests.push(spec);
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

global.Handlebars    = Handlebars;
global.handlebarsEnv = Handlebars.create();

global.beforeEach = function (next) {
  next();
};

global.CompilerContext = {
  compile: function (template, options) {
    // Push template unto context
    context.template = template;

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
    };
  },
  compileWithPartial: function(template, options) {
    // Push template unto context
    context.template = template;
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

  // Remove template and data from context
  delete context.template;
  delete context.data;

  if (context.hasOwnProperty('helpers')) {
    spec.helpers = extractHelpers(context.helpers);
    delete context.helpers;
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
  if (expected) spec.expected = expected;
  if (message)  spec.message  = '' + message;

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

    var output = JSON.stringify(tests, null, '\t');

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
