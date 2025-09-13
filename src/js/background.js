var $ = require("jquery")
var browser = require("webextension-polyfill");
var serialize_map = require("./serialize-map.js");

var tabToTranscribing = new Map();
tabToTranscribing.getOrDefault = function(key, def) {
    if (this.has(key)) return this.get(key);
    else return def;
};
var dict = null;
var tabToFeatures = new Map(); // { stress: false, tie: true }

function getFeatures(tabId) {
    if (!tabToFeatures.has(tabId)) {
        tabToFeatures.set(tabId, { stress: false, tie: true });
    }
    return tabToFeatures.get(tabId);
}

function extractLine(line) {
    var m = line.match(/^([-A-Z0-9]+)  (.+)$/);
    if (m == null) {
        return null;
    }
    return m.slice(1);
}

function parseDict(lines) {
    var trimmedLines = lines.map(function(x) { return x.trim(); });
    dict = new Map();
    trimmedLines.map(extractLine).filter(function (x) { return x != null;}).forEach(function (entry) {
        dict.set(entry[0], entry[1]);
    });
    return dict;
}

/** Returns a promise */
function getCurrentTabId() {
    return new Promise(function(accept, reject) {
        browser.tabs.query({currentWindow: true, active: true}).then(function (response) { return accept(response[0].id); }, reject);
    });
}

function getDict() {
    $.get(browser.runtime.getURL("resources/cmudict"), null, null, "text").then(function (data) {
        dict = parseDict(data.split("\n"));
    }, function (error) {
        console.log("Error retrieving dict");
        console.log(error);
    });
}

function wrapIdGetter(f) {
    return function(tabId) {
        if (tabId === undefined) {
            getCurrentTabId().then(f);
        }
        else {
            f(tabId);
        }
    }
}

function sendDict(tabId) {
    if (dict == null) {
        return;
    }
    msg = {action: "send-dict", dict: serialize_map.mapToJson(dict)};
    browser.tabs.sendMessage(tabId, msg);
}

function doTranscribe(tabId) {
    var features = getFeatures(tabId);
    browser.tabs.sendMessage(tabId, {action: "do-transcribe", dict: dict, features: features});
}

var sendDict = wrapIdGetter(sendDict);
var doTranscribe = wrapIdGetter(doTranscribe);

function messageDispatcher(message, sender) {
    switch(message.action) {
    case "toggle-transcription":
        // implies a check
        getCurrentTabId().then(function(tabId) {
            tabToTranscribing.set(tabId, !tabToTranscribing.getOrDefault(tabId, false));
            doTranscribe(tabId);
            browser.runtime.sendMessage({action: "send-check", transcribing: tabToTranscribing.getOrDefault(tabId, false), features: getFeatures(tabId)});
        });
        break;
    case "transcript-check-page":
        getCurrentTabId().then(function(tabId) {
            if (tabToTranscribing.getOrDefault(tabId, false)) {
                doTranscribe(tabId);
            }
        });
        break;
    case 'set-features':
        getCurrentTabId().then(function(tabId) {
            var current = getFeatures(tabId);
            var incoming = message.features || {};
            var next = { stress: ('stress' in incoming) ? !!incoming.stress : current.stress,
                         tie: ('tie' in incoming) ? !!incoming.tie : current.tie };
            tabToFeatures.set(tabId, next);
            // Notify content and popup; reapply if currently transcribing
            browser.tabs.sendMessage(tabId, { action: 'set-features', features: next });
            if (tabToTranscribing.getOrDefault(tabId, false)) {
                browser.tabs.sendMessage(tabId, { action: 'reapply-transcription' });
            }
            browser.runtime.sendMessage({ action: 'send-check', transcribing: tabToTranscribing.getOrDefault(tabId, false), features: next });
        });
        break;
    case "transcript-check-popup":
        getCurrentTabId().then(function(tabId) {
            browser.runtime.sendMessage({action: "send-check", transcribing: tabToTranscribing.getOrDefault(tabId, false), features: getFeatures(tabId)});
        });
        break;
    case "get-dict":
        sendDict();
        break;
    }
    return false;
}

function deletedTabListener(tabId) {
    tabToTranscribing.delete(tabId);
    tabToFeatures.delete(tabId);
}

browser.tabs.onRemoved.addListener(deletedTabListener);
browser.runtime.onMessage.addListener(messageDispatcher);
getDict();
