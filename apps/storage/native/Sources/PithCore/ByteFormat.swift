import Foundation

/// A size to three significant figures in 1024-based units: "3.11 GB", "88.0 MB", "741 MB". It is the rule the
/// Disk tab's `formatBytes` (src/lib/format.ts) follows, so native views and the disk map show a size the same
/// way, and table columns keep one width as values change.
public func formatBytes(_ bytes: UInt64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB", "PB"]
    guard bytes > 0 else { return "0 B" }
    var value = Double(bytes)
    var unit = 0
    while value >= 1024, unit < units.count - 1 { value /= 1024; unit += 1 }
    let decimals = value >= 100 || unit == 0 ? 0 : value >= 10 ? 1 : 2
    return String(format: "%.\(decimals)f %@", value, units[unit])
}
