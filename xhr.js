/* eslint-env mocha */
"use strict";
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

var Url = require("url");
var http = require("http");
var https = require("https");
var ws = require("ws");

var cookie = [];

// based on node-XMLHttpRequest with added support for set-cookie
exports.XMLHttpRequest = function() {
    var self = this;
    var request;
    var response;
    var settings = {};
    var defaultHeaders = {
        "User-Agent": "node-XMLHttpRequest",
        Accept: "*/*",
    };

    if (cookie.length) defaultHeaders.cookie = cookie.join(";");

    var headers = {};
    var headersCase = {};
    var sendFlag = false;
    var errorFlag = false;
    var listeners = {};
    this.UNSENT = 0;
    this.OPENED = 1;
    this.HEADERS_RECEIVED = 2;
    this.LOADING = 3;
    this.DONE = 4;
    this.readyState = this.UNSENT;
    this.onreadystatechange = null;
    this.responseText = "";
    this.responseXML = "";
    this.status = null;
    this.statusText = null;

    this.withCredentials = false;

    this.upload = this;

    this.open = function(method, url, async, user, password) {
        var location = global.location;
        var host = location.protocol + "//" + location.host;
        if (/^\//.test(url)) url = host + url;

        this.abort();
        errorFlag = false;

        settings = {
            method: method,
            url: url.toString(),
            async: typeof async !== "boolean" ? true : async,
            user: user || null,
            password: password || null,
        };

        setState(this.OPENED);
    };

    this.setRequestHeader = function(header, value) {
        if (this.readyState !== this.OPENED) {
            throw new Error(
                "INVALID_STATE_ERR: setRequestHeader can only be called when state is OPEN"
            );
        }
        if (sendFlag) {
            throw new Error("INVALID_STATE_ERR: send flag is true");
        }
        header = headersCase[header.toLowerCase()] || header;
        headersCase[header.toLowerCase()] = header;
        headers[header] = headers[header] ? headers[header] + ", " + value : value;
    };

    this.getResponseHeader = function(header) {
        if (
            typeof header === "string" &&
            this.readyState > this.OPENED &&
            response &&
            response.headers &&
            response.headers[header.toLowerCase()] &&
            !errorFlag
        ) {
            return response.headers[header.toLowerCase()];
        }

        return null;
    };

    this.getAllResponseHeaders = function() {
        if (this.readyState < this.HEADERS_RECEIVED || errorFlag) {
            return "";
        }
        var result = "";

        for (var i in response.headers) {
            // Cookie headers are excluded
            if (i !== "set-cookie" && i !== "set-cookie2") {
                result += i + ": " + response.headers[i] + "\r\n";
            }
        }
        return result.substr(0, result.length - 2);
    };

    this.getRequestHeader = function(name) {
        if (typeof name === "string" && headersCase[name.toLowerCase()]) {
            return headers[headersCase[name.toLowerCase()]];
        }

        return "";
    };

    this.send = function(data) {
        if (this.readyState !== this.OPENED) {
            throw new Error("INVALID_STATE_ERR: connection must be opened before send() is called");
        }

        if (sendFlag) {
            throw new Error("INVALID_STATE_ERR: send has already been called");
        }

        var ssl = false;
        var url = Url.resolveObject(window.location.href, settings.url);
        var host;
        // Determine the server
        switch (url.protocol) {
            case "https:":
                ssl = true;
            // SSL & non-SSL both need host, no break here.
            case "http:":
                host = url.hostname;
                break;
            default:
                throw new Error("Protocol not supported.");
        }

        // Default to port 80. If accessing localhost on another port be sure
        // to use http://localhost:port/path
        var port = url.port || (ssl ? 443 : 80);
        // Add query string if one is used
        var uri = url.pathname + (url.search ? url.search : "");

        // Set the defaults if they haven't been set
        for (var name in defaultHeaders) {
            if (!headersCase[name.toLowerCase()]) {
                headers[name] = defaultHeaders[name];
            }
        }

        // Set the Host header or the server may reject the request
        headers.Host = host;
        // IPv6 addresses must be escaped with brackets
        if (url.host[0] === "[") {
            headers.Host = "[" + headers.Host + "]";
        }
        if (!((ssl && port === 443) || port === 80)) {
            headers.Host += ":" + url.port;
        }

        // Set Basic Auth if necessary
        if (settings.user) {
            if (typeof settings.password === "undefined") {
                settings.password = "";
            }
            var authBuf = Buffer.from(settings.user + ":" + settings.password);
            headers.Authorization = "Basic " + authBuf.toString("base64");
        }

        // Set content length header
        if (settings.method === "GET" || settings.method === "HEAD") {
            data = null;
        } else if (data) {
            headers["Content-Length"] = Buffer.isBuffer(data)
                ? data.length
                : Buffer.byteLength(data);

            if (!this.getRequestHeader("Content-Type")) {
                headers["Content-Type"] = "text/plain;charset=UTF-8";
            }
        } else if (settings.method === "POST") {
            // For a post with no data set Content-Length: 0.
            // This is required by buggy servers that don't meet the specs.
            headers["Content-Length"] = 0;
        }

        var options = {
            host: host,
            port: port,
            path: uri,
            method: settings.method,
            headers: headers,
            agent: false,
            withCredentials: self.withCredentials,
        };

        // Reset error flag
        errorFlag = false;

        // Handle async requests
        if (!settings.async) throw new Error("sync xhr is not supported");

        // Use the proper protocol
        var doRequest = ssl ? https.request : http.request;

        // Request is being sent, set send flag
        sendFlag = true;

        // As per spec, this is called here for historical reasons.
        self.dispatchEvent("readystatechange");
        // Handler for the response
        var responseHandler = function responseHandler(resp) {
            // Set response var to the response we got back
            // This is so it remains accessable outside this scope
            response = resp;
            // Check for redirect
            // @TODO Prevent looped redirects
            if (
                response.statusCode === 301 ||
                response.statusCode === 302 ||
                response.statusCode === 303 ||
                response.statusCode === 307
            ) {
                // Change URL to the redirect location
                settings.url = response.headers.location;
                var url = Url.resolveObject(window.location.href, settings.url);
                // Set host var in case it's used later
                host = url.hostname;
                // Options for the new request
                var newOptions = {
                    hostname: url.hostname,
                    port: url.port,
                    path: url.path,
                    method: response.statusCode === 303 ? "GET" : settings.method,
                    headers: headers,
                    withCredentials: self.withCredentials,
                };

                // Issue the new request
                request = doRequest(newOptions, responseHandler).on("error", errorHandler);
                request.end();
                // @TODO Check if an XHR event needs to be fired here
                return;
            }

            response.setEncoding("utf8");

            setState(self.HEADERS_RECEIVED);
            self.status = response.statusCode;

            response.on("data", function(chunk) {
                // Make sure there's some data
                if (chunk) {
                    self.responseText += chunk;
                }
                // Don't emit state changes if the connection has been aborted.
                if (sendFlag) {
                    setState(self.LOADING);
                }
            });

            response.on("end", function() {
                if (response.headers["set-cookie"]) {
                    var newCookies = response.headers["set-cookie"].map(function(x) {
                        return x.split(";")[0];
                    });
                    cookie.push(...newCookies);
                }
                if (sendFlag) {
                    // Discard the end event if the connection has been aborted
                    setState(self.DONE);
                    sendFlag = false;
                }
            });

            response.on("error", function(error) {
                self.handleError(error);
            });
        };

        // Error handler for the request
        var errorHandler = function errorHandler(error) {
            self.handleError(error);
        };

        // Create the request
        request = doRequest(options, responseHandler).on("error", errorHandler);

        // Node 0.4 and later won't accept empty data. Make sure it's needed.
        if (data) {
            request.write(data);
        }

        request.end();

        self.dispatchEvent("loadstart");
    };

    this.handleError = function(error) {
        this.status = 0;
        this.statusText = error;
        this.responseText = error.stack;
        errorFlag = true;
        setState(this.DONE);
        console.log(error);
        this.dispatchEvent("error", {target: this});
    };

    this.abort = function() {
        if (request) {
            request.abort();
            request = null;
        }

        headers = defaultHeaders;
        this.status = 0;
        this.responseText = "";
        this.responseXML = "";

        errorFlag = true;

        if (
            this.readyState !== this.UNSENT &&
            (this.readyState !== this.OPENED || sendFlag) &&
            this.readyState !== this.DONE
        ) {
            sendFlag = false;
            setState(this.DONE);
        }
        this.readyState = this.UNSENT;
        this.dispatchEvent("abort");
    };

    this.addEventListener = function(event, callback) {
        if (!(event in listeners)) {
            listeners[event] = [];
        }
        // Currently allows duplicate callbacks. Should it?
        listeners[event].push(callback);
    };

    this.removeEventListener = function(event, callback) {
        if (event in listeners) {
            // Filter will return a new array with the callback removed
            listeners[event] = listeners[event].filter(function(ev) {
                return ev !== callback;
            });
        }
    };

    this.dispatchEvent = function(name, event) {
        if (!event) event = {};
        event.target = this;
        if (typeof self["on" + name] === "function") {
            self["on" + name](event);
        }
        if (name in listeners) {
            for (var i = 0, len = listeners[name].length; i < len; i++) {
                listeners[name][i].call(self, event);
            }
        }
    };

    var setState = function(state) {
        if (state == self.LOADING || self.readyState !== state) {
            self.readyState = state;

            if (settings.async || self.readyState < self.OPENED || self.readyState === self.DONE) {
                self.dispatchEvent("readystatechange");
            }

            if (self.readyState === self.DONE && !errorFlag) {
                self.dispatchEvent("load");
                // @TODO figure out InspectorInstrumentation::didLoadXHR(cookie)
                self.dispatchEvent("loadend");
            }
        }
    };
};

exports.WebSocket = function(url) {
    var socket = new ws(url, null, {
        headers: {
            cookie: cookie.join(";"),
        },
    });
    Object.defineProperty(socket, "binaryType", {
        get: function get() {
            return this._binaryType;
        },
        set: function set(type) {
            this._binaryType = "arraybuffer";
        },
    });

    return socket;
};
