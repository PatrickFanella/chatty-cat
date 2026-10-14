#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo 'The AppKit overlay host builds only on macOS.' >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo 'Usage: scripts/build-macos-overlay.sh /absolute/path/ChattyOverlay.app' >&2
  exit 1
fi
case "$1" in /*.app) ;; *) echo 'Choose an absolute .app output path.' >&2; exit 1;; esac
if [ -e "$1" ]; then
  echo 'Output already exists; choose a new output path.' >&2
  exit 1
fi
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$1/Contents/MacOS"
xcrun swiftc -swift-version 5 "$project_root/companion/macos/OverlayHost.swift" -o "$1/Contents/MacOS/ChattyOverlay"
cat > "$1/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ChattyOverlay</string>
<key>CFBundleIdentifier</key><string>tv.subcult.chatty-overlay</string>
<key>CFBundleName</key><string>ChattyOverlay</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
printf 'Built %s\nConfigure overlayExecutable as %s/Contents/MacOS/ChattyOverlay\n' "$1" "$1"
