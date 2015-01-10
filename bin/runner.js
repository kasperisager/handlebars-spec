#!/usr/bin/env node

var program = require('commander')
  , fs = require('fs')
  , path = require('path')
  , util = require('util')
  , extend = require('extend')
  , Handlebars = require('handlebars');


// borrowed from spec/env/node.js
global.handlebarsEnv = Handlebars;
function safeEval(templateSpec) {
  try {
    return eval('(' + templateSpec + ')');
  } catch (err) {
    console.error(templateSpec);
    throw err;
  }
}
global.CompilerContext = {
  compile: function(template, options) {
    var templateSpec = handlebarsEnv.precompile(template, options);
    return handlebarsEnv.template(safeEval(templateSpec));
  },
  compileWithPartial: function(template, options) {
    return handlebarsEnv.compile(template, options);
  }
};
require('../handlebars.js/spec/env/common.js');
//require('../handlebars.js/spec/env/node.js');


// Main
var dir = path.resolve('./spec/');
var specs = fs.readdirSync(dir);

for( x in specs ) { 
    var suite = specs[x].replace(/\.json$/, '');
    var data = require(dir + '/' + specs[x]);
    for( var y in data ) { 
        runTest(data[y], suite);
    }
}

function getHelpersFromTest(test) {
    var helpers = {};
    for( var x in test.helpers ) {
        helpers[x] = safeEval(test.helpers[x].javascript);
    }
    return helpers;
}

function runTest(test, suite) {
    switch( suite ) {
        case 'tokenizer':
            break;
        case 'basic':
            runTestGeneric(test, suite);
            break;
        default:
            console.log("ARGGG");
            process.exit(2);
            break;
    }
}

function runTestGeneric(test, suite) {
    console.log('------------------------------------------------------------');
    var prefix = '(' + suite + ' - ' + test.it + ' - ' + test.description + '): ';
    try {
        var helpers = test.helpers ? getHelpersFromTest(test) : [];
        shouldCompileTo(test.template, 
                [test.data, helpers, test.partials], test.expected, 'grr');
        console.log(prefix + 'OK');
    } catch( e ) {
        console.log(prefix + e);
        console.log('Test Data: ', test);
        console.log('Helpers: ', helpers);
    }
}
