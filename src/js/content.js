var $ = require("jquery");
var browser = require("webextension-polyfill");
var serialize_map = require("./serialize-map.js");

var transcribed = false;
var dict = null;
var pending = false;
var original = new Map();
var features = { stress: false, tie: true };

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
    var translated = text.split(/\b/u).map(function (x) {
        var upper = x.toUpperCase();
        if (dict && dict.has(upper)) {
            return dict.get(upper);
        }
        return x;
    }).join("");

    // Optionally strip tie bars when disabled
    if (!features.tie) {
        translated = translated.replace(/[\u0361\u035C]/g, "");
    }

    if (features.stress) {
        // Ensure no line breaks occur at stress marks by placing WORD JOINER (U+2060)
        // on both sides of ˈ and ˌ. Normalize to exactly one before and after.
        translated = translated
            .replace(/\u2060*ˈ/g, "\u2060ˈ")
            .replace(/ˈ\u2060*/g, "ˈ\u2060")
            .replace(/\u2060*ˌ/g, "\u2060ˌ")
            .replace(/ˌ\u2060*/g, "ˌ\u2060");
    } else {
        // Remove stress marks entirely when disabled
        translated = translated.replace(/[ˈˌ]/g, "");
    }
    return translated;
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
            if (msg.features) {
                features = Object.assign({ stress: true, tie: true }, msg.features);
            }
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
        case 'set-features':
            if (msg.features) {
                features = Object.assign({ stress: true, tie: true }, msg.features);
            }
            break;
        case 'reapply-transcription':
            if (transcribed) {
                original.forEach(function (value, node) {
                    if (node && node.nodeType === 3) {
                        node.nodeValue = value;
                    }
                });
                doTranscribe();
            }
            break;
    }
    return false;
}

browser.runtime.onMessage.addListener(messageDispatcher);
browser.runtime.sendMessage({ action: "transcript-check-page" });
