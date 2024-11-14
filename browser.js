if (typeof process != "undefined" && process.versions) {
    loadAndPatchMockDom();
    var requireNode = require;
    var EventEmitter = require("events");
    // backwards compatibility for node 8
    if (!EventEmitter.prototype.off) {
        EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
    }
    global.XMLHttpRequest = requireNode("./xhr").XMLHttpRequest;
    global.WebSocket = requireNode("./xhr").WebSocket;
    global.location = require("url").parse("http://localhost:5353/");
    global.document.location = global.location;
}

var asyncContext = require("./async-context");

function Storage(_items) {
    this.getItem = function(n) {
        return _items[n];
    };
    this.setItem = function(n, data) {
        var size = 0;
        Object.keys(_items).forEach(function(x) {
            size += ((x == n ? data : _items[x]) + "").length;
        });

        if (size > 40000) {
            throw new Error("Exceeded the quota");
        }
        _items[n] = data + "";
        return data;
    };
    this.removeItem = function(n) {
        delete _items[n];
    };
    this.clear = function() {
        _items = Object.create(null);
    };
    this.__defineGetter__("length", function() {
        return Object.keys(_items).length;
    });
}
Storage.create = function resetStorage(window, name) {
    var s = {};
    s.__proto__ = new Storage(s);
    s.__defineGetter__("__proto__", function() {});
    s.__defineSetter__("__proto__", function() {});
    if (name)
        window.__defineGetter__(name, function() {
            return s;
        });
    return s;
};
Storage.create(window, "localStorage");
Storage.create(window, "sessionStorage");
exports.Storage = Storage;