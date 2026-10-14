import AppKit
import WebKit
import CryptoKit

struct Settings: Codable {
    let channel: String
    var opacity: Double
    var scale: Double
    var width: Int
    var height: Int
    var shadow: Bool
    var clickThrough: Bool
    var valid: Bool {
        channel.range(of: "^[a-z0-9_]{1,25}$", options: .regularExpression) != nil &&
        opacity.isFinite && (0.2...1).contains(opacity) && scale.isFinite && (0.5...2).contains(scale) &&
        (240...1600).contains(width) && (200...1600).contains(height)
    }
}
struct Configuration: Codable { let url: String; let account: String; let settings: Settings }
struct Command: Codable { let kind: String; let settings: Settings? }
struct State: Codable { let open: Bool; let interactive: Bool; let settings: Settings; let x: Int; let y: Int; let recovery: String }

@MainActor final class Overlay: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    let config: Configuration
    let address: URL
    let defaults = UserDefaults(suiteName: "tv.subcult.chatty-overlay.geometry")!
    let geometryKey: String
    var settings: Settings
    var window: NSWindow!
    var web: WKWebView!
    var tray: NSStatusItem!
    var lastPulse = Date()
    var timer: Timer?
    var initialized = false
    var recovery = "Use the Cat Overlay menu to recover interaction or close"

    init(_ config: Configuration, _ address: URL) {
        self.config = config; self.address = address; self.settings = config.settings
        let scope = config.account + "|" + address.scheme! + "://" + address.host! + ":" + String(address.port ?? 0)
        geometryKey = "geometry." + SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        super.init()
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let options = WKWebViewConfiguration()
        // Public read-only chat gets a fresh data store; web-account cookies are never imported.
        options.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: options)
        web.navigationDelegate = self
        web.underPageBackgroundColor = .clear
        window = NSWindow(contentRect: NSRect(x: 80, y: 80, width: settings.width, height: settings.height), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Cat Overlay · " + settings.channel
        window.isReleasedWhenClosed = false
        window.contentMinSize = NSSize(width: 240, height: 200)
        window.contentMaxSize = NSSize(width: 1600, height: 1600)
        window.delegate = self; window.contentView = web
        window.isOpaque = false; window.backgroundColor = .clear
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if let geometry = defaults.string(forKey: geometryKey) { window.setFrame(NSRectFromString(geometry), display: false); settings.width = Int(window.contentRect(forFrameRect: window.frame).width); settings.height = Int(window.contentRect(forFrameRect: window.frame).height) }
        clampGeometry()
        tray = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        tray.button?.title = "Cat Overlay"
        let menu = NSMenu()
        add(menu, "Recover interaction (Escape in window)", #selector(recover))
        add(menu, "Enable click-through for 10 seconds without a browser lease", #selector(clickThrough))
        add(menu, "Reset geometry", #selector(resetGeometry))
        add(menu, "Close overlay", #selector(close))
        tray.menu = menu
        apply(settings)
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: address))
        initialized = true
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { if let self, self.window.ignoresMouseEvents && Date().timeIntervalSince(self.lastPulse) > 10 { self.recover() } }
        }
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 { MainActor.assumeIsolated { self?.recover() }; return nil }; return event
        }
        emit()
        // Only bounded newline-delimited JSON commands arrive on the inherited pipe.
        DispatchQueue.global().async { [weak self] in
            var line = Data()
            while let byte = try? FileHandle.standardInput.read(upToCount: 1), !byte.isEmpty {
                if byte[0] == 10 {
                    guard let command = try? JSONDecoder().decode(Command.self, from: line) else { DispatchQueue.main.async { self?.recover() }; break }
                    line.removeAll(keepingCapacity: true)
                    DispatchQueue.main.async { self?.command(command) }
                } else { line.append(byte); if line.count > 4096 { break } }
            }
            DispatchQueue.main.async { self?.recover() }
        }
    }
    func add(_ menu: NSMenu, _ title: String, _ action: Selector) { let item = NSMenuItem(title: title, action: action, keyEquivalent: ""); item.target = self; menu.addItem(item) }
    func apply(_ next: Settings) {
        settings = next; window.alphaValue = next.opacity; window.hasShadow = next.shadow
        web.pageZoom = next.scale
        window.ignoresMouseEvents = next.clickThrough
        window.setContentSize(NSSize(width: next.width, height: next.height))
        clampGeometry(); saveGeometry()
    }
    func clampGeometry() {
        let screen = NSScreen.screens.first(where: { $0.visibleFrame.intersects(window.frame) }) ?? NSScreen.main
        guard let screen else { return }; let bounds = screen.visibleFrame; var frame = window.frame
        frame.size.width = min(max(frame.width, 240), bounds.width)
        frame.size.height = min(max(frame.height, 200), bounds.height)
        frame.origin.x = min(max(frame.minX, bounds.minX), bounds.maxX - frame.width)
        frame.origin.y = min(max(frame.minY, bounds.minY), bounds.maxY - frame.height)
        window.setFrame(frame, display: true)
    }
    func saveGeometry() { if initialized { defaults.set(NSStringFromRect(window.frame), forKey: geometryKey) } }
    func windowDidMove(_ notification: Notification) { saveGeometry() }
    func windowDidResize(_ notification: Notification) { saveGeometry() }
    func windowWillClose(_ notification: Notification) { NSApp.terminate(nil) }
    @objc func recover() {
        window.ignoresMouseEvents = false; settings.clickThrough = false; window.alphaValue = max(settings.opacity, 0.6)
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        recovery = "Interactive recovery active; Cat Overlay menu remains available"
    }
    @objc func clickThrough() { settings.clickThrough = true; window.ignoresMouseEvents = true; lastPulse = Date() }
    @objc func resetGeometry() { window.setFrame(NSRect(x: 80, y: 80, width: 400, height: 600), display: true); clampGeometry(); saveGeometry(); recover() }
    @objc func close() { window.close() }
    func command(_ command: Command) {
        lastPulse = Date()
        switch command.kind {
        case "status": break
        case "recover": recover()
        case "update":
            guard let next = command.settings, next.valid, next.channel == settings.channel else { recover(); emit(); return }
            apply(next)
        default: recover()
        }
        emit()
    }
    func emit() {
        let frame = window.frame
        var observed = settings; observed.shadow = window.hasShadow; observed.scale = web.pageZoom; observed.opacity = window.alphaValue; observed.width = Int(web.bounds.width); observed.height = Int(web.bounds.height)
        let state = State(open: true, interactive: !window.ignoresMouseEvents, settings: observed, x: Int(frame.minX), y: Int(frame.minY), recovery: recovery)
        if let raw = try? JSONEncoder().encode(state) { FileHandle.standardOutput.write(raw + Data([10])) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, url.scheme == address.scheme, url.host == address.host, url.port == address.port, url.user == nil else { decisionHandler(.cancel); return }
        // No login, settings or unrelated browsing in the isolated public overlay.
        decisionHandler(url.path == address.path && url.query == address.query ? .allow : .cancel)
    }
}

let arguments = CommandLine.arguments
if arguments.count != 3 || arguments[1] != "--config" || arguments[2].utf8.count > 8192 { exit(2) }
guard let raw = Data(base64Encoded: arguments[2]), let config = try? JSONDecoder().decode(Configuration.self, from: raw), config.settings.valid,
      config.account.range(of: "^[1-9][0-9]{0,19}$", options: .regularExpression) != nil,
      let url = URL(string: config.url), url.host != nil, url.user == nil, url.password == nil, url.fragment == nil,
      url.scheme == "https" || url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? ""),
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.path == "/", components.queryItems?.count == 3,
      components.queryItems?.first(where: { $0.name == "channel" })?.value == config.settings.channel,
      components.queryItems?.first(where: { $0.name == "overlay" })?.value == "1",
      components.queryItems?.first(where: { $0.name == "video" })?.value == "off" else { exit(2) }
MainActor.assumeIsolated {
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = Overlay(config, url)
app.delegate = delegate
app.run()

}
