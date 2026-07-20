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

async function createSession(forceNew = false) {
  const apiBase = apiBaseInput.value.replace(/\/$/, "");
  if (!forceNew) {
    const recordingsResponse = await fetch(`${apiBase}/api/recordings`);
    const recordings = await recordingsResponse.json().catch(() => []);
    const recent = Array.isArray(recordings) ? recordings.find((item) => item.status === "recording" && Date.now() - new Date(item.updatedAt).getTime() < 10 * 60 * 1_000) : null;
    if (recent) {
      await saveState({ apiBase, sessionId: recent.id, recording: false });
      return recent;
    }
  }
  const response = await fetch(`${apiBase}/api/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: titleInput.value,
      goal: goalInput.value,
      appName: "Chrome Recorder"
    })
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof session.error === "string" ? session.error : "OtoFlow bağlantısı kurulamadı. Bilgisayar bağlantısının açık olduğundan emin olun.");
  await saveState({ apiBase, sessionId: session.id, recording: false });
  return session;
}

async function notifyActiveTab(recording) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url || "")) throw new Error("Kaydetmek istediğiniz normal web sayfasını açıp tekrar deneyin.");
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "OTOFLOW_RECORDING_STATE", recording });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "OTOFLOW_RECORDING_STATE", recording });
  }
}

createBtn.addEventListener("click", async () => {
  try {
    const session = await createSession(true);
    statusEl.textContent = `Yeni kayıt hazır: ${session.id}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

toggleBtn.addEventListener("click", async () => {
  try {
    let state = await chrome.storage.local.get(["apiBase", "sessionId", "recording"]);
    if (!state.recording) {
      await createSession(false);
      state = await chrome.storage.local.get(["apiBase", "sessionId", "recording"]);
    }
    const recording = !state.recording;
    await notifyActiveTab(recording);
    await saveState({ apiBase: apiBaseInput.value.replace(/\/$/, ""), sessionId: state.sessionId || sessionInput.value, recording });
    statusEl.textContent = recording ? "Kayıt başladı. İşleminizi normal şekilde yapın." : "Kayıt durdu. Adımlarınız OtoFlow’a kaydedildi.";
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

loadState();
