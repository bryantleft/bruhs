import Foundation
import IOKit
import IOKit.ps
import IOKit.pwr_mgt

/// The battery, as macOS's own battery menu reports it.
public struct BatteryState: Equatable, Sendable {
    /// 0 to 100.
    public let percent: Int
    public let isCharging: Bool
    /// On the power adapter, charging or not.
    public let onPower: Bool
    /// Minutes to empty while on battery; nil while macOS is still estimating or on power.
    public let minutesLeft: Int?
    public init(percent: Int, isCharging: Bool, onPower: Bool, minutesLeft: Int?) {
        self.percent = percent; self.isCharging = isCharging; self.onPower = onPower; self.minutesLeft = minutesLeft
    }
}

/// Hardware readings that aren't per process: the GPU's busy share, the battery, and which processes keep the Mac
/// awake. Each read took tens of microseconds on the development Mac (26 µs, 41 µs and 55 µs), so the sampler reads
/// them with every sample.
public enum PowerAndGPU {
    /// The GPU's busy share, 0 to 100, from its IOAccelerator statistics; the busiest GPU on a Mac with several. Nil
    /// when the driver doesn't report one.
    public static func gpuUtilization() -> Double? {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOAccelerator"), &iterator) == KERN_SUCCESS else { return nil }
        defer { IOObjectRelease(iterator) }
        var busiest: Double?
        while case let service = IOIteratorNext(iterator), service != 0 {
            defer { IOObjectRelease(service) }
            guard let stats = IORegistryEntryCreateCFProperty(service, "PerformanceStatistics" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() as? [String: Any],
                  let value = (stats["Device Utilization %"] as? NSNumber)?.doubleValue else { continue }
            busiest = max(busiest ?? 0, min(100, max(0, value)))
        }
        return busiest
    }

    /// The internal battery, or nil on a Mac without one.
    public static func battery() -> BatteryState? {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sources = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return nil }
        for source in sources {
            guard let description = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  description[kIOPSTypeKey] as? String == kIOPSInternalBatteryType,
                  let current = description[kIOPSCurrentCapacityKey] as? Int, let maximum = description[kIOPSMaxCapacityKey] as? Int, maximum > 0 else { continue }
            let onPower = description[kIOPSPowerSourceStateKey] as? String == kIOPSACPowerValue
            let minutes = description[kIOPSTimeToEmptyKey] as? Int
            return BatteryState(percent: Int((Double(current) / Double(maximum) * 100).rounded()), isCharging: description[kIOPSIsChargingKey] as? Bool ?? false,
                                onPower: onPower, minutesLeft: !onPower && (minutes ?? -1) > 0 ? minutes : nil)
        }
        return nil
    }

    /// The assertions that keep the Mac or its display awake, by process ID, with the names their apps gave them, such as
    /// "Playing video". Assertions that only delay sleep for a moment, like a network wake, aren't listed.
    public static func sleepAssertions() -> [Int32: [String]] {
        var byProcess: Unmanaged<CFDictionary>?
        guard IOPMCopyAssertionsByProcess(&byProcess) == kIOReturnSuccess, let dictionary = byProcess?.takeRetainedValue() as? [NSNumber: [[String: Any]]] else { return [:] }
        let keepsAwake: Set<String> = ["PreventUserIdleSystemSleep", "PreventUserIdleDisplaySleep", "PreventSystemSleep", "NoIdleSleepAssertion", "NoDisplaySleepAssertion"]
        var found: [Int32: [String]] = [:]
        for (pid, assertions) in dictionary {
            let names = assertions.compactMap { assertion -> String? in
                guard let type = assertion["AssertType"] as? String, keepsAwake.contains(type) else { return nil }
                return (assertion["AssertName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? type
            }
            if !names.isEmpty { found[pid.int32Value] = names }
        }
        return found
    }
}
