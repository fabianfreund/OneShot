# OneShot — research & plan

> Simple on the surface, deep underneath. Press a key, get a good-looking screenshot.
> Double-click any image, get a viewer that quietly hides a full editor.

## 1. What CleanShot X actually is

CleanShot X is three products sharing one flow:

| Layer | What it does | Why it feels good |
|---|---|---|
| **Capture** | Area / window / fullscreen / scrolling capture, screen recording + GIF, OCR, self-timer, hide desktop icons, freeze screen | Crosshair with a magnifier and pixel dimensions; window capture with a pretty shadow; zero dialogs |
| **Quick Access Overlay** | A thumbnail slides into the corner after every capture: Copy, Save, Annotate, Pin, Upload, drag-out | You almost never open a window. Drag the thumbnail straight into Slack |
| **Annotate** | Arrows, shapes, text, counters, highlighter, blur/pixelate, spotlight, crop, background tool (padding, gradient/wallpaper, shadow, corners, aspect ratio) | Defaults look designed: tapered arrows, drop shadows, pill text, consistent sizes |
| **Cloud / history** | Upload + share link, capture history, pins | Nice to have |

Its real "moat" is **taste in the defaults** plus **speed of the overlay flow**, more than the feature list.

## 2. What OneShot should be

The same capture → overlay → annotate loop, plus one thing CleanShot doesn't do: **be the default image viewer.**

- Double-click any PNG/JPEG/HEIC → OneShot opens it *as a viewer*: borderless, chrome fades away, ← → flip through the folder.
- Press **E** (or double-click) → the "hidden menu" slides in: tools on top, inspector on the right.
- The editor does real photo-ish work (crop, **perspective crop**, rotate, flip) next to the screenshot-y work (arrows, numbers, backgrounds).

### Feature map

**MVP (built in this prototype ✅)**
- ✅ Menu-bar app, global shortcuts ⌥⇧4 area, ⌥⇧5 window, ⌥⇧3 screen
- ✅ Quick Access Overlay: Copy, Annotate, Pin, Save copy, Show in Finder, drag-out, auto-dismiss
- ✅ Pin to screen (floating always-on-top reference)
- ✅ Viewer: fit/zoom (pinch, ⌘0/⌘1/⌘±), folder navigation, auto-hiding chrome, drag & drop to open
- ✅ Annotations: tapered arrow, rectangle, ellipse, text (plain / outline / pill), numbered counter, highlighter, pixelate
- ✅ Select / move / resize / nudge / delete, ⇧ to constrain, full undo/redo
- ✅ Background: 8 gradient presets + paper + transparent, padding, corner radius, shadow, aspect ratio (Auto / 1:1 / 4:3 / 16:9)
- ✅ Crop (rule of thirds, 8 handles), perspective crop (4-corner homography), rotate, flip
- ✅ Copy, Save Copy (PNG/JPEG), drag the edited result into any app
- ✅ File associations for being the default viewer (in packaged builds)

**v1 (next)**
- Custom capture overlay (crosshair, magnifier, dimensions, snap to windows, arrow-key nudge)
- Window capture with transparent shadow, or wallpaper behind it
- Scrolling capture (auto-scroll + stitching by matching rows)
- OCR "copy text from screen" (Apple Vision), redact detected emails/keys automatically
- Spotlight tool, freehand pen, line, emoji/stamps, magnifier callout
- Auto-balance: center the content inside the background
- Custom backgrounds (your wallpaper, any image), saved presets ("Twitter", "Docs")
- Capture history panel, settings window, configurable shortcuts and save location
- Viewer: EXIF info panel, slideshow, trash/rename, compare two images

**Deep (what makes it "deep underneath")**
- **Auto document detection** for perspective crop (Vision `VNDetectRectanglesRequest`): the corners snap onto the paper by themselves
- Background removal / subject lift (Vision `VNGenerateForegroundInstanceMaskRequest`, macOS 14+)
- Smart redaction: detect text, then blur emails, tokens and faces
- Screen recording → MP4/GIF with trim, click highlights, keystroke overlay
- Non-destructive `.oneshot` sidecar files, so annotations stay editable after reopening
- Shortcuts.app / URL-scheme actions (`oneshot://capture?mode=area`)

