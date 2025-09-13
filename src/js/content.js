var $ = require("jquery");
var browser = require("webextension-polyfill");
var serialize_map = require("./serialize-map.js");

var transcribed = false;
var dict = null;
var pending = false;
var original = new Map();

var loadingIndicator = $('<div style="background-color: #fcc; border: 1px solid red; z-index: 10000; margin: 0; position: fixed" class="__no_transcribe">Loading...</div>');

// Elements to avoid modifying to preserve page structure and styles
var EXCLUDED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT',
    'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
    'SVG', 'MATH', 'IFRAME', 'CANVAS'
]);

function isInExcludedContext(node) {
    var el = node.parentNode;
    while (el && el.nodeType === 1) { // ELEMENT_NODE
        if (EXCLUDED_TAGS.has(el.tagName)) return true;
        if (el.classList && el.classList.contains('__no_transcribe')) return true;
        if (el.isContentEditable) return true;
        el = el.parentNode;
    }
    return false;
}

function translateText(text) {
    return text.split(/\b/u).map(function (x) {
        var upper = x.toUpperCase();
        if (dict && dict.has(upper)) {
            return dict.get(upper);
        }
        return x;
    }).join("");
}

function walkTextNodes(root, cb) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
            if (!node || !node.nodeValue || !/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
            if (isInExcludedContext(node)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    var current;
    while ((current = walker.nextNode())) {
        cb(current);
    }
}

function doTranscribe() {
    walkTextNodes(document.body || document.documentElement, function (node) {
        // Save original only once per node
        if (!original.has(node)) {
            original.set(node, node.nodeValue);
        }
        node.nodeValue = translateText(node.nodeValue);
    });
    transcribed = true;
    loadingIndicator.remove();
}

function toggleTranscribe() {
    if (transcribed) {
        // Restore only the nodes we changed
        original.forEach(function (value, node) {
            if (node && node.nodeType === 3) {
                node.nodeValue = value;
            }
        });
        original.clear();
        transcribed = false;
        loadingIndicator.remove();
    }
    else {
        if (dict == null) {
            pending = true;
            browser.runtime.sendMessage({ action: "get-dict" });
        } else {
            doTranscribe();
        }
    }
}

function messageDispatcher(msg) {
    switch (msg.action) {
        case "do-transcribe":
            $("body").prepend(loadingIndicator);
            window.setTimeout(toggleTranscribe, 1);
            break;
        case "send-dict":
            dict = serialize_map.jsonToMap(msg.dict);
            if (pending) {
                pending = false;
                doTranscribe();
            }
            break;
    }
    return false;
}

browser.runtime.onMessage.addListener(messageDispatcher);
browser.runtime.sendMessage({ action: "transcript-check-page" });
