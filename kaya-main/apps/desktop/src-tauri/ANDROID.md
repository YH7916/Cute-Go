# Android Build Setup

This document explains how to build and run Kaya on Android.

## Prerequisites

1. **Android SDK & NDK**: Install via Android Studio or command line tools
   - SDK Platform: Android 14 (API 36) or later
   - NDK: Latest stable version (managed by Tauri)

2. **Rust Android targets**:

   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
   ```

3. **Tauri Android prerequisites**:
   ```bash
   # Initialize Android project (if not already done)
   cd apps/desktop
   bun tauri android init
   ```

## ONNX Runtime for Android

Kaya uses ONNX Runtime for AI analysis on Android. The native libraries are not bundled in the repository due to their size (~70MB total).

### Download ONNX Runtime Libraries

Run the setup script before building:

```bash
cd apps/desktop
bun run android:setup
```

This script:

1. Downloads the official ONNX Runtime Android AAR from Maven Central
2. Extracts the native `.so` libraries for all Android ABIs (arm64-v8a, armeabi-v7a, x86_64, x86)
3. Places them in `src-tauri/gen/android/app/src/main/jniLibs/`

### Supported Execution Providers

On Android, Kaya supports:

- **NNAPI (Android Neural Networks API)**: Hardware-accelerated inference using the device's NPU, GPU, or DSP
- **CPU**: Multi-threaded CPU inference as fallback

The app automatically selects NNAPI when available (Android 8.1+).

## Development

### Run on Connected Device/Emulator

```bash
cd apps/desktop
bun run android:dev
```

Or using Tauri CLI directly:

```bash
bun tauri android dev
```

### Build Release APK

```bash
cd apps/desktop
bun run android:build
```

The APK will be generated at:

```
src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk
```

## Troubleshooting

### ONNX Runtime not loading

If you see errors about `libonnxruntime.so` not found:

1. Make sure you ran `bun run android:setup`
2. Check that the `.so` files exist in `src-tauri/gen/android/app/src/main/jniLibs/`
3. Rebuild the app

### NNAPI not available

NNAPI requires Android 8.1 (API 27) or later. On older devices or emulators without hardware acceleration, the app will fall back to CPU inference.

### Build errors with NDK

Make sure your NDK version is compatible with Tauri. Check the [Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/#android).

## Architecture

```
src-tauri/
├── Cargo.toml           # Rust dependencies (load-dynamic for Android)
├── src/
│   ├── lib.rs           # Mobile entry point
│   ├── onnx_engine.rs   # ONNX Runtime wrapper (NNAPI on Android)
│   └── ...
├── gen/
│   └── android/
│       └── app/
│           └── src/main/
│               └── jniLibs/    # ONNX Runtime native libraries
│                   ├── arm64-v8a/
│                   ├── armeabi-v7a/
│                   ├── x86_64/
│                   └── x86/
└── scripts/
    └── download-onnxruntime-android.sh
```

## Notes

- The `jniLibs` directory is in `.gitignore` to keep the repository size small
- CI/CD pipelines should run `android:setup` before building Android releases
- ONNX Runtime version is specified in the download script (currently 1.22.0)
