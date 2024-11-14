/*
 Many plugins do not clear pending timeouts when unloaded, but destroy their state
 by removing dom nodes from document, setting some properties to null, etc.
 So when callback of setTimeout is called it is likely to cause uncaught exceptions
 trying to access properties on an object that is set to null.
 When this happens tests can fail because of errors unrelated to them.

 This module allows to cancel all pending timeouts and xhr requests
 to prevent code from previous test from interfering with the next test
*/

var XMLHttpRequestOriginal = window.XMLHttpRequest;
var WorkerOriginal = window.Worker;
var setTimeoutOriginal = window.setTimeout;
var setIntervalOriginal = window.setInterval;

var currentTestId;

var counter = 0;
var activeTimeouts = {};
var activeIntervals = {};
function open(testId) {
    close();
    currentTestId = testId;
    activeTimeouts = {};
    activeIntervals = {};
    window.setTimeout = function(callback, timeout, ...args) {
        if (setTimeout.paused) return null;
        var id = setTimeoutOriginal(function() {
            if (currentTestId != testId) return console.error("dangling timeout from " + testId);
            delete activeTimeouts[id];
            callback.apply(this, args);
        }, timeout);
        if (typeof id == "number") activeTimeouts[id] = id;
        else {
            id.__counter = ++counter;
            activeTimeouts[id.__counter] = id;
            id = id.__counter;
        }
        return id;
    };
    setTimeout.force = function() {
        return setTimeoutOriginal.apply(window, arguments);
    };
    window.setInterval = function(callback, timeout, ...args) {
        if (setTimeout.paused) return null;
        var id = setIntervalOriginal(function() {
            if (currentTestId != testId) return console.error("dangling timeout from " + testId);
            callback.apply(this, args);
        }, timeout);
        if (typeof id == "number") activeTimeouts[id] = id;
        else {
            id.__counter = ++counter;
            activeTimeouts[id.__counter] = id;
            id = id.__counter;
        }
        return id;
    };

    window.XMLHttpRequest = function() {
        var req = new XMLHttpRequestOriginal();
        if (currentTestId != testId) {
            req.open = function() {
                console.error(testId + " tried to open xhr after test completion");
            };
            req.setRequestHeader = req.send = function() {};
        }
        return req;
    };

    function WrappedWorker(url) {
        var worker = new WorkerOriginal(url);
        worker.terminateOriginal = worker.terminate;
        worker.terminate = function() {
            if (!window.__coverage__) return worker.terminateOriginal();
            worker.addEventListener(
                "message",
                function(e) {
                    e.stopPropagation();
                    if (e.data.__coverage__) {
                        window.c9Test.sendCoverageReport(e.data.__coverage__, function() {});
                        worker.terminateOriginal();
                    }
                },
                true
            );
            worker.postMessage({
                command: "eval",
                args: [
                    "\
                if (typeof __coverage__ != 'undefined')\
                    postMessage({__coverage__: __coverage__})\
                ",
                ],
            });
        };
        return worker;
    }
    if (WorkerOriginal) window.Worker = WrappedWorker;
}

function close() {
    Object.keys(activeTimeouts).forEach(function(i) {
        clearTimeout(activeTimeouts[i]);
    });
    Object.keys(activeIntervals).forEach(function(i) {
        clearTimeout(activeIntervals[i]);
    });
    currentTestId = "after-" + currentTestId;
}

module.exports = {open, close};
