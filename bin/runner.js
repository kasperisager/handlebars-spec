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
    //return handlebarsEnv.compile(template, options);
    var templateSpec = handlebarsEnv.precompile(template, options);
    return handlebarsEnv.template(safeEval(templateSpec));
  },
  compileWithPartial: function(template, options) {
    return handlebarsEnv.compile(template, options);
  }
};
require('../handlebars.js/spec/env/common.js');
//require('../handlebars.js/spec/env/node.js');


// Sigh - not sure why this isn't working right (for builtins #each)
Handlebars.registerHelper('detectDataInsideEach', function(options) {
    return options.data && options.data.exclaim;
});


// Main
var dir = path.resolve('./spec/');
var specs = fs.readdirSync(dir);
var results = [];

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

function getLambdas(data) {
    if( !data ) {
        return;
    }
    
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
          var sigh = getLambdas(data[x]);
          if( sigh ) {
              if( typeof fns === 'undefined' ) {
                  fns = {};
              }
              fns[x] = sigh;
          }
        }
    }
    return fns;
}

function runTest(test, suite) {
    switch( suite ) {
        case 'tokenizer':
            // not yet implemented
            break;
        case 'basic':
        case 'blocks':
        //case 'builtins': // a little broken
        //case 'data': // very broken
        //case 'helpers': // a little broken
        //case 'partials': // a little broken
        //case 'regressions': // mostly working
        //case 'string-params': // very broken
        //case 'subexpressions': // very broken
        //case 'track-ids': // very broken
        case 'whitespace-control':
            runTestGeneric(test, suite);
            break;
        default:
            break;
    }
}

function runTestGeneric(test, suite) {
    console.log('------------------------------------------------------------');
    var prefix = '(' + suite + ' - ' + test.it + ' - ' + test.description + '): ';
    try {
        // Clone test data for merge
        var data = (test.data !== undefined ? JSON.parse(JSON.stringify(test.data)) : undefined);
        // Get and merge lambdas
        var lambdas = getLambdas(test.lambdas);
        if( lambdas ) {
            data = objmerge(data || {}, lambdas);
        }
        // Get helpers
        var helpers = test.helpers ? getHelpersFromTest(test) : [];
        // Prepare arguments
        var hashOrArray;
        if( test.data || helpers || test.partials ) {
            hashOrArray = [data, helpers, test.partials]
        }
        // Execute
        if( test.options || test.compileOptions ) {
            // @todo separate this into compile opts/render opts
            var options = test.options || undefined;
            var compileOptions = test.compileOptions || undefined;
            var template = global.CompilerContext.compile(test.template, compileOptions);
            var result = template(data, options);
            global.equals(result, test.expected);
        } else {
            shouldCompileTo(test.template, hashOrArray, test.expected, 'grr');
        }
        // Check if should have thrown
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
            console.log(e.stack);
            console.log('Test Data: ', test);
            console.log('Merged Data: ', data);
            console.log('Helpers: ', helpers);
        }
    }
}
