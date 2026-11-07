import SwiftUI

/// Where Pith lives: shown on first launch, and whenever Pith is opened again while it runs. macOS 26 lets a user turn
/// off any app's menu bar item and a full menu bar hides items behind the camera, and nothing reports either, so this
/// window is the way back in.
struct WelcomeView: View {
    static let seenKey = "welcomeSeen"
    let activity: ActivityModel
    let glyph: NSImage?
    let open: (WindowTab) -> Void
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 56, height: 56)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Pith lives in the menu bar").font(BruhsType.title).foregroundStyle(BruhsColor.text)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("Click")
                        if let glyph {
                            Image(nsImage: glyph).renderingMode(.template).foregroundStyle(BruhsColor.text).accessibilityLabel("the Pith icon")
                        }
                        Text("for CPU, memory and disk at a glance.")
                    }
                    .font(BruhsType.body)
                    .foregroundStyle(BruhsColor.textSecondary)
                }
            }
            HStack(spacing: 8) {
                Button("Open Activity") { open(.activity) }.buttonStyle(.bruhsSoft)
                Button("Open Disk") { open(.disk) }.buttonStyle(.bruhsGhost)
            }
            LaunchAtLoginToggle()
                .toggleStyle(.checkbox)
                .font(BruhsType.body)
                .tint(BruhsColor.accent)
            Rectangle().fill(BruhsColor.hairline).frame(height: 1)
            VStack(alignment: .leading, spacing: 6) {
                Text("Don’t see Pith in the menu bar?").font(BruhsType.label).foregroundStyle(BruhsColor.text)
                Text("macOS can turn off an app’s menu bar item, and a full menu bar hides items behind the camera. Turn Pith on in System Settings, in Menu Bar. Opening Pith from Finder brings back this window.")
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Open Menu Bar Settings…") { openMenuBarSettings() }.buttonStyle(.bruhsGhost).padding(.leading, -10)
            }
            HStack {
                Spacer()
                Button("Done", action: close).keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 440)
        .fixedSize(horizontal: false, vertical: true)
        .background(BruhsColor.canvas)
    }
}
