import AppKit
import Darwin
import Metal
import SwiftUI
import os

private struct GraphicsReport: Codable {
    struct Device: Codable {
        let name: String
        let architecture: String
        let supportsMac2: Bool
    }

    let operatingSystem: String
    let executableArchitecture: String
    let defaultDevicePresent: Bool
    let devices: [Device]
    var canvasDrawn = false
    var hostingCompleted = false
}

@main struct GraphicsControl {
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 2 else {
            fputs("Usage: graphics-control <report.json>\n", stderr)
            exit(2)
        }
        let destination = URL(fileURLWithPath: CommandLine.arguments[1])
        #if arch(x86_64)
        let architecture = "x86_64"
        #else
        let architecture = "arm64"
        #endif
        var report = GraphicsReport(
            operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
            executableArchitecture: architecture,
            defaultDevicePresent: MTLCreateSystemDefaultDevice() != nil,
            devices: MTLCopyAllDevices().map {
                GraphicsReport.Device(name: $0.name, architecture: $0.architecture.name, supportsMac2: $0.supportsFamily(.mac2))
            }
        )
        func save() throws {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(report)
            try data.write(to: destination, options: .atomic)
            print(String(decoding: data, as: UTF8.self))
            fflush(stdout)
        }
        try save()
        guard report.defaultDevicePresent else {
            fputs("No default Metal device; this host cannot verify the graphics path.\n", stderr)
            exit(1)
        }

        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        let drawn = OSAllocatedUnfairLock(initialState: false)
        let canvas = Canvas { context, size in
            let bounds = CGRect(origin: .zero, size: size).insetBy(dx: 12, dy: 12)
            context.fill(Path(roundedRect: bounds, cornerRadius: 16), with: .color(.blue))
            drawn.withLock { $0 = true }
        }.frame(width: 160, height: 100)
        let window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: 160, height: 100),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = NSHostingView(rootView: canvas)
        window.orderFront(nil)
        // The runner-images#15251 control aborts within this one-second display interval.
        RunLoop.main.run(until: Date().addingTimeInterval(1))
        report.canvasDrawn = drawn.withLock { $0 }
        report.hostingCompleted = true
        try save()
        window.orderOut(nil)
        guard report.canvasDrawn else {
            fputs("The Canvas drawing callback never ran; graphics are unverified.\n", stderr)
            exit(1)
        }
    }
}
