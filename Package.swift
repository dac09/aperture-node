// swift-tools-version:4.2
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
    .package(url: "../Aperture", .branch("try/5.2.0+scalefactor"))
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
