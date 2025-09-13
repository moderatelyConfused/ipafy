var $ = require("jquery");
var browser = require("webextension-polyfill");

var btnToggle = $("#btn-toggle");
var labelStatus = $("#toggle-status");

function updateToggleText(transcribing) {
    labelStatus.text(transcribing ? "on" : "off");
    labelStatus.toggleClass("status-active", !!transcribing);
}

function messageDispatcher(message, sender) {
    switch(message.action) {
    case "send-check":
        updateToggleText(message.transcribing);
        break;
    }
    return false;
}

btnToggle.click(function() {
    browser.runtime.sendMessage({action: "toggle-transcription"});
});

browser.runtime.onMessage.addListener(messageDispatcher);
browser.runtime.sendMessage({action: "transcript-check-popup"});

// Initialize default UI
updateToggleText(false);
