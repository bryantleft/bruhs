// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pith",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Pith", targets: ["Pith"])],
    targets: [
        .target(name: "PithSystem", linkerSettings: [.linkedLibrary("proc")]),
        .target(name: "PithCore", dependencies: ["PithSystem"]),
        .executableTarget(name: "Pith", dependencies: ["PithCore", "PithSystem"]),
        .testTarget(name: "PithCoreTests", dependencies: ["PithCore"])
    ]
)
