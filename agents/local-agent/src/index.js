import http from "node:http";

const apiBase = process.env.OTOFLOW_API_BASE || "http://localhost:4100";
const sessionId = process.env.OTOFLOW_RECORDING_SESSION_ID || "";
const port = Number(process.env.OTOFLOW_LOCAL_AGENT_PORT || 4687);

function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  });
}

function maskSensitive(value) {
  if (!value) return value;
  if (/pin|otp|sms|şifre|sifre|password|token|secret|banka|e[-\s]?imza/i.test(value)) {
    return "MASKED_SECRET";
  }
  return String(value).slice(0, 160);
}

async function sendEvent(recordingSessionId, event) {
  if (!recordingSessionId) throw new Error("OTOFLOW_RECORDING_SESSION_ID gerekli.");
  return postJson(`${apiBase}/api/recordings/${recordingSessionId}/events`, {
    type: event.type || "note",
    label: event.label || "Yerel ajan olayı",
    target: event.target || "desktop",
    value: maskSensitive(event.value),
    appArea: event.appArea || "Yerel Masaüstü",
    selectorHint: event.selectorHint || "local-agent",
    region: event.region
  });
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "OtoFlow Local Agent", apiBase }));
      return;
    }
    if (req.url === "/event" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", async () => {
        try {
          const body = JSON.parse(raw || "{}");
          const result = await sendEvent(body.sessionId || sessionId, body.event || body);
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port, () => {
    console.log(`OtoFlow Local Agent listening on http://localhost:${port}`);
    console.log(`API: ${apiBase}`);
  });
}

if (process.argv.includes("--demo-event")) {
  await sendEvent(sessionId, {
    type: "note",
    label: "Yerel ajan demo olayı",
    target: "desktop.demo",
    value: "Masaüstü/ERP işi için demo event",
    appArea: "Yerel Masaüstü",
    selectorHint: "local-agent.demo"
  });
  console.log("Demo event sent.");
} else {
  startServer();
}
