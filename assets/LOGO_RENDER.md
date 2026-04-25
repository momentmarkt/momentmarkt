# Logo render

Source-of-truth artwork lives as plain SVG so we can re-render any size
without committing binaries.

## Source file

- `assets/logo-icon.svg` — square mark only (1024×1024 viewBox).
  Single source for everything: README header (rendered at 120px width),
  iOS app icon, Android adaptive-icon foreground, splash icon, and web
  favicon. The wordmark is rendered as plain markdown text alongside.

Self-contained: no external font load. Open in any browser to preview.

## Render to PNG via Chrome headless

Chrome headless is the most reliable converter on macOS — no extra deps,
respects SVG viewBox, transparent background, and is already on every laptop
that runs the demo.

Run all commands from the repo root.

```bash
# iOS app icon (1024×1024, square, opaque cream — required by App Store)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=1024,1024 \
  --screenshot=apps/mobile/assets/icon.png \
  --default-background-color=00000000 \
  "file://$PWD/assets/logo-icon.svg"

# Android adaptive icon foreground (1024×1024).
# Expo composites this over the cream background defined in app.json,
# so we can reuse the same square asset.
cp apps/mobile/assets/icon.png apps/mobile/assets/adaptive-icon.png

# Splash icon (Expo splash uses contain over the cream background).
cp apps/mobile/assets/icon.png apps/mobile/assets/splash-icon.png

# Web favicon (48×48). Chrome headless crops at small windows, so render
# at icon size first then downsize with macOS `sips` (or ImageMagick).
sips -z 48 48 apps/mobile/assets/icon.png --out apps/mobile/assets/favicon.png
```

### Alternative: ImageMagick

If `convert` (ImageMagick) is installed and Chrome is not handy:

```bash
convert -density 300 -background none assets/logo-icon.svg -resize 1024x1024 apps/mobile/assets/icon.png
convert -density 300 -background none assets/logo-icon.svg -resize 48x48   apps/mobile/assets/favicon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/adaptive-icon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/splash-icon.png
```

### Alternative: rsvg-convert (Homebrew `librsvg`)

```bash
rsvg-convert -w 1024 -h 1024 assets/logo-icon.svg -o apps/mobile/assets/icon.png
rsvg-convert -w 48   -h 48   assets/logo-icon.svg -o apps/mobile/assets/favicon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/adaptive-icon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/splash-icon.png
```

## Where the rendered PNGs land

The Expo manifest (`apps/mobile/app.json`) already references these paths:

```json
"icon":  "./assets/icon.png",
"splash": { "image": "./assets/splash-icon.png", "backgroundColor": "#fff8ee" },
"android": { "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#fff8ee" } },
"web":   { "favicon": "./assets/favicon.png" }
```

So once the four PNGs exist under `apps/mobile/assets/`, no Expo config
change is needed — `pnpm mobile:start` picks them up.

## Update README header

The README header banner already uses the wordmark SVG inline:

```html
<div align="center">
  …
</div>
```

GitHub renders SVG inline natively, so no separate PNG is needed for the
README banner. If a PNG fallback is ever required (e.g. for a social-card
preview that strips SVG), render via:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=640,192 \
  --screenshot=assets/logo.png \
  --default-background-color=00000000 \
```

## Design notes

- **Mark**: stylized capital 'M' as an open ink stroke. The bottom corners of
  the surrounding plate are rounded, hinting at a market-stall awning. A
  spark-red dot sits inside the V-notch — the "moment" — so the icon reads
  as both Markt (storefront) and Moment (single pulse / tick).
- **Wordmark**: Georgia serif. "Moment" is regular ink (`#17120f`), "Markt"
  is italic cocoa (`#6f3f2c`) — same treatment as the Devpost cover and the
  in-app `app-header .brand` style in `assets/cover.html`.
- **Palette**: the five tokens from `apps/mobile/src/styles.ts` —
  `cream #fff8ee`, `ink #17120f`, `cocoa #6f3f2c`, `spark #f2542d`,
  `rain #356f95` (rain is reserved for the price chip in-app and is not
  used in the logo to keep it calm).
- **Safe zone**: the icon SVG keeps a ~10% margin on every side so it
  survives iOS's circular crop without clipping the M's feet.
