// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pith",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "PithSystem", linkerSettings: [.linkedLibrary("proc")]),
        .target(name: "PithCore", dependencies: ["PithSystem"]),
        .testTarget(name: "PithCoreTests", dependencies: ["PithCore"])
    ]
)