## 3. How I'd pull it off technically

### Stack: Electron + a small native helper

Electron fits for a fast-moving, good-looking UI (canvas, CSS, vibrancy). The parts that must be native go in a **small Swift helper binary** that main spawns, or a Node-API addon:

| Need | Prototype | Production |
|---|---|---|
| Area/window/screen capture | `/usr/sbin/screencapture -i / -iW / -m` (native UI, Retina, multi-display for free) | ScreenCaptureKit helper (`SCScreenshotManager`, macOS 14+) feeding our own crosshair/magnifier overlay window |
| OCR, rectangle detection, subject lift | — | Apple Vision via the same Swift helper (JSON over stdio) |
| HEIC/TIFF decoding | `nativeImage.createFromPath` → PNG | same |
| Default viewer | `fileAssociations` → `CFBundleDocumentTypes` + `open-file` event | plus a "Make default" button that calls `LSSetDefaultRoleHandlerForContentType` from the helper |
| Clipboard, drag-out | `clipboard.writeImage`, `webContents.startDrag` | same |

**Why not Tauri or SwiftUI?** SwiftUI gives the most native feel and the smallest app, but iteration speed and canvas-editor ergonomics are much better on the web stack. Tauri's WKWebView has weaker canvas/OffscreenCanvas performance and fewer desktop APIs. Electron + a Swift helper gets about 95% of native feel and keeps the editor in one portable codebase. Cost: about 150 MB app size and higher idle RAM. Mitigate that by keeping no hidden windows alive and creating them on demand.

### Editor architecture

```
Document = { base: raster, annotations: [vector objects], background: settings }
render()  = background → shadow → rounded-clip(base) → annotations → UI overlay
```

- **Non-destructive**: annotations stay vector objects in image coordinates until export, so you can always move, recolor or resize them.
- **Destructive ops** (crop, perspective, rotate) replace `base`; crop shifts annotations, the others flatten first. Undo is just snapshots of `{base ref, annotations, bg}`. Bitmaps are shared, never copied.
- **Resolution-independent**: sizes derive from image size (so Retina captures get proportionally thicker arrows). The canvas backing store follows zoom × devicePixelRatio, and export always renders at 1:1.
- **Perspective crop**: solve the 8-unknown homography from the output rectangle to the user's quad (Gaussian elimination), then inverse-map each pixel with bilinear sampling. About 90 ms for 1.2 MP in plain JS. Move it to WebGL/a worker for 20 MP photos.
- **Later**: move rendering to an OffscreenCanvas worker, and use WebGL for blur, the spotlight mask and large-photo warps.

### macOS polish checklist
- `titleBarStyle: hiddenInset`, `vibrancy: under-window`, SF system font, semantic light/dark tokens
- Overlay windows: `alwaysOnTop('screen-saver')`, `visibleOnAllWorkspaces`, `acceptFirstMouse`, `showInactive` (never steal focus)
- Screen Recording permission (TCC): `NSScreenCaptureUsageDescription`, plus first-run onboarding that checks `systemPreferences.getMediaAccessStatus('screen')` and deep-links to System Settings
- Ship signed and notarized (hardened runtime), or permissions reset on every build
- To replace ⌘⇧3/4/5 like CleanShot, ask the user to disable the system shortcuts, then register them

## 4. Risks
- **Permissions UX** is the #1 support issue for screenshot apps. Onboarding must make it painless.
- **Default-viewer launch speed**: Electron cold start (~400–700 ms) is slower than Preview. Mitigate by keeping the menu-bar process alive so opening a file only creates a window (~150 ms).
- **Large photos**: 48 MP iPhone images need tiling/WebGL. The 2D canvas has size limits (~16k px per side).
