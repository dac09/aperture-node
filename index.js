"use strict";
const os = require("os");
const util = require("util");
const path = require("path");
const execa = require("execa");
const tempy = require("tempy");
const macosVersion = require("macos-version");
const fileUrl = require("file-url");
const electronUtil = require("electron-util/node");

const debuglog = util.debuglog("aperture");

// Workaround for https://github.com/electron/electron/issues/9459
const BIN = path.join(electronUtil.fixPathForAsarUnpack(__dirname), "aperture");

const supportsHevcHardwareEncoding = (() => {
  if (!macosVersion.isGreaterThanOrEqualTo("10.13")) {
    return false;
  }

  // Get the Intel Core generation, the `4` in `Intel(R) Core(TM) i7-4850HQ CPU @ 2.30GHz`
  // More info: https://www.intel.com/content/www/us/en/processors/processor-numbers.html
  const result = /Intel.*Core.*i(?:7|5)-(\d)/.exec(os.cpus()[0].model);

  // Intel Core generation 6 or higher supports HEVC hardware encoding
  return result && Number(result[1]) >= 6;
})();

class Aperture {
  constructor() {
    macosVersion.assertGreaterThanOrEqualTo("10.12");
  }
  recorderTimeout = null;
  recorder = null;

  startRecording({
    fps = 30,
    cropArea = undefined,
    showCursor = true,
    highlightClicks = false,
    screenId = 0,
    audioDeviceId = undefined,
    videoCodec = undefined,
    scaleFactor = 1,
  } = {}) {
    return new Promise((resolve, reject) => {
      if (this.recorder !== null) {
        reject(new Error("Call `.stopRecording()` first"));
        return;
      }

      this.tmpPath = tempy.file({ extension: "mp4" });

      if (highlightClicks === true) {
        showCursor = true;
      }

      if (typeof cropArea === "object") {
        if (
          typeof cropArea.x !== "number" ||
          typeof cropArea.y !== "number" ||
          typeof cropArea.width !== "number" ||
          typeof cropArea.height !== "number"
        ) {
          reject(new Error("Invalid `cropArea` option object"));
          return;
        }
      }

      const recorderOpts = {
        destination: fileUrl(this.tmpPath),
        framesPerSecond: fps,
        showCursor,
        highlightClicks,
        screenId,
        audioDeviceId,
        scaleFactor,
      };

      if (cropArea) {
        recorderOpts.cropRect = [
          [cropArea.x, cropArea.y],
          [cropArea.width, cropArea.height],
        ];
      }

      if (videoCodec) {
        const codecMap = new Map([
          ["h264", "avc1"],
          ["hevc", "hvc1"],
          ["proRes422", "apcn"],
          ["proRes4444", "ap4h"],
        ]);

        if (!supportsHevcHardwareEncoding) {
          codecMap.delete("hevc");
        }

        if (!codecMap.has(videoCodec)) {
          throw new Error(`Unsupported video codec specified: ${videoCodec}`);
        }

        recorderOpts.videoCodec = codecMap.get(videoCodec);
      }

        console.log(':: Aperture Options :: ')
        console.log(recorderOpts)

      this.recorder = execa(BIN, [JSON.stringify(recorderOpts)]);

      this.recorderTimeout = setTimeout(() => {
        // `.stopRecording()` was called already
        if (this.recorder === null) {
          return;
        }

        const err = new Error("Could not start recording within 5 seconds");
        err.code = "RECORDER_TIMEOUT";
        this.recorder.kill();
        this.recorder = null;
        reject(err);
      }, 10000);

      this.recorder.catch((error) => {
        clearTimeout(this.recorderTimeout);
        this.recorder = null;
        reject(error);
      });

      this.recorder.stdout.setEncoding("utf8");
      this.recorder.stdout.on("data", (data) => {
        debuglog(data);

        if (data.trim() === "R") {
          // `R` is printed by Swift when the recording **actually** starts
          clearTimeout(this.recorderTimeout);
          resolve(this.tmpPath);
        }
      });
    });
  }

  async stopRecording() {
    console.log("APERTURE :: Stopping Recording ::");

    if (this.recorder === null) {
      throw new Error("Call `.startRecording()` first");
    }
    this.recorder.kill();
    await this.recorder;
    this.recorder = null;

    return this.tmpPath;
  }

  async cancelRecording() {
    if (this.recoder === null) {
      console.log("APERTURE :: Nothing to cancel", this.recorder);
      return;
    }

    console.log("APERTURE :: Cancelling Recording ::");

    // Duplicate check because, sentry keeps reporting errors
    if (this.recorder) {
      this.recorder.kill();
      this.recorderTimeout && clearTimeout(this.recorderTimeout);
      await this.recorder
    }

    this.recorder = null;
    return;
  }
}

module.exports = () => new Aperture();

module.exports.compressVideo = async (inputPath, outputPath) => {
    console.log("APERTURE :: Compressing Recording ::");
    await execa.stderr(BIN, ["compress", inputPath, outputPath]);
};

module.exports.screens = async () => {
  const stderr = await execa.stderr(BIN, ["list-screens"]);

  try {
    return JSON.parse(stderr);
  } catch (_) {
    return stderr;
  }
};

module.exports.audioDevices = async () => {
  const stderr = await execa.stderr(BIN, ["list-audio-devices"]);

  try {
    return JSON.parse(stderr);
  } catch (_) {
    return stderr;
  }
};

Object.defineProperty(module.exports, "videoCodecs", {
  get() {
    const codecs = new Map([
      ["h264", "H264"],
      ["hevc", "HEVC"],
      ["proRes422", "Apple ProRes 422"],
      ["proRes4444", "Apple ProRes 4444"],
    ]);

    if (!supportsHevcHardwareEncoding) {
      codecs.delete("hevc");
    }

    return codecs;
  },
});
