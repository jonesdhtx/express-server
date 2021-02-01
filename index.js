var nodeConsole = require('./lib/node-console');
var _ = require('underscore');
var deepmerge = require('deepmerge');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var s = require('underscore.string');
var yaml = require('js-yaml');
var ejs = require('ejs');

var $ = module.exports = {};

var dirs = ['config', 'logs', 'db', 'templates', 'views', 'lib', 'helpers', 'settings', 'plugins', 'schemas', 'models', 'managers', 'orchestrators', 'controllers', 'routers', 'routes', 'events', 'jobs'];
_.each(dirs, function(dir) {
    $[dir] = function(){return _.isFunction($[dir].index) && $[dir].index.apply(this,arguments)};
});

$.express = require('express');
$.server = $.express();

var readConfig = function(configFilePath) {
    var rawConfig = yaml.load(fs.readFileSync(configFilePath));
    var fullConfig = rawConfig.default;

    _.forEach(rawConfig, function(thisConfig, thisKey) {
        if(thisKey === process.env.NODE_ENV) {
            fullConfig = deepmerge(fullConfig, thisConfig);
        }
    });

    return fullConfig;
}

var mapRequire = function(moduleName, dirs) {
    var log = [];
    _.each(dirs, function(files) {
        var module = $[moduleName];
        var indexes = [];

        var splitRefFile = function(ref, split, file, isIndex) {
            if (file.indexOf('.yaml') !== -1) {
                ref[split] = ref[split] || {};
                return _.extend(ref[split], readConfig(path.resolve(file)));
            }
            if (file.indexOf('.ejs') !== -1) {
                var readFile = fs.readFileSync(path.resolve(file), {encoding: 'utf8'});
                return ref[split] = ejs.compile(readFile);
            }

            var module = require(path.resolve(file));
            ref[split] = module;

            if (isIndex) {
                _.extend(ref, module);
            }
        };

        var doFile = function(name, file, isIndex) {
            var splits = name.split('/');
            var ref = module;
            if (splits.length > 1) {
                _.each(splits, function(split, index) {
                    split = s.camelize(split);
                    if (index === splits.length - 1) {
                        splitRefFile(ref, split, file, isIndex);
                    } else {
                        var localRef = ref;
                        ref = ref[split] || (ref[split] = function() {
                                return _.isFunction(localRef[split].index) && localRef[split].index.apply(this,arguments);
                            });
                    }
                });
            } else {
                var split = s.camelize(name);
                splitRefFile(ref, split, file, isIndex);
            }
        };

        _.each(files, function(name, file) {
            if (file.indexOf('index.js') !== -1) {
                return indexes.push({name:name, file:file});
            }
            log.push(name);
            //console.log('!!!!files loading', name, file);
            doFile(name, file);
        });

        _.each(indexes, function(index) {
            log.push(index.name);
            //console.log('!!!!indexes loading', index);
            doFile(index.name, index.file, true);
        });
    });
    //console.log('loaded', moduleName, _.uniq(log));
};

var pathReduce = function(files) {
    var keys, common, file;

    if (Object.keys(files).length === 1) {
        file = Object.keys(files)[0];
        files[file] = path.basename(file);
        return files;
    }

    keys = [];
    for (var file in files) {
        keys.push(files[file].split('/'));
    }

    common = 0;
    while(keys.every(function(key) {
        return key[common] === keys[0][common];
    })) {
        common++;
    }
    common = keys[0].slice(0, common).join('/') + '/';

    for (var file in files) {
        files[file] = files[file].substring(common.length);
    }
    return files;
};

var stripExt = function(files) {
    var filenames = Object.keys(files);
    // contains map of stripped filenames
    var conflicts = {};
    for (var i=0, l=filenames.length; i<l; i++) {
        (function(file, key) {
            var newKey = key.substr(0, key.length - path.extname(key).length);
            // if already file with same stripping
            if (conflicts.hasOwnProperty(newKey)) {
                // check if first conflict
                if (conflicts[newKey] !== false) {
                    // revert previous file stripping
                    files[conflicts[newKey][0]] = conflicts[newKey][1];
                    conflicts[newKey] = false;
                }
            } else {
                // strip key
                files[file] = newKey;
                // remember for possible later conflicts
                conflicts[newKey] = [file, key];
            }
        })(filenames[i], files[filenames[i]]);
    }
    return files;
};

$.load = function(dirs) {
    dirs = dirs || [__dirname + '/../..'];

    _.each(_.keys($), function(moduleName) {
        if (['load', 'console', 'start', 'express', 'server'].indexOf(moduleName) !== -1) {
            return;
        }

        var globbedDirs = [];
        _.each(dirs, function(dir) {
            var files = glob.sync(dir+'/'+moduleName+'/**/*{.js,.yaml,.ejs}');
            if (!files.length) {
                return;
            }
            var mapped = _.reduce(files, function(hash, file) {
                hash[file] = file;
                return hash;
            }, {});
            //console.log('\nmapped = ', mapped);
            var pathReduced = pathReduce(mapped);
            //console.log('pathReduced = ', pathReduced);
            var strippedExt = stripExt(pathReduced);
            //console.log('strippedExt = ', strippedExt);
            globbedDirs.push(strippedExt);
        });
        mapRequire(moduleName, globbedDirs);
    });

    return $;
};

$.console = function() {
    nodeConsole($);
    return $;
};

$.start = function(callback) {
    $.http = $.server.listen($.server.get('port'), function() {
        console.log('express-server listening on port ' + $.server.get('port'));
        return callback && callback(null, $);
    });
    return $;
};