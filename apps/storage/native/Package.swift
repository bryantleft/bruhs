// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pith",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Pith", targets: ["Pith"])],
    // Sparkle installs updates, so it moves only when a release deliberately takes a new version.
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.1")],
    targets: [
        .target(name: "PithSystem", linkerSettings: [.linkedLibrary("proc")]),
        .target(name: "PithCore", dependencies: ["PithSystem"]),
        .executableTarget(
            name: "Pith",
            dependencies: ["PithCore", "PithSystem", .product(name: "Sparkle", package: "Sparkle")],
            // The app bundle keeps Sparkle in Contents/Frameworks, beside Contents/MacOS.
            linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]
        ),
        .testTarget(name: "PithCoreTests", dependencies: ["PithCore"])
    ]
)
