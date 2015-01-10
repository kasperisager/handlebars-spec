#!/usr/bin/env node

var program = require('commander')
  , fs = require('fs')
  , path = require('path')
  , util = require('util')
  , extend = require('extend')
  , Handlebars = require('handlebars')
  , objmerge = require('object-merge');

global.Handlebars = Handlebars;

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

function getLambdasFromTest(test) {
    function l(data) {
        var fns;
        for( var x in data ) {
            if( typeof data[x] !== 'object' ) {
                continue;
            }
            if( '!code' in data[x] ) {
              if( typeof fns === 'undefined' ) {
                  fns = {};
              }
              fns[x] = safeEval(data[x].javascript);
            } else {
              l(data[x]);
            }
        }
        return fns;
    }
    return l(test.lambdas);
}

function runTest(test, suite) {
    switch( suite ) {
        case 'tokenizer':
            break;
        case 'basic':
        //case 'blocks':
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
        var data = JSON.parse(JSON.stringify(test.data));
        // Get and merge lambdas
        var lambdas = getLambdasFromTest(test);
        if( lambdas ) {
            data = objmerge(data, lambdas);
        }
        
        var helpers = test.helpers ? getHelpersFromTest(test) : [];
        shouldCompileTo(test.template, 
                [test.data, helpers, test.partials], test.expected, 'grr');
        if( !test.exception ) {
            console.log(prefix + 'OK');
        } else {
            console.log(prefix + 'Error: should have thrown, did not');
        }
    } catch( e ) {
        if( test.exception ) {
            console.log(prefix + 'OK');
        } else {
            console.log(prefix + e);
            console.log('Test Data: ', test);
            console.log('Merged Data: ', data);
            console.log('Helpers: ', helpers);
        }
    }
}
