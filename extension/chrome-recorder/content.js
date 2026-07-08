let recording = false;

chrome.storage.local.get(["recording"], (state) => {
  recording = Boolean(state.recording);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "OTOFLOW_RECORDING_STATE") recording = Boolean(message.recording);
});

function cssPath(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return "unknown";
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    if (current.name) part += `[name="${current.name}"]`;
    else if (current.className && typeof current.className === "string") part += `.${current.className.trim().split(/\s+/).slice(0, 2).join(".")}`;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function textFor(element) {
  const text = element?.innerText || element?.textContent || element?.ariaLabel || element?.placeholder || element?.name || element?.id || element?.tagName;
  return String(text || "Öğe").trim().slice(0, 120);
}

function appArea() {
  return document.title || location.hostname || "Web uygulaması";
}

function emit(payload) {
  if (!recording) return;
  chrome.runtime.sendMessage({ type: "OTOFLOW_EVENT", payload });
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rect = target.getBoundingClientRect();
    emit({
      type: "click",
      label: `${textFor(target)} tıklandı`,
      target: cssPath(target),
      appArea: appArea(),
      selectorHint: cssPath(target),
      region: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      }
    });
  },
  true
);

document.addEventListener(
  "change",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const isSecret = target.type === "password" || /password|pin|otp|sms|token|secret/i.test(target.name || target.id || target.placeholder || "");
    emit({
      type: target instanceof HTMLSelectElement ? "select" : "input",
      label: `${textFor(target)} alanı değişti`,
      target: cssPath(target),
      value: isSecret ? "MASKED_SECRET" : String(target.value || "").slice(0, 160),
      appArea: appArea(),
      selectorHint: cssPath(target)
    });
  },
  true
);

document.addEventListener(
  "submit",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    emit({
      type: "click",
      label: "Form gönderildi",
      target: cssPath(target),
      appArea: appArea(),
      selectorHint: cssPath(target)
    });
  },
  true
);
