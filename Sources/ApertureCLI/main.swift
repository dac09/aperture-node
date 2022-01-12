import Foundation
import AVFoundation
import Aperture

struct Options: Decodable {
  let destination: URL
  let framesPerSecond: Int
  let cropRect: CGRect?
  let showCursor: Bool
  let highlightClicks: Bool
  let screenId: CGDirectDisplayID
  let audioDeviceId: String?
  let videoCodec: String?
  let scaleFactor: CGFloat?
}

func record() throws {
  let options: Options = try CLI.arguments.first!.jsonDecoded()

  let recorder = try Aperture(
    destination: options.destination,
    framesPerSecond: options.framesPerSecond,
    cropRect: options.cropRect,
    showCursor: options.showCursor,
    highlightClicks: options.highlightClicks,
    screenId: options.screenId == 0 ? .main : options.screenId,
    audioDevice: options.audioDeviceId != nil ? AVCaptureDevice(uniqueID: options.audioDeviceId!) : nil,
    videoCodec: options.videoCodec,
    scaleFactor: options.scaleFactor == nil ? 1 : options.scaleFactor!
  )

  recorder.onStart = {
    print("R")
  }

  recorder.onFinish = {
    exit(0)
  }

  recorder.onError = {
    print($0, to: .standardError)
    exit(1)
  }

  CLI.onExit = {
    recorder.stop()
    // Do not call `exit()` here as the video is not always done
    // saving at this point and will be corrupted randomly
  }

  recorder.start()

  setbuf(__stdoutp, nil)
  RunLoop.main.run()
}

func compressVideo(inputPath: String, outputPath: String) throws {
  let original = URL(fileURLWithPath: inputPath)
  let compressed = URL(fileURLWithPath: outputPath)
  let asset = AVAsset(url: original)
  var preset: String
  if #available(macOS 10.13, *) {
    preset = AVAssetExportPresetHEVCHighestQuality
  } else {
    preset = "unknown"
  }
  let session = AVAssetExportSession(asset: asset, presetName: preset)
  session?.shouldOptimizeForNetworkUse = true
  session?.outputURL = compressed
  session?.exportAsynchronously { [weak session] in
    guard let session = session else { return }

    switch session.status {
    case .unknown:
      print("Export session received unknown status")
    case .waiting:
      print("Export session waiting")
    case .exporting:
      print("Export session started")
    case .completed:
      print("Export session finished")
      exit(0)
    case .failed:
      if let error = session.error {
        print("Export session failed", error)
      } else {
        print("Export session failed with an unknown error")
      }
      exit(1)
    case .cancelled:
      print("Cancelled")
      return
    @unknown default:
      print("Unknown case")
      exit(1)
    }
  }

  // Wait
  setbuf(__stdoutp, nil)
  RunLoop.main.run()
}

func showUsage() {
  print(
    """
    Usage:
      aperture <options>
      aperture compress <input_file> <output_file>
      aperture list-screens
      aperture list-audio-devices
    """
  )
}

switch CLI.arguments.first {
case "compress":
  let inputPath: String = CLI.arguments[1]
  let outputPath: String = CLI.arguments[2]
  do {
    try compressVideo(inputPath: inputPath, outputPath: outputPath)
  } catch {
    print("Something went wrong while compressing")
    exit(1)
  }
case "list-screens":
  print(try toJson(Devices.screen()), to: .standardError)
  exit(0)
case "list-audio-devices":
  // Uses stderr because of unrelated stuff being outputted on stdout
  print(try toJson(Devices.audio()), to: .standardError)
  exit(0)
case .none:
  showUsage()
  exit(1)
default:
  try record()
}
