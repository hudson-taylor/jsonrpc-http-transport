/* global describe, it, before */
import assert from 'assert';
import https from 'https';
import domain from 'domain';

import openport from 'openport';
import request from 'request';
import express from 'express';
import bodyParser from 'body-parser';

import JSONRPCHTTP from '../src';
import * as SSLKeys from './sslkeys';

describe('JSONRPC JSONRPCHTTP Transport', function () {
  let transport;
  let port;
  let host = '127.0.0.1';

  before(function (done) {
    openport.find(function (err, _port) {
      assert.ifError(err);
      port = _port;
      done();
    });
  });

  describe('Transport', function () {
    it('should create transport instance', function () {
      transport = new JSONRPCHTTP({ port: port, host: host });
      assert.strictEqual(transport instanceof JSONRPCHTTP, true);
    });

    it('should throw if required arguments are not passed in', function () {
      assert.throws(function () {
        let transport = new JSONRPCHTTP(); //eslint-disable-line
      });

      assert.throws(function () {
        let transport = new JSONRPCHTTP({ //eslint-disable-line
          host: '0.0.0.0'
        });
      });

      assert.throws(function () {
        let transport = new JSONRPCHTTP({ //eslint-disable-line
          port: 80
        });
      });
    });

    it('should set defaults correctly', function () {
      let transport = new JSONRPCHTTP({
        port: port,
        host: host
      });

      assert.strictEqual(transport.config.ssl, false);
      assert.strictEqual(transport.config.path, '/ht-jsonrpc');

      transport = new JSONRPCHTTP({
        port: port,
        host: host,
        ssl: true,
        path: '/other'
      });

      assert.strictEqual(transport.config.ssl, true);
      assert.strictEqual(transport.config.path, '/other');
    });

    it('should not require new keyword for creation', function () {
      let transport = JSONRPCHTTP({ port: port, host: host });

      assert.strictEqual(transport instanceof JSONRPCHTTP, true);
    });

    it('should not rquire host & port when app is passed in', function () {
      let app = express();

      let transport = JSONRPCHTTP({ app: app });

      assert.strictEqual(transport instanceof JSONRPCHTTP, true);
    });
  });

  describe('Server', function () {
    let server;

    it('should have created server', function () {
      server = new transport.Server();
      assert.strictEqual(server instanceof transport.Server, true);
    });

    it('should start server when listen is called', function (done) {
      server.listen(function (err) {
        assert.ifError(err);

        assert.strictEqual(server.listening, true);

        done();
      });
    });

    it('should not try and start another server if listen is called again', function (done) {
      server.listen(function (err) {
        assert.ifError(err);
        done();
      });
    });

    it('should stop server when stop is called', function (done) {
      server.stop(function (err) {
        assert.ifError(err);

        assert.strictEqual(server.listening, false);

        done();
      });
    });

    it('should still call callback if server is not listening', function (done) {
      server.stop(function (err) {
        assert.ifError(err);

        done();
      });
    });

    it('should call fn when request is received', function (done) {
      let _method = 'echo';
      let _data = { hello: 'world' };

      server = new transport.Server(function (method, data, callback) {
        assert.strictEqual(method, _method);
        assert.deepStrictEqual(data, _data);
        callback(null, _data);
      });

      server.listen(function (err) {
        assert.ifError(err);

        request({
          url: 'http://' + host + ':' + port + '/ht-jsonrpc',
          method: 'POST',
          json: { method: _method, params: _data, id: 99, jsonrpc: '2.0' }
        }, function (e, r, body) {
          assert.ifError(e);
          assert.deepStrictEqual(body.result, _data);
          server.stop(done);
        });
      });
    });

    it('should return error if fn does', function (done) {
      let _err = 'err!';

      server = new transport.Server(function (method, data, callback) {
        return callback(_err);
      });

      server.listen(function (err) {
        assert.ifError(err);

        request({
          url: 'http://' + host + ':' + port + '/ht-jsonrpc',
          method: 'POST',
          json: { jsonrpc: '2.0', id: 99 }
        }, function (e, r, body) {
          assert.ifError(e);

          assert.strictEqual(body.error.message, _err);

          server.stop(done);
        });
      });
    });

    it('should enable HTTPS if SSL options are specified', function (done) {
      let _method = 'something';
      let _data = { hello: 'world' };

      let cert = SSLKeys.cert;
      let key = SSLKeys.key;
      let ca = SSLKeys.ca;

      let transport = new JSONRPCHTTP({
        port: port,
        host: host,
        ssl: {
          cert: cert,
          key: key,
          ca: [ca],
          agent: false,
          rejectUnauthorized: false
        }
      });

      let server = new transport.Server(function (method, data, callback) {
        return callback(null, data);
      });

      assert.strictEqual(server.config.ssl.cert, SSLKeys.cert);

      server.listen(function (err) {
        assert.ifError(err);

        // This needs to be set or else http.request will
        // throw an error because we're using self signed
        // certificates..
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        request({
          url: 'https://' + host + ':' + port + '/ht-jsonrpc',
          method: 'POST',
          json: { method: _method, params: _data, jsonrpc: '2.0', id: 99 }
        }, function (e, r, body) {
          assert.ifError(e);

          assert.strictEqual(body.result.hello, _data.hello);

          server.stop(done);
        });
      });
    });

    it('should stringify error if needed', function (done) {
      let _errmsg = 'hello world error';

      server = new transport.Server(function (method, data, callback) {
        callback(new Error(_errmsg));
      });

      server.listen(function (err) {
        assert.ifError(err);

        request({
          url: 'http://' + host + ':' + port + '/ht-jsonrpc',
          method: 'POST',
          json: { method: 'blah', params: 'blah', jsonrpc: '2.0', id: 99 }
        }, function (e, r, body) {
          assert.ifError(e);
          assert.deepStrictEqual(body.error.message, _errmsg);
          server.stop(done);
        });
      });
    });

    it('should let multiple services listen on the same port using app', function (done) {
      let app = express();

      let transport1 = new JSONRPCHTTP({ app: app, path: '/one' });
      let transport2 = new JSONRPCHTTP({ app: app, path: '/two' });

      let server1 = new transport1.Server(function (method, data, callback) { //eslint-disable-line
        assert.strictEqual(method, 'method1');
        return callback(null, data);
      });

      let server2 = new transport2.Server(function (method, data, callback) { //eslint-disable-line
        assert.strictEqual(method, 'method2');
        return callback(null, data);
      });

      let server = app.listen(port, host, function (err) {
        assert.ifError(err);

        request({
          url: 'http://' + host + ':' + port + '/one',
          method: 'POST',
          json: { method: 'method1', params: 'method 1', jsonrpc: '2.0', id: 99 }
        }, function (e, r, body) {
          assert.ifError(e);
          assert.deepStrictEqual(body.result, 'method 1');

          request({
            url: 'http://' + host + ':' + port + '/two',
            method: 'POST',
            json: { method: 'method2', params: 'method 2', jsonrpc: '2.0', id: 95 }
          }, function (e, r, body2) {
            assert.ifError(e);
            assert.deepStrictEqual(body2.result, 'method 2');

            server.close(done);
          });
        });
      });
    });

    it('should noop listen if custom app is passed', function (done) {
      let app = express();

      let transport = JSONRPCHTTP({ app: app });

      let server = new transport.Server();

      server.listen(done);
    });

    it('should noop stop if custom app is passed', function (done) {
      let app = express();

      let transport = JSONRPCHTTP({ app: app });

      let server = new transport.Server();

      // Make sure server thinks it's listening
      server.listening = true;

      server.stop(done);
    });
  });

  describe('Client', function () {
    it('should have created client', function () {
      let client = new transport.Client();
      assert.strictEqual(client instanceof transport.Client, true);
    });

    it('should provide noop\'d versions of unused methods', function () {
      let noop = function noop () {};

      let client = new transport.Client();

      client.connect(noop);
      client.disconnect(noop);
    });

    it('should be able to call method', function (done) {
      let _method = 'hello';
      let _data = { something: 'world' };

      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        let _req$body = req.body;
        let method = _req$body.method;
        let params = _req$body.params;

        assert.strictEqual(method, _method);
        assert.deepStrictEqual(params, _data);

        const payload = { jsonrpc: '2.0', id: _req$body.id, result: params };
        res.json(payload);
      });

      let client = new transport.Client();

      let _server = app.listen(port, host, function () {
        client.call(_method, _data, function (err, response) {
          assert.ifError(err);
          assert.deepStrictEqual(response, _data);
          _server.close(done);
        });
      });
    });

    it('should be able to call method with non ascii characters', function (done) {
      let _method = 'hello';
      let _data = { thai_chars: 'วรรณยุต' };

      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        let _req$body = req.body;
        let method = _req$body.method;
        let params = _req$body.params;
        let id = _req$body.id;

        assert.strictEqual(method, _method);
        assert.deepStrictEqual(params, _data);

        const payload = { jsonrpc: '2.0', id, result: params };
        res.json(payload);
      });

      let client = new transport.Client();

      let _server = app.listen(port, host, function () {
        client.call(_method, _data, function (err, response) {
          assert.ifError(err);
          assert.deepStrictEqual(response, _data);
          _server.close(done);
        });
      });
    });

    it('should successfully return error', function (done) {
      let _method = 'hello';
      let _error = 'therewasanerror';

      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        res.json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: _error
          },
          id: req.body.id
        });
      });

      let client = new transport.Client();

      let _server = app.listen(port, host, function () {
        client.call(_method, null, function (err) {
          assert.deepStrictEqual(err.message, _error);
          _server.close(done);
        });
      });
    });

    it('should return error if request cannot be made', function (done) {
      let client = new transport.Client();

      client.config.port = 2000;

      client.call('', {}, function (err) {
        assert.strictEqual(err.substr(0, 20), 'connect ECONNREFUSED');

        client.config.port = port;

        done();
      });
    });

    it('should enable HTTPS if SSL options are specified', function (done) {
      let _method = 'hello';
      let _data = { something: 'world' };

      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        let _req$body2 = req.body;
        let method = _req$body2.method;
        let params = _req$body2.params;

        assert.strictEqual(req.secure, true);
        assert.strictEqual(method, _method);
        assert.deepStrictEqual(params, _data);

        const payload = { jsonrpc: '2.0', id: _req$body2.id, result: params };
        res.json(payload);
      });

      let transport = new JSONRPCHTTP({
        host: host,
        port: port,
        ssl: true
      });

      let client = new transport.Client();

      let _app = https.createServer(SSLKeys, app);

      _app.listen(port, host, function () {
        client.call(_method, _data, function (err, response) {
          assert.ifError(err);
          assert.deepStrictEqual(response, _data);
          _app.close(done);
        });
      });
    });

    it('should return response even if response is not valid JSON', function (done) {
      let str = 'hello';

      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        res.end(str);
      });

      let client = new transport.Client();

      let _server = app.listen(port, host, function () {
        client.call('a', 'b', function (err) {
          assert.strictEqual(err, str);
          _server.close(done);
        });
      });
    });

    it('should not crash if response is undefined', function (done) {
      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        res.json(undefined);
      });

      let client = new transport.Client();

      let _server = app.listen(port, host, function () {
        client.call('a', 'b', function (err, response) {
          assert.ifError(err);
          assert.strictEqual(response, undefined);
          _server.close(done);
        });
      });
    });
    it('should not call callback twice if callee throws from callback function', function (done) {
      this.timeout(1000);
      let app = express();
      app.use(bodyParser.json());
      app.post('/ht-jsonrpc', function (req, res) {
        const payload = { jsonrpc: '2.0', id: req.body.id, result: req.body };
        res.json(payload);
      });

      let d = domain.create();

      let client = new transport.Client();

      let _server = app.listen(port, host, function () {
        d.on('error', function (err) {
          assert.strictEqual(err.message, 'unwind');
          return _server.close(done);
        });
        d.run(function () {
          client.call('method', {
            hello: 'world'
          }, function (err, response) {
            if (err) {
              assert.strictEqual(err, undefined, 'err not undefined, stack has unwinded back into Transport');
            }

            throw new Error('unwind');
          });
        });
      });
    });
  });
});
