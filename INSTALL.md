# Installation Guide

## Quick Start (Node.js - Recommended)

The Node.js examples are the easiest to get started with:

```bash
# Install node-pre-gyp first (required by wrtc)
npm install --save-dev node-pre-gyp

# Then install all dependencies
npm install
```

That's it! No additional system dependencies required.

**Note:** The `wrtc` package requires `node-pre-gyp` to download prebuilt binaries. Installing it first ensures a smooth installation.

## Python Installation

Python WebRTC support requires FFmpeg system libraries. Follow these steps:

### Step 1: Install System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install \
  libavformat-dev \
  libavcodec-dev \
  libavdevice-dev \
  libavutil-dev \
  libavfilter-dev \
  libswscale-dev \
  libswresample-dev \
  pkg-config
```

**macOS:**
```bash
brew install ffmpeg pkg-config
```

**Fedora/RHEL:**
```bash
sudo dnf install ffmpeg-devel pkgconfig
```

### Step 2: Install Python Dependencies

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install basic dependencies
pip install -r requirements.txt

# Install aiortc (requires FFmpeg from Step 1)
pip install aiortc==1.6.0
```

### Troubleshooting

**Error: "Package libavformat was not found"**
- Make sure you installed all FFmpeg development libraries
- Verify pkg-config can find them: `pkg-config --libs libavformat`
- On some systems, you may need to set `PKG_CONFIG_PATH`

**Error: "No module named 'av'"**
- This means aiortc didn't install correctly
- Make sure FFmpeg libraries are installed before installing aiortc
- Try: `pip install --upgrade pip` then `pip install aiortc==1.6.0`

**Alternative: Use Node.js Examples**
- If FFmpeg installation is problematic, use the Node.js examples instead
- They work out of the box with just `npm install`
- Or use the browser-based HTML example (no installation needed)

## Browser Examples

The browser examples require no installation - just open the HTML file:

```bash
# Open in your browser
open comparison/side-by-side.html
# or
xdg-open comparison/side-by-side.html
```
