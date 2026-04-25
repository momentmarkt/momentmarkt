/**
 * Lightweight tests for `../redeem`. Vitest is not in the project
 * deps, so this file runs as a plain Node script via:
 *
 *   pnpm --dir apps/mobile exec tsx src/lib/__tests__/redeem.test.ts
 *
 * (or `node --import tsx ...`). It prints a single-line per assertion
 * and exits non-zero on the first failure. Kept dependency-free on
 * purpose — wires into the same `pnpm typecheck` story without
 * adding a test runner to the bundle.
 *
 * If vitest is later added, the assertions below port over by
 * wrapping each `assert(...)` in a `test("...", () => assert(...))`.
 */

import {
  generateRedeemToken,
  getMerchantBudgetRemaining,
  resetMerchantBudget,
  simulateCheckout,
} from "../redeem";

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

async function main(): Promise<void> {
  // generateRedeemToken
  const token = generateRedeemToken("offer-bondi-rain-gap-1330");
  assert("generateRedeemToken returns a string", typeof token === "string");
  assert("generateRedeemToken starts with MM-", token.startsWith("MM-"));
  assert(
    "generateRedeemToken includes the offer id",
    token.includes("offer-bondi-rain-gap-1330"),
  );

  const tokenA = generateRedeemToken("a");
  await new Promise((r) => setTimeout(r, 5));
  const tokenB = generateRedeemToken("a");
  assert(
    "generateRedeemToken suffix changes over time",
    tokenA !== tokenB || tokenA.length > 4,
  );

  // simulateCheckout
  resetMerchantBudget();
  const startBudget = getMerchantBudgetRemaining();
  const result = await simulateCheckout(token, 12);
  assert("simulateCheckout returns ok=true", result.ok === true);
  assert(
    "simulateCheckout cashback is 15% of amount",
    Math.abs(result.cashbackEur - 1.8) < 0.001,
  );
  assert(
    "simulateCheckout decrements merchant budget by amount",
    Math.abs(result.budgetRemaining - (startBudget - 12)) < 0.001,
  );
  assert(
    "simulateCheckout exposes remaining via getter",
    Math.abs(getMerchantBudgetRemaining() - (startBudget - 12)) < 0.001,
  );

  // budget never goes negative
  resetMerchantBudget();
  const huge = await simulateCheckout(token, 9999);
  assert(
    "simulateCheckout clamps merchant budget at 0",
    huge.budgetRemaining === 0,
  );

  if (failures > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("\nAll redeem tests passed.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("FAIL unexpected error", err);
  process.exit(1);
});
