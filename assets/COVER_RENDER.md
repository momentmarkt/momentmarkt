# Cover image render

Source: `assets/cover.html` — self-contained 1920×1080 HTML/CSS, no external
assets, no fonts to install. Uses the MomentMarkt palette from
`apps/mobile/src/styles.ts` (`cream`, `ink`, `cocoa`, `spark`, `rain`) plus a
warm `#fbe7c8` for the gradient. Opens in any modern browser standalone.

## Render to PNG (Chrome headless)

From the repo root:

```bash
google-chrome --headless --disable-gpu --hide-scrollbars \
  --window-size=1920,1080 \
  --screenshot=assets/cover.png \
  "file://$PWD/assets/cover.html"
```

On macOS with the default Chrome path:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=1920,1080 \
  --screenshot="$PWD/assets/cover.png" \
  "file://$PWD/assets/cover.html"
```

Output: `assets/cover.png` — 1920×1080 PNG, ~1 MB. Upload to Devpost as the
project cover image (no file size or format limit per `context/HACKATHON.md`,
confirmed 2026-04-25).

## Alternatives

- **Any browser**: open `assets/cover.html`, resize the window to 1920×1080
  (or use DevTools device-mode at that size), take a screenshot.
- **Puppeteer / Playwright**: navigate to the local file URL, set viewport to
  `{ width: 1920, height: 1080 }`, call `page.screenshot({ path: 'cover.png' })`.

## Visual breakdown

- **Background**: warm cream gradient (`#fff8ee → #fbe7c8`) with a faint rain-blue
  radial wash where the phone sits.
- **Left third**: eyebrow chip (`CITY WALLET · BERLIN · LIVE`), big serif
  wordmark `Moment` + italic cocoa `Markt`, italic tagline from
  `work/SUBMISSION.md` (with `moment` highlighted in spark red), and three
  pillar pills (`2 agents`, `3 triggers`, `1 quiet wallet`).
- **Right two-thirds**: pure-CSS iPhone-style mockup tilted -6°, screen showing
  the rain-trigger offer card — `rain in 12 min` chip, headline
  `Heißer Kakao bei Café Bondi`, sub `80 m. 12% cashback. Bis 14:30.`, price
  row, dark `Jetzt sichern` CTA. Dev-panel chip floats top-right with the
  `{intent_token, h3_cell_r8, weather_state}` privacy boundary payload.
- **Faint Berlin silhouette** (inline SVG) along the bottom with a Fernsehturm
  tower; faint H3 hex grid (inline SVG) hints behind the dev chip.
- **Badges**: monospace `DSV-Gruppe CITY WALLET · Hack-Nation 2026`
  bottom-left; spark-red `LIVE · Berlin Mitte` pill bottom-right.

## Hard rules satisfied

- No external assets (no remote fonts, images, or SVGs).
- No npm dependencies.
- System fonts only (`Georgia` for the serif wordmark/tagline, `Helvetica
  Neue` / `Menlo` for the rest).
- Palette restricted to `apps/mobile/src/styles.ts` tokens + `#fbe7c8`.
