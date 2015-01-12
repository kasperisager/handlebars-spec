#!/usr/bin/env node

var program = require('commander')
  , fs = require('fs')
  , path = require('path')
  , util = require('util')
  , extend = require('extend')
  , assert = require('assert')
  , Handlebars = require('handlebars');

global.Handlebars = Handlebars;

// borrowed from spec/env/node.js
global.handlebarsEnv = Handlebars;
function safeEval(templateSpec) {
  try {
    return eval('(' + templateSpec + ')');
  } catch (err) {
    console.error("SPEC:". templateSpec);
    throw err;
  }
}
global.CompilerContext = {
  compile: function(template, options) {
    //return handlebarsEnv.compile(template, options);
    var templateSpec = global.handlebarsEnv.precompile(template, options);
    return global.handlebarsEnv.template(safeEval(templateSpec));
  },
  compileWithPartial: function(template, options) {
    return global.handlebarsEnv.compile(template, options);
  }
};
require('../handlebars.js/spec/env/common.js');
//require('../handlebars.js/spec/env/node.js');


// borrowed from spec/tokenizer.js
function tokenize(template) {
    var parser = Handlebars.Parser,
        lexer = parser.lexer;
    
    lexer.setInput(template);
    var out = [],
        token;
    
    while( (token = lexer.lex()) ) {
      var result = parser.terminals_[token] || token;
      if (!result || result === 'EOF' || result === 'INVALID') {
        break;
      }
      out.push({name: result, text: lexer.yytext});
    }
    
    return out;
}


// Sigh - not sure why this isn't working right (for builtins #each)
Handlebars.registerHelper('detectDataInsideEach', function(options) {
    return options.data && options.data.exclaim;
});


function isFunction(f) {
    return (f instanceof Function);
}


// Utils

function clone(v) {
    return (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
}

function unstringifyHelpers(helpers) {
    if( !helpers | helpers === null ) {
        return;
    }
    var ret = {};
    for( var x in helpers ) {
        ret[x] = safeEval(helpers[x].javascript);
    }
    return ret;
}

function unstringifyLambdas(data) {
    if( !data || data === null ) {
        return data;
    }
    for( var x in data ) {
        if( data[x] instanceof Array ) {
            unstringifyLambdas(data[x]);
        } else if( typeof data[x] === 'object' && data[x] !== null ) {
            if( '!code' in data[x] ) {
                data[x] = safeEval(data[x].javascript);
            } else {
                unstringifyLambdas(data[x]);
            }
        }
    }
    return data;
}

function makePrefix(test, suite) {
    return '(' + suite + ' - ' + test.it + ' - ' + test.description + '): ';
}

function prepareTestGeneric(test, suite) {
    var spec = {};
    // Output prefix
    spec.prefix = makePrefix(test, suite);
    // Template
    spec.template = test.template;
    // Expected
    spec.expected = test.expected;
    // Exception
    spec.exception = (test.exception ? true : false);
    // Data
    spec.data = clone(test.data);
    unstringifyLambdas(spec.data);
    // Helpers
    spec.helpers = unstringifyHelpers(test.helpers);
    spec.globalHelpers = test.globalHelpers || undefined;
    // Partials
    spec.partials = test.partials;
    unstringifyLambdas(spec.partials);
    spec.globalPartials = test.globalPartials || undefined;
    // Options
    spec.options = clone(test.options);
    spec.compileOptions = clone(test.compileOptions);
    // Compat
    spec.compat = Boolean(test.compat);
    return spec;
}

function prepareTestTokenizer(test, suite) {
    var spec = {};
    // Output prefix
    spec.prefix = '(' + suite + ' - ' + test.it + ' - ' + test.description + '): ';
    // Template
    spec.template = test.template;
    // Expected
    spec.expected = clone(test.expected);
    return spec;
}

function checkResult(test, e) {
    if( (test.exception === true) === (e !== undefined) ) {
        console.log(test.prefix + 'OK');
        return true;
    } else {
        console.log(test.prefix + (e || 'Error: should have thrown, did not'));
        e && console.log(e.stack);
        console.log('Test Data: ', test);
        return false;
    }
}

function runTest(test) {
    var result = null;
    switch( test.suite ) {
        case 'tokenizer':
            result = runTestTokenizer(prepareTestTokenizer(test, suite));
            break;
        case 'basic':
        case 'blocks':
        case 'builtins':
        case 'data':
        case 'helpers':
        case 'partials':
        case 'regressions':
        case 'string-params':
        case 'subexpressions':
        case 'track-ids':
        case 'whitespace-control':
            result = runTestGeneric(prepareTestGeneric(test, suite));
            break;
        default:
            break;
    }
    return result;
}

function runTestGeneric(test) {
    try {
        // Register global partials
        if( test.globalPartials ) {
            for( var x in test.globalPartials ) {
                global.handlebarsEnv.registerPartial(x, test.globalPartials[x]);
            }
        }
        
        // Register global helpers
        if( test.globalHelpers ) {
            for( var x in test.globalHelpers ) {
                global.handlebarsEnv.registerHelper(x, safeEval(test.globalHelpers[x].javascript));
            }
        }

        // Execute
        if( test.options || test.compileOptions ) {
            var template = global.CompilerContext.compile(test.template, clone(test.compileOptions));
            var opts = test.options === undefined ? {} : clone(test.options);
            opts.data = test.data; // le sigh
            if( test.helpers ) {
                opts.helpers = test.helpers;
            }
            if( test.partials ) {
                opts.partials = test.partials;
            }
            if( test.compat ) {
                opts.compat = true;
            }
            var actual = template(test.data, opts);
            global.equals(actual, test.expected);
        } else {
            // Prepare arguments
            var hashOrArray;
            if( test.data !== undefined || test.helpers || test.partials ) {
                hashOrArray = [test.data, test.helpers, test.partials, test.compat]
            }
            shouldCompileTo(test.template, hashOrArray, test.expected, 'generated by runner');
        }
        return checkResult(test);
    } catch(e) {
        return checkResult(test, e);
    }
}

function runTestTokenizer(test) {
    try {
        var actual = tokenize(test.template);
        assert.deepEqual(actual, test.expected);
        return checkResult(test);
    } catch(e) {
        return checkResult(test, e);
    }
}


// Main
var dir = path.resolve('./spec/');
var specs = fs.readdirSync(dir);
var successes = [];
var failures = [];
var skipped = [];

for( var x in specs ) {
    var suite = specs[x].replace(/\.json$/, '');
    var data = require(dir + '/' + specs[x]);
    for( var y in data ) {
        data[y].suite = suite;
        var result = runTest(data[y]);
        if( result === null ) {
            skipped.push(data[y]);
        } else if( result === true ) {
            successes.push(data[y]);
        } else {
            failures.push(data[y]);
        }
    }
}


// Results
console.log('Summary');
console.log('Success: ' + successes.length);
console.log('Failed: ' + failures.length);
console.log('Skipped: ' + skipped.length);

// Exit
process.exit(failures.length ? 2 : 0);
