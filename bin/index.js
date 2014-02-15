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
  var test = {
      description : context.description
    , it          : context.it
    , template    : context.template
    , data        : context.data
    , expected    : expected
    };

  if (context.hasOwnProperty('helpers')) {
    test.helpers = extractHelpers(context.helpers);
  }

  tests.push(test);
};

global.shouldCompileTo = function (string, hashOrArray, expected) {
  shouldCompileToWithPartials(string, hashOrArray, false, expected);
};

global.shouldCompileToWithPartials = function (string, hashOrArray, partials, expected, message) {
  compileWithPartials(string, hashOrArray, partials, expected, message);
};

global.compileWithPartials = function(string, hashOrArray, partials, expected, message) {
  var helpers = false;

  if (util.isArray(hashOrArray)) {
    data     = hashOrArray[0];
    helpers  = extractHelpers(hashOrArray[1]);
    partials = hashOrArray[2];
  } else {
    data = hashOrArray;
  }

  var test = {
      description : context.description
    , it          : context.it
    , template    : string
    , data        : data
    };

  if (partials) test.partials = partials;
  if (helpers)  test.helpers  = helpers;
  if (expected) test.expected = expected;
  if (message)  test.message  = message;

  tests.push(test);
};

global.shouldThrow = function (callback, error) {
  callback();

  tests.push({
    description : context.description
  , it          : context.it
  , template    : context.template
  , exception   : true
  });
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
