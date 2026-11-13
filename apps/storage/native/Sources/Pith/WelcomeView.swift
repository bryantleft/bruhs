import SwiftUI

/// Where Pith lives: shown on first launch, and whenever Pith is opened again while it runs. macOS 26 lets a user turn
/// off any app's menu bar item and a full menu bar hides items behind the camera, and nothing reports either, so this
/// window is the way back in.
struct WelcomeView: View {
    let activity: ActivityModel
    let glyph: NSImage?
    let open: (WindowTab) -> Void
    let close: () -> Void

    var body: some View {
        let capHeight = BruhsType.bodyFace.capHeight
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
                            Image(nsImage: glyph).renderingMode(.template).foregroundStyle(BruhsColor.text)
                                // Center the circle on the letters, keeping the sentence's first baseline when it wraps.
                                .alignmentGuide(.firstTextBaseline) { dimensions in dimensions.height / 2 + capHeight / 2 }
                                .accessibilityLabel("the Pith icon")
                        }
                        Text("for CPU, memory and disk at a glance.")
                            .multilineTextAlignment(.leading)
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
            DisclosureGroup {
                Text("Enable Pith in System Settings, under Menu Bar. A full menu bar can hide its icon behind the camera.")
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Open Menu Bar Settings…") { openMenuBarSettings() }.buttonStyle(.bruhsGhost).padding(.leading, -10)
            } label: {
                Text("Can’t find the menu bar icon?").font(BruhsType.label).foregroundStyle(BruhsColor.text)
            }
            .help("Reopen Pith from Finder to return to this window.")
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
