import AppKit
import Darwin
import UniformTypeIdentifiers

private struct IconReport: Codable {
    enum Stage: String, Codable { case requesting, rendering, completed }
    let operatingSystem: String
    var stage = Stage.requesting
    var imageBytes: Int?
}

@main struct IconControl {
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 2 else {
            fputs("Usage: icon-control <report.json>\n", stderr)
            exit(2)
        }
        let destination = URL(fileURLWithPath: CommandLine.arguments[1])
        var report = IconReport(operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString)
        func save() throws {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(report)
            try data.write(to: destination, options: .atomic)
            print(String(decoding: data, as: UTF8.self))
            fflush(stdout)
        }
        try save()
        let image = NSWorkspace.shared.icon(for: .plainText)
        report.stage = .rendering
        try save()
        guard let data = image.tiffRepresentation, !data.isEmpty else {
            fputs("macOS returned no rendered file-type icon.\n", stderr)
            exit(1)
        }
        report.imageBytes = data.count
        report.stage = .completed
        try save()
    }
}
