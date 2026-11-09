import PithCore
import SwiftUI

/// The update window: Pith's own face for Sparkle, showing one step of an update session at a time. It closes itself
/// when the session ends.
struct UpdateView: View {
    let updates: Updates
    let close: () -> Void
    /// The permission question's checkbox, off as Sparkle's default is.
    @State private var downloads = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 56, height: 56)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).font(BruhsType.title).foregroundStyle(BruhsColor.text)
                    if let detail {
                        Text(detail)
                            .font(BruhsType.body)
                            .foregroundStyle(BruhsColor.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    // A wait with no measure of its own, shown with the words it belongs to.
                    if phase == .checking || phase.isInstalling { BruhsSpinner().padding(.top, 4) }
                }
            }
            content
            actions
        }
        .padding(24)
        // Leading, so a step with nothing full width, such as installing, keeps to the window's left edge.
        .frame(width: 440, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .background(BruhsColor.canvas)
        .tint(BruhsColor.accent)
        .onChange(of: updates.flow.phase == .idle) { _, idle in if idle { close() } }
    }

    private var phase: UpdatePhase { updates.flow.phase }

    private var title: String {
        switch phase {
        case .idle: "No update in progress"
        case .askingPermission: "Check for updates automatically?"
        case .checking: "Checking for updates"
        case .noUpdate(.newest): "Pith is up to date"
        case .noUpdate: "No update for this Mac"
        case .available(let offer): "Pith \(offer.version) is available"
        case .downloading(let offer, _): "Downloading Pith \(offer.version)"
        case .preparing(let offer, _): "Preparing Pith \(offer.version)"
        case .readyToInstall(let offer): "Pith \(offer.version) is ready to install"
        case .installing(let offer): "Installing Pith \(offer.version)"
        case .failed: "Pith couldn’t update"
        }
    }

    private var detail: String? {
        switch phase {
        case .idle: nil
        case .checking: "Pith is asking GitHub for its newest version."
        case .askingPermission:
            "Once a day, Pith can ask GitHub, where its releases are published, whether a newer version is out. It sends nothing about this Mac."
        case .noUpdate(.newest): "You have version \(updates.version), the newest."
        case .noUpdate(.needsNewerSystem(let version)): "\(newest(version)) needs a later version of macOS."
        case .noUpdate(.needsOlderSystem(let version)): "\(newest(version)) doesn’t support this version of macOS."
        case .noUpdate(.needsAppleSilicon(let version)): "\(newest(version)) needs a Mac with Apple silicon."
        case .available(let offer) where offer.informationOnly: "You have \(updates.version). This version is offered only as a download from the web."
        case .available: "You have \(updates.version)."
        case .downloading: nil
        case .preparing: "Checking that the download is Pith’s, signed by its publisher."
        case .readyToInstall: "It downloaded in the background. Installing quits and reopens Pith."
        case .installing: "Pith reopens when it’s done."
        case .failed(let message): message
        }
    }

    private func newest(_ version: String?) -> String { version.map { "Pith \($0)" } ?? "The newest Pith" }

    @ViewBuilder private var content: some View {
        switch phase {
        case .askingPermission:
            Toggle("Also download and install updates automatically", isOn: $downloads)
                .toggleStyle(.checkbox)
                .font(BruhsType.body)
        case .available(let offer):
            if !offer.notes.isEmpty { notes(offer.notes) }
            if !offer.informationOnly {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let size = offer.size, !offer.downloaded { LabeledFigure(label: "Download", value: bytes(size)) }
                    Text("Installing quits and reopens Pith.").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                }
            }
        case .downloading(_, let progress):
            VStack(alignment: .leading, spacing: 8) {
                UpdateProgressBar(fraction: progress.fraction)
                Text(received(progress)).font(BruhsType.caption).foregroundStyle(BruhsColor.textSecondary)
            }
        case .preparing(_, let fraction):
            UpdateProgressBar(fraction: fraction)
        case .idle, .checking, .noUpdate, .readyToInstall, .installing, .failed:
            EmptyView()
        }
    }

    /// "2.1 MB of 5.2 MB", or what has arrived while the size is unknown.
    private func received(_ progress: DownloadProgress) -> String {
        guard let expected = progress.expected, progress.fraction != nil else { return "\(bytes(progress.received)) received" }
        return "\(bytes(progress.received)) of \(bytes(expected))"
    }

    private func notes(_ paragraphs: [String]) -> some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                    Text(verbatim: paragraph)
                        .font(BruhsType.body)
                        .foregroundStyle(BruhsColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            // The well's rounded corners leave the scroll bar this much room.
            .bruhsScrollers(inset: 4)
        }
        // As tall as the notes, up to a height that keeps the window on a small display; longer notes scroll. Laid out
        // in one pass, so the window opens at its size rather than growing once the notes are measured.
        .frame(maxHeight: 220)
        .fixedSize(horizontal: false, vertical: true)
        .bruhsWell()
        .accessibilityLabel("Release notes")
    }

    @ViewBuilder private var actions: some View {
        switch phase {
        case .askingPermission:
            HStack {
                Spacer()
                Button("Don’t Check") { updates.answerPermission(checks: false, downloads: false) }
                Button("Check Automatically") { updates.answerPermission(checks: true, downloads: downloads) }
                    .keyboardShortcut(.defaultAction)
            }
        case .checking, .downloading:
            HStack {
                Spacer()
                Button("Cancel") { updates.close() }.keyboardShortcut(.cancelAction)
            }
        case .noUpdate, .failed:
            HStack {
                Spacer()
                Button("OK") { updates.close() }.keyboardShortcut(.defaultAction)
            }
        case .available(let offer):
            HStack {
                if !offer.critical { Button("Skip This Version") { updates.choose(.skip) } }
                Spacer()
                Button("Later") { updates.choose(.later) }.keyboardShortcut(.cancelAction)
                if offer.informationOnly {
                    if let page = offer.page {
                        Button("Open Release Page") {
                            NSWorkspace.shared.open(page)
                            updates.choose(.later)
                        }
                        .keyboardShortcut(.defaultAction)
                    }
                } else {
                    Button("Install and Relaunch") { updates.choose(.install) }.keyboardShortcut(.defaultAction)
                }
            }
        case .readyToInstall:
            HStack {
                Spacer()
                Button("Later") { updates.choose(.later) }.keyboardShortcut(.cancelAction)
                Button("Install and Relaunch") { updates.choose(.install) }.keyboardShortcut(.defaultAction)
            }
        case .idle, .preparing, .installing:
            EmptyView()
        }
    }
}

private extension UpdatePhase {
    var isInstalling: Bool {
        if case .installing = self { true } else { false }
    }
}

/// How far a download or its unpacking has come; a spinner while that's unknown.
private struct UpdateProgressBar: View {
    let fraction: Double?

    var body: some View {
        if let fraction {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(BruhsColor.hairline)
                    Capsule().fill(BruhsColor.accentFill).frame(width: proxy.size.width * min(1, max(0, fraction)))
                }
            }
            .frame(height: 6)
            .accessibilityElement()
            .accessibilityLabel("Progress")
            .accessibilityValue("\(Int((fraction * 100).rounded())) percent")
        } else {
            BruhsSpinner()
        }
    }
}
