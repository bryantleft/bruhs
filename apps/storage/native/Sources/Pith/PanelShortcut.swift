import Carbon.HIToolbox
import Observation

/// A global shortcut that opens the panel from any app, off until the user turns it on. Control-Option-Command-P:
/// since macOS 15, shortcuts made of Option alone, or Option and Shift, no longer register.
@MainActor @Observable final class PanelShortcut {
    static let display = "⌃⌥⌘P"
    var enabled = UserDefaults.standard.bool(forKey: Setting.panelShortcut.rawValue) {
        didSet {
            UserDefaults.standard.set(enabled, for: .panelShortcut)
            enabled ? register() : unregister()
        }
    }
    /// Set when macOS refused the shortcut, usually because another app holds it.
    private(set) var problem: String?
    @ObservationIgnored private var hotKey: EventHotKeyRef?
    @ObservationIgnored private var handler: EventHandlerRef?
    @ObservationIgnored private let action: () -> Void

    init(action: @escaping () -> Void) {
        self.action = action
        if enabled { register() }
    }

    private func register() {
        guard hotKey == nil else { return }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            // Carbon calls this on the main thread, with the shortcut's owner as its context.
            guard let context else { return OSStatus(eventNotHandledErr) }
            MainActor.assumeIsolated { Unmanaged<PanelShortcut>.fromOpaque(context).takeUnretainedValue().action() }
            return noErr
        }, 1, &spec, context, &handler)
        let id = EventHotKeyID(signature: OSType(0x5049_5448), id: 1) // "PITH"
        let status = RegisterEventHotKey(UInt32(kVK_ANSI_P), UInt32(cmdKey | optionKey | controlKey), id, GetApplicationEventTarget(), 0, &hotKey)
        problem = status == noErr ? nil : "macOS didn't accept \(Self.display). Another app may already use it."
    }

    private func unregister() {
        if let hotKey { UnregisterEventHotKey(hotKey) }
        if let handler { RemoveEventHandler(handler) }
        hotKey = nil; handler = nil; problem = nil
    }
}
