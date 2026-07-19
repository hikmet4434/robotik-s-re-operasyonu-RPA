import AppKit
import CoreGraphics
import Foundation

func emitClick(_ event: CGEvent) {
    let point = event.location
    let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "macOS Uygulaması"
    let payload: [String: Any] = [
        "type": "note",
        "label": "\(appName) ekranında tıklama",
        "target": "desktop:\(Int(point.x)):\(Int(point.y))",
        "appArea": appName,
        "selectorHint": "local-agent",
        "region": ["x": Int(point.x), "y": Int(point.y), "w": 1, "h": 1]
    ]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}

let mask = CGEventMask(1 << CGEventType.leftMouseDown.rawValue | 1 << CGEventType.rightMouseDown.rawValue)
guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: { _, _, event, _ in
    emitClick(event)
    return Unmanaged.passUnretained(event)
}, userInfo: nil) else {
    fputs("Accessibility izni gerekli: Sistem Ayarları > Gizlilik ve Güvenlik > Erişilebilirlik.\n", stderr)
    exit(2)
}

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
