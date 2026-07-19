import { spawn } from "node:child_process";

function run(command, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `${command} ${code} koduyla kapandı.`)));
    if (stdin) child.stdin.end(stdin);
  });
}

function appleString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

function keyCode(key) {
  const codes = { enter: 36, return: 36, tab: 48, escape: 53, delete: 51, space: 49, left: 123, right: 124, down: 125, up: 126 };
  return codes[String(key).toLowerCase()];
}

export class DesktopExecutor {
  async execute(step, resolvedValue) {
    if (process.platform !== "darwin") throw new Error("Masaüstü yürütücüsü bu sürümde macOS için etkin.");
    const parameters = step.parameters || {};
    if (parameters.appName) await run("open", ["-a", parameters.appName]);

    switch (step.type) {
      case "desktop.launch":
        if (!parameters.appName) throw new Error("Açılacak uygulama adı tanımlı değil.");
        return `${parameters.appName} açıldı.`;
      case "desktop.click":
        if (parameters.x === undefined || parameters.y === undefined) throw new Error("Masaüstü tıklama koordinatı tanımlı değil.");
        await run("/usr/bin/osascript", ["-"], `tell application "System Events" to click at {${parameters.x}, ${parameters.y}}\n`);
        return `Ekranda (${parameters.x}, ${parameters.y}) noktası tıklandı.`;
      case "desktop.type": {
        const value = resolvedValue ?? parameters.value;
        if (typeof value !== "string") throw new Error("Yazılacak değer veya hesap alanı tanımlı değil.");
        await run("/usr/bin/osascript", ["-"], `tell application "System Events" to keystroke "${appleString(value)}"\n`);
        return parameters.credentialField ? "Kasa değeri masaüstü alanına yazıldı." : "Masaüstü alanı dolduruldu.";
      }
      case "desktop.hotkey": {
        const keys = parameters.keys || [];
        const primary = keys.at(-1);
        if (!primary) throw new Error("Klavye kısayolu tanımlı değil.");
        const modifiers = keys.slice(0, -1).map((key) => ({ command: "command down", cmd: "command down", control: "control down", ctrl: "control down", option: "option down", alt: "option down", shift: "shift down" })[key.toLowerCase()]).filter(Boolean);
        const using = modifiers.length ? ` using {${modifiers.join(", ")}}` : "";
        const code = keyCode(primary);
        const action = code === undefined ? `keystroke "${appleString(primary)}"${using}` : `key code ${code}${using}`;
        await run("/usr/bin/osascript", ["-"], `tell application "System Events" to ${action}\n`);
        return "Klavye kısayolu çalıştırıldı.";
      }
      case "desktop.wait":
        await new Promise((resolve) => setTimeout(resolve, parameters.timeoutMs || 1000));
        return "Masaüstü bekleme adımı tamamlandı.";
      default:
        throw new Error(`Masaüstü yürütücüsü ${step.type} adımını desteklemiyor.`);
    }
  }
}
