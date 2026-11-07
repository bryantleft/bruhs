import Foundation

/// A storage size to three significant figures in decimal units, as Finder and Disk Utility count since Mac OS X 10.6:
/// "3.11 GB", "88.0 MB", "741 MB". The disk map's `formatBytes` (src/lib/format.ts) follows the same rule, so native
/// views and the map show a size the same way, and table columns keep one width as values change.
public func formatBytes(_ bytes: UInt64) -> String { format(bytes, base: 1000) }

/// A memory size to three significant figures in 1024-based units, as Activity Monitor counts memory: "3.11 GB".
public func formatMemory(_ bytes: UInt64) -> String { format(bytes, base: 1024) }

private func format(_ bytes: UInt64, base: Double) -> String {
    let units = ["B", "KB", "MB", "GB", "TB", "PB"]
    guard bytes > 0 else { return "0 B" }
    var value = Double(bytes)
    var unit = 0
    while value >= base, unit < units.count - 1 { value /= base; unit += 1 }
    // Rounding can carry into the next unit: 999.6 MB is "1.00 GB", not "1000 MB".
    if unit > 0 || value >= 1, value.rounded() >= base, unit < units.count - 1 { value /= base; unit += 1 }
    let decimals = value >= 99.95 || unit == 0 ? 0 : value >= 9.995 ? 1 : 2
    return String(format: "%.\(decimals)f %@", value, units[unit])
}
