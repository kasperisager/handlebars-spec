#!/usr/bin/env node

var program = require('commander')
  , fs = require('fs')
  , path = require('path');

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

var extractHelpers = function (data) {
  var helpers = {}
    , extract = function (object) {
      if (!object || typeof object !== 'object') {
        return false;
      }

      Object.keys(object).forEach(function (el) {
        if (isFunction(object[el])) {
          helpers[el] = { javascript: '' + object[el] };
        }

        extract(object[el]);
      });
    };

  extract(data);

  return helpers;
};

global.beforeEach = function () {};

global.describe = function (description, next) {
  context.description = description;
  next();
};

global.it = function (description, next) {
  context.it = description;
  next();
};

global.shouldCompileTo = function (template, data, expected) {
  var helpers = extractHelpers(data);

  tests.push({
    description : context.description
  , it          : context.it
  , template    : template
  , data        : data
  , helpers     : helpers
  , expected    : expected
  });
};

global.shouldThrow = function (next) {
  tests.push({
    description : context.description
  , it          : context.it
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
