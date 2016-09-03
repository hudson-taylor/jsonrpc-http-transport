// This is a transport that uses JSONRPC over HTTP requests
// to communicate between Client & Server.
import http from 'http';
import https from 'https';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

const utils = require('ht-utils');

function JSONRPCHTTPTransportServer (config) {
  let _JSONRPCHTTPTransportServer = function (fn) {
    this.config = config;

    if (this.config.app !== undefined) {
      this.customApp = true;
    }

    let eApp = this.config.app || express();
    eApp.use(bodyParser.json());

    // Check if we need to respond with CORS headers
    // Needed if you want to use HT in the browser.
    if (this.config.cors !== undefined && !this.customApp) {
      eApp.use(cors());
    }

    eApp.post(this.config.path, function (req, res) {
      // verify version number
      if (req.body.jsonrpc !== '2.0') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'require version 2.0' },
          id: req.body.id
        });
      }

      fn(req.body.method, req.body.params, function (err, data) {
        if (err) {
          return res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: utils.formatError(err).error },
            id: req.body.id
          });
        }
        return res.json({
          jsonrpc: '2.0',
          result: data,
          id: req.body.id
        });
      });
    });
    if (this.config.ssl) {
      this.app = https.createServer(this.config.ssl, eApp);
    } else {
      this.app = http.createServer(eApp);
    }
  };

  _JSONRPCHTTPTransportServer.prototype.listen = function (done) {
    if (this.listening) return done();
    if (this.customApp) return done();
    this.app.listen(this.config.port, this.config.host, () => {
      this.listening = true;
      done();
    });
  };

  _JSONRPCHTTPTransportServer.prototype.stop = function (done) {
    if (!this.listening) return done();
    if (this.customApp) return done();
    this.app.close(() => {
      this.listening = false;
      done();
    });
  };

  return _JSONRPCHTTPTransportServer;
}

function JSONRPCHTTPTransportClient (config) {
  let _JSONRPCHTTPTransportClient = function () {
    this.config = config;
  };

  _JSONRPCHTTPTransportClient.prototype.connect = function (done) {
    // noop
    done();
  };

  _JSONRPCHTTPTransportClient.prototype.disconnect = function (done) {
    // noop
    done();
  };

  _JSONRPCHTTPTransportClient.prototype.call = function (method, data, callback) {
    let json = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params: data,
      id: Math.floor(Math.random() * 100000)
    });
    let options = {
      host: this.config.host,
      port: this.config.port,
      path: this.config.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': new Buffer(json).length
      }
    };

    let req = (this.config.ssl ? https : http).request(options, function (res) {
      res.setEncoding('utf8');
      let response = '';
      res.on('data', function (data) {
        response += data;
      });
      res.on('end', function () {
        try {
          if (!response || response === 'undefined') {
            return callback();
          }
          var parsedJSON = JSON.parse(response);
        } catch (e) {
          // Return response here anyway
          return callback(utils.formatError(response).error);
        }
        if (parsedJSON.error) {
          return callback(parsedJSON.error);
        }
        return callback(null, parsedJSON.result);
      });
    });

    req.on('error', function (err) {
      return callback(utils.formatError(err).error);
    });

    req.write(json);
    req.end();
  };

  return _JSONRPCHTTPTransportClient;
}

function JSONRPCHTTPTransport (config) {
  if (!(this instanceof JSONRPCHTTPTransport)) {
    return new JSONRPCHTTPTransport(config);
  }
  if (!config || typeof config !== 'object' || (!config.app && (!config.host || !config.port))) {
    throw new Error('You must pass a configuration object to the HTTP Transport.');
  }
  if (config.path === undefined) {
    config.path = '/ht-jsonrpc';
  }
  if (config.ssl === undefined) {
    config.ssl = false;
  }
  this.config = config;
  this.Server = JSONRPCHTTPTransportServer(config);
  this.Client = JSONRPCHTTPTransportClient(config);
}

export default JSONRPCHTTPTransport;
