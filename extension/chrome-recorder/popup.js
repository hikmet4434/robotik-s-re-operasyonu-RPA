const apiBaseInput = document.querySelector("#apiBase");
const sessionInput = document.querySelector("#sessionId");
const titleInput = document.querySelector("#title");
const goalInput = document.querySelector("#goal");
const statusEl = document.querySelector("#status");
const createBtn = document.querySelector("#create");
const toggleBtn = document.querySelector("#toggle");

async function loadState() {
  const state = await chrome.storage.local.get(["apiBase", "sessionId", "recording"]);
  apiBaseInput.value = state.apiBase || "http://localhost:4100";
  sessionInput.value = state.sessionId || "";
  toggleBtn.textContent = state.recording ? "Kaydı Durdur" : "Kaydı Başlat";
}

async function saveState(partial) {
  await chrome.storage.local.set(partial);
  await loadState();
}

createBtn.addEventListener("click", async () => {
  try {
    const apiBase = apiBaseInput.value.replace(/\/$/, "");
    const response = await fetch(`${apiBase}/api/recordings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value,
        goal: goalInput.value,
        appName: "Chrome Recorder"
      })
    });
    const session = await response.json();
    if (!response.ok) throw new Error(session.error || "Oturum açılamadı.");
    await saveState({ apiBase, sessionId: session.id, recording: false });
    statusEl.textContent = `Oturum hazır: ${session.id}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

toggleBtn.addEventListener("click", async () => {
  const state = await chrome.storage.local.get(["apiBase", "sessionId", "recording"]);
  if (!state.sessionId) {
    statusEl.textContent = "Önce oturum aç.";
    return;
  }
  const recording = !state.recording;
  await saveState({ apiBase: apiBaseInput.value.replace(/\/$/, ""), sessionId: sessionInput.value, recording });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "OTOFLOW_RECORDING_STATE", recording });
  }
  statusEl.textContent = recording ? "Kayıt başladı." : "Kayıt durdu.";
});

loadState();
