/**
 * Hand-authored widget specs are the recordable hour-5 fallback. If any of
 * them stops validating, the fallback render path can't display the offer.
 *
 * Runs as plain Node:
 *   pnpm dlx tsx src/demo/__tests__/widgetSpecs.test.ts
 */

import { isWidgetNode } from "../../genui/widgetSchema";
import { miaRainOffer } from "../miaOffer";
import { demoWidgetSpecs } from "../widgetSpecs";

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

for (const [key, spec] of Object.entries(demoWidgetSpecs)) {
  assert(`demoWidgetSpecs.${key} validates`, isWidgetNode(spec));
}

assert("miaRainOffer.widgetSpec validates", isWidgetNode(miaRainOffer.widgetSpec));
assert(
  "miaRainOffer carries the canonical Bondi merchantId",
  miaRainOffer.merchantId === "berlin-mitte-cafe-bondi",
);
assert(
  "miaRainOffer headline is the rehearsed rain line",
  miaRainOffer.headline.toLowerCase().includes("rain"),
);
assert(
  "miaRainOffer privacyEnvelope has both keys",
  typeof miaRainOffer.privacyEnvelope.intent_token === "string" &&
    typeof miaRainOffer.privacyEnvelope.h3_cell_r8 === "string",
);

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("\nAll widgetSpec/miaOffer tests passed.");
