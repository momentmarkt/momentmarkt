# Logo render

Source-of-truth artwork lives as plain SVG so we can re-render any size
without committing binaries.

## Source file

- `assets/logo-icon.svg` — square mark (100×100 viewBox), cream tile + ink
  M + spark dot. Single source for everything: README header, iOS app
  icon, Android adaptive-icon foreground, splash icon, web favicon, and
  the merchant rail-mark / onboarding mark (served from
  `apps/merchant/public/logo.svg`).

Self-contained: no external font load. Open in any browser to preview.

## Render to PNG

Run from the repo root. `rsvg-convert` (Homebrew `librsvg`) is the
preferred path — fast, deterministic, respects the viewBox, and already
installed on the demo laptops.

```bash
rsvg-convert -w 1024 -h 1024 assets/logo-icon.svg -o apps/mobile/assets/icon.png
rsvg-convert -w 48   -h 48   assets/logo-icon.svg -o apps/mobile/assets/favicon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/adaptive-icon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/splash-icon.png

# Merchant frontend serves the SVG directly — keep it in sync with the canonical.
cp assets/logo-icon.svg apps/merchant/public/logo.svg
```

### Alternative: ImageMagick

```bash
magick -density 300 -background none assets/logo-icon.svg -resize 1024x1024 apps/mobile/assets/icon.png
magick -density 300 -background none assets/logo-icon.svg -resize 48x48    apps/mobile/assets/favicon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/adaptive-icon.png
cp apps/mobile/assets/icon.png apps/mobile/assets/splash-icon.png
```

### Alternative: Chrome headless

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=1024,1024 \
  --screenshot=apps/mobile/assets/icon.png \
  --default-background-color=00000000 \
  "file://$PWD/assets/logo-icon.svg"
sips -z 48 48 apps/mobile/assets/icon.png --out apps/mobile/assets/favicon.png
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

- **Mark**: solid capital 'M' rendered as a single closed ink path against a
  cream tile. The orange dot in the lower-right names the "moment" — the
  pulse, the single tick of opportunity that the product is built around.
- **Palette in this asset**:
  - `#F2EFE9` cream tile background
  - `#0A0A0A` ink M
  - `#E85B35` spark dot
- **Safe zone**: the M sits inside a 5%-edge inset on every side so it
  survives iOS's circular crop without clipping the feet.
