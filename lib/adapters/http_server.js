'use strict';

var http = require('http');
var _ = require('underscore');
var contentType = require('content-type');
var AdapterRead = require('./adapter-read');
var Promise = require('bluebird');
var parsers = require('./parsers');

class ReadHTTPServer extends AdapterRead {
    constructor(options, params) {
        super(options, params);

        var allowed_methods = [ 'POST', 'PUT' ];

        if (options.method && allowed_methods.indexOf(options.method) === -1) {
            throw this.compileError('INVALID-OPTION-VALUE', {
                option: 'method',
                supported: allowed_methods.join(', ')
            });
        }

        this.port = options.port || 8080;
        this.method = options.method || 'POST';
        this.timeField = options.timeField;
        this.readEvery = options.every ? options.every.milliseconds() : 50;

        this.parserOptions = options;

        if (params.filter_ast) {
            throw this.compileError('ADAPTER-UNSUPPORTED-FILTER', {
                proc: 'read http_server',
                filter: 'filtering'
            });
        }

        this.points = [];
    }

    static allowedOptions() {
        return [
            'port', 'method', 'timeField', 'rootPath', 'every', 'separator',
            'commentSymbol', 'ignoreEmptyLines', 'allowIncompleteLines'
        ];
    }

    start() {
        this.server = http.createServer((req, res) => {
            var format;
            try {
                format = contentType.parse(req).type.split('/')[1];
            }
            catch(err) {
                // type is undefined
            }

            Promise.try(() => {
                if (req.method !== this.method) {
                    throw this.runtimeError('INVALID-HTTP-METHOD', {
                        types: 'POST'
                    });
                }

                if (format !== 'json' && format !== 'csv') {
                    throw this.runtimeError('INVALID-TYPE', {
                        types: 'csv, json'
                    });
                }

                var parser = parsers.getParser(format , this.parserOptions);
                return parser.parseStream(req, (points) => {
                    if (!_.isArray(points)) {
                        points = [points];
                    }

                    points = this.parseTime(points, { timeField: this.timeField });
                    this.points = this.points.concat(points);

                    this.logger.debug('got', points.length, 'points --',
                                      'pendingRead', !!this.pendingRead,
                                      'limit', this.pendingReadLimit);
                    if (this.pendingRead) {
                        this.pendingRead(this.readResult(this.pendingReadLimit));
                    }
                });
            })
            .then(() => {
                res.statusCode = 200;
                res.end();
            })
            .catch((err) => {
                this.handleListenError(res, err);
            });
        });

        this.server.listen({
            port: this.port,
            path: '/'
        });
    }

    read(from, to, limit, state) {
        this.logger.debug('in read --', this.points.length, 'buffered points');
        if (this.points.length > 0) {
            return this.readResult(limit);
        } else {
            return new Promise((resolve, reject) => {
                this.pendingRead = resolve;
                this.pendingReadLimit = limit;
            })
            .timeout(this.readEvery)
            .catch(Promise.TimeoutError, (err) => {
                this.logger.debug('read: no points arrived in', this.readEvery, 'ms');
                return {};
            });
        }
    }

    readResult(limit) {
        return {
            points: this.points.splice(0, limit)
        };
    }

    handleListenError(res, err) {
        res.statusMessage = err.message;
        res.statusCode = 400;

        if (err.code === 'INVALID-TYPE') {
            res.statusCode = 415;
        } else if (err.code === 'INVALID-HTTP-METHOD') {
            res.statusCode = 404;
        }

        this.trigger('error', err);
        res.end();
    }

    teardown() {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

function HttpServerAdapter(config) {
    return {
        name: 'http_server',
        read: ReadHTTPServer
    };
}

module.exports = HttpServerAdapter;
