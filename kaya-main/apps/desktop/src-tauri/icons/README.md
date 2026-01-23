# Tauri Application Icons

This folder contains the app icons used by Tauri for different platforms.

## Files

- **32x32.png** - Small icon for Windows/Linux
- **128x128.png** - Medium icon for Windows/Linux
- **128x128@2x.png** - Retina icon for Windows/Linux (256x256)
- **icon.png** - Source icon (512x512)
- **icon.icns** - macOS app icon (used in Dock, Finder, etc.)
- **icon.ico** - Windows app icon

## Updating Icons

To regenerate all icons from the main logo:

```bash
# From project root
bun run generate-icons
```

This uses `sharp` library (cross-platform, no external tools needed) to convert `public/logo.svg` to all required formats.

### Requirements

- Bun (already installed)
- `sharp` package (installed as dev dependency)

Works on **macOS**, **Windows**, and **Linux** without any external dependencies!

### What Gets Generated

- PNG icons (32×32, 128×128, 256×256, 512×512)
- ICNS for macOS (simplified format, works for dev)
- ICO for Windows (simplified format, works for dev)

For production builds with full multi-resolution support, consider using:

- macOS: `iconutil` (built into macOS)
- Windows: Online converters or `to-ico` npm package## Platform-Specific Notes

### macOS (icon.icns)

- Used in Dock, Finder, About window
- Contains multiple resolutions (16x16 to 512x512)
- Updates after app rebuild

### Windows (icon.ico)

- Used in taskbar, file explorer
- Contains multiple resolutions (16x16 to 256x256)

### Linux (PNG files)

- Different desktop environments use different sizes
- Most common: 32x32, 128x128

## Troubleshooting

**Icon doesn't update in dev mode:**

- Restart the dev server: `bun run dev:desktop`
- Clear Tauri cache: `rm -rf apps/desktop/src-tauri/target`
- On macOS, the Dock may cache icons - try logging out and back in

**Icon looks blurry:**

- Ensure source SVG is high quality
- Check that icon.png is at least 512x512
- For retina displays, use @2x versions

## Source Design

The current icon is generated from `public/logo.svg` which features:

- Bold bamboo design representing "Kaya" (榧/🎋)
- Three vertical stalks with nodes
- Organic leaves
- Subtle Go stone circle reference

Colors:

- Primary: Bamboo Green (#2d5016)
- Secondary: Leaf Green (#4a7c2c)
