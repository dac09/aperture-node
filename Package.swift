// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "ApertureCLI",
  products: [
    .executable(
      name: "aperture",
      targets: [
        "ApertureCLI"
      ]
    )
  ],
  dependencies: [
    .package(url: "https://github.com/tapehq/Aperture", .branch("try/5.2.0+scalefactor")),
  ],
  targets: [
    .target(
      name: "ApertureCLI",
      dependencies: [
        "Aperture"
      ]
    )
  ]
)
