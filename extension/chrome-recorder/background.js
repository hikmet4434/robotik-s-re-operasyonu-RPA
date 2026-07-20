async function getConfig() {
  const state = await chrome.storage.local.get(["apiBase", "sessionId", "recording"]);
  return {
    apiBase: (state.apiBase || "http://localhost:4100").replace(/\/$/, ""),
    sessionId: state.sessionId,
    recording: Boolean(state.recording)
  };
}

async function updateBadge(recording) {
  await chrome.action.setBadgeBackgroundColor({ color: recording ? "#dc2626" : "#64748b" });
  await chrome.action.setBadgeText({ text: recording ? "REC" : "" });
  await chrome.action.setTitle({ title: recording ? "OtoFlow Recorder · Kayıt sürüyor" : "OtoFlow Recorder" });
}

chrome.storage.local.get(["recording"], (state) => void updateBadge(Boolean(state.recording)));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.recording) void updateBadge(Boolean(changes.recording.newValue));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "OTOFLOW_EVENT") return false;
  void (async () => {
    try {
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
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Kayıt bağlantısı kesildi." });
    }
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
    }).catch(() => undefined);
  })();
});
