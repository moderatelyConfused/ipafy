var $ = require("jquery");
var browser = require("webextension-polyfill");

var btnToggle = $("#btn-toggle");
var labelStatus = $("#toggle-status");
var cbStress = $("#feat-stress");
var cbTie = $("#feat-tie");

function updateToggleText(transcribing) {
    labelStatus.text(transcribing ? "on" : "off");
    labelStatus.toggleClass("status-active", !!transcribing);
}

function messageDispatcher(message, sender) {
    switch(message.action) {
    case "send-check":
        updateToggleText(message.transcribing);
        if (message.features) {
            cbStress.prop('checked', !!message.features.stress);
            cbTie.prop('checked', !!message.features.tie);
        }
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

function sendFeatures() {
    browser.runtime.sendMessage({ action: 'set-features', features: {
        stress: cbStress.is(':checked'),
        tie: cbTie.is(':checked')
    }});
}

cbStress.on('change', sendFeatures);
cbTie.on('change', sendFeatures);
