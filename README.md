# OneShot

A pleasing screenshot tool and image viewer for macOS. Capture, annotate, beautify, and open any image.
See [RESEARCH.md](RESEARCH.md) for the feature research and technical plan.

## Run

```bash
npm install
npm start                    # first run: welcome window, then menu-bar only
npm start -- ~/Desktop/x.png # open an image directly
```

On first launch a short welcome window asks for **Screen Recording** permission (macOS) and shows the shortcuts.
After that OneShot starts silently in the menu bar (tray on Windows). The Dock icon only appears while an image window is open.
In dev, macOS grants the permission to the terminal you ran `npm start` from; relaunch after allowing it.
Reset the welcome flow by deleting `~/Library/Application Support/OneShot/settings.json`, or use the menu-bar item *Welcome & Permissions…*.
Windows: capture currently grabs the whole display under the cursor (area/window selection is still macOS-only).

## Use

| | |
|---|---|
| ⌥⇧4 / ⌥⇧5 / ⌥⇧3 | Capture area / window / screen → quick-access overlay |
| Overlay | Copy · Annotate · Pin · Save copy · Show in Finder · drag the thumbnail into any app |
| Viewer | ← → browse folder · pinch / ⌘± zoom · ⌘0 fit · ⌘1 actual size · **E** or double-click to edit |
| Editor dock | V select · A arrow · R rect · O ellipse · T text · N counter · H highlight · B pixelate · C crop · P perspective |
| Editing | ⇧ constrain · ⌫ delete · arrows nudge · ↩ apply crop · esc back to viewer · ⌘Z / ⇧⌘Z · ⌘C copy · ⌘S save |

## Make it the default image viewer

```bash
npm run dist   # builds dist/mac-*/OneShot.app (unsigned)
```

Move `OneShot.app` to /Applications, then in Finder: select a PNG → Get Info → *Open with: OneShot* → **Change All…**

## Structure

```
main.js            menu bar, shortcuts, capture, windows, IPC
preload.js         safe bridge (window.oneshot)
renderer/editor.*  viewer + editor (canvas document model)
renderer/overlay.* post-capture quick-access card
renderer/pin.*     floating pinned screenshot
renderer/launcher.* floating capture bar
renderer/onboarding.* first-run welcome + permission
```
