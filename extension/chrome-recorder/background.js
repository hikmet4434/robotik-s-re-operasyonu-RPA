async function getConfig() {
  const state = await chrome.storage.local.get(["apiBase", "sessionId", "recording"]);
  return {
    apiBase: (state.apiBase || "http://localhost:4100").replace(/\/$/, ""),
    sessionId: state.sessionId,
    recording: Boolean(state.recording)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "OTOFLOW_EVENT") return false;
  void (async () => {
    const config = await getConfig();
    if (!config.recording || !config.sessionId) {
      sendResponse({ ok: false, skipped: true });
      return;
    }

    const response = await fetch(`${config.apiBase}/api/recordings/${config.sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload)
    });
    const body = await response.json().catch(() => ({}));
    sendResponse({ ok: response.ok, body });
  })();
  return true;
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  void (async () => {
    const config = await getConfig();
    if (!config.recording || !config.sessionId) return;
    await fetch(`${config.apiBase}/api/recordings/${config.sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "navigation",
        label: "URL değişti",
        target: changeInfo.url,
        value: changeInfo.url,
        appArea: tab.title || "Chrome",
        selectorHint: "browser.url"
      })
    });
  })();
});
