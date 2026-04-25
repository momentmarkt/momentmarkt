/**
 * Stress tests for the Surfacing Agent score function.
 *
 * The high-intent toggle is the most visually load-bearing moment in the
 * 60s demo cut: same offer, different headline, different threshold. These
 * tests pin the math so a future tweak can't silently make the toggle
 * invisible (e.g. by surfacing in both states or in neither).
 *
 * Runs as plain Node:
 *   pnpm dlx tsx src/surfacing/__tests__/surfacingScore.test.ts
 */

import {
  scoreSurfacing,
  type SurfacingInput,
} from "../surfacingScore";

let failures = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    // eslint-disable-next-line no-console
    console.log(`OK   ${label}`);
  } else {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`FAIL ${label}`);
  }
}

function near(a: number, b: number, eps = 0.011): boolean {
  return Math.abs(a - b) <= eps;
}

const miaBerlin: SurfacingInput = {
  weatherTrigger: "rain_incoming",
  eventEndingSoon: true,
  demandGapRatio: 0.54,
  distanceM: 82,
  highIntent: false,
};

// ---- Berlin / Mia path: surfaces in both states (toggle changes headline) ---
const berlinSilent = scoreSurfacing(miaBerlin);
const berlinHigh = scoreSurfacing({ ...miaBerlin, highIntent: true });

assert(
  "Berlin baseline score is 0.94 (weather+event+demand+proximity)",
  near(berlinSilent.score, 0.94),
);
assert("Berlin baseline surfaces", berlinSilent.shouldSurface);
assert(
  "Berlin baseline threshold is 0.72",
  near(berlinSilent.threshold, 0.72),
);
assert(
  "Berlin high-intent threshold drops to 0.58",
  near(berlinHigh.threshold, 0.58),
);
assert(
  "Berlin high-intent boost adds 0.16 to score",
  near(berlinHigh.score - berlinSilent.score, 0.16),
);
assert(
  "Berlin high-intent rewrites headline",
  berlinHigh.headline !== berlinSilent.headline,
);
assert(
  "Berlin high-intent headline mentions in-market signal",
  berlinHigh.headline.toLowerCase().includes("in-market"),
);

// ---- Zurich-shaped input: silent without high-intent, surfaces with it ------
const zurichSilent = scoreSurfacing({
  weatherTrigger: "clear",
  eventEndingSoon: true,
  demandGapRatio: 0.37,
  distanceM: 115,
  highIntent: false,
});
const zurichHigh = scoreSurfacing({
  weatherTrigger: "clear",
  eventEndingSoon: true,
  demandGapRatio: 0.37,
  distanceM: 115,
  highIntent: true,
});
assert(
  "Zurich-shaped silent path does NOT surface",
  zurichSilent.shouldSurface === false,
);
assert(
  "Zurich-shaped high-intent path DOES surface (toggle visibly flips)",
  zurichHigh.shouldSurface === true,
);

// ---- Demand clamp at 0.6 ----------------------------------------------------
const huge = scoreSurfacing({
  weatherTrigger: "clear",
  eventEndingSoon: false,
  demandGapRatio: 5.0,
  distanceM: 800,
  highIntent: false,
});
const sane = scoreSurfacing({
  weatherTrigger: "clear",
  eventEndingSoon: false,
  demandGapRatio: 0.6,
  distanceM: 800,
  highIntent: false,
});
assert(
  "demandGapRatio is clamped at 0.6 (no runaway score)",
  near(huge.score, sane.score),
);

// ---- Negative gap ratio doesn't subtract from score ------------------------
const above = scoreSurfacing({
  weatherTrigger: "clear",
  eventEndingSoon: false,
  demandGapRatio: -0.5,
  distanceM: 800,
  highIntent: false,
});
assert("negative gap clamps to 0 (no negative demand contribution)", above.score >= 0);

// ---- Proximity buckets ------------------------------------------------------
function proximityScore(d: number): number {
  return scoreSurfacing({
    weatherTrigger: "clear",
    eventEndingSoon: false,
    demandGapRatio: 0,
    distanceM: d,
    highIntent: false,
  }).score;
}
assert("proximity ≤100m awards 0.20", near(proximityScore(80), 0.2));
assert("proximity ≤100m awards 0.20 at boundary", near(proximityScore(100), 0.2));
assert("proximity ≤250m awards 0.12", near(proximityScore(101), 0.12));
assert("proximity ≤250m awards 0.12 at boundary", near(proximityScore(250), 0.12));
assert("proximity >250m awards 0.04", near(proximityScore(800), 0.04));

// ---- Reasons array contains every dimension --------------------------------
const reasons = berlinHigh.reasons.join(",");
for (const dim of ["weather", "event", "demand", "proximity", "high_intent"]) {
  assert(`reasons array exposes ${dim}`, reasons.includes(dim));
}

// ---- Idempotence: same input → same output ---------------------------------
const a = scoreSurfacing(miaBerlin);
const b = scoreSurfacing(miaBerlin);
assert("scoreSurfacing is pure (idempotent)", JSON.stringify(a) === JSON.stringify(b));

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("\nAll surfacingScore tests passed.");
