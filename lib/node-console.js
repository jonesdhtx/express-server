var _ = require('underscore');
var s = require('underscore.string');
var m = require('moment');
var path = require('path');

module.exports = function($) {
    var repl = require('repl').start({
        useGlobal: true,
        ignoreUndefined: true,
        prompt: 'express-server > '
    });

    repl.setupHistory(path.join(process.env.PWD, '.repl_node_history'), function (err) {
        if(err) {
            console.log('Repl history error:', err)
        }
    })

    var context = repl.context;

    context.u = _;
    context.s = s;
    context.m = m;

    context.cb = function (err, result) {
        context.err = err;
        context.result = result;
    };

    _.extend(context, _.omit($,'console'))
    return context;
};
