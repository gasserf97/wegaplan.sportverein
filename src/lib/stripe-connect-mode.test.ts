import assert from "node:assert/strict";
import test from "node:test";
import { cardRail } from "./stripe-connect-mode";

test("ein eigener Secret Key geht vor ein verbundenes Konto", () => {
  assert.equal(
    cardRail({
      accountId: "acct_123",
      chargesEnabled: true,
      legacyReady: true,
    }),
    "legacy",
  );
  assert.equal(
    cardRail({
      accountId: "acct_123",
      chargesEnabled: false,
      legacyReady: true,
    }),
    "legacy",
  );
});

test("ohne Secret Key nimmt ein freigeschaltetes verbundenes Konto die Zahlung", () => {
  assert.equal(
    cardRail({
      accountId: "acct_123",
      chargesEnabled: true,
      legacyReady: false,
    }),
    "connect",
  );
});

test("ein noch nicht freigeschaltetes Konto ohne Schlüssel blockiert die Zahlung", () => {
  assert.equal(
    cardRail({
      accountId: "acct_123",
      chargesEnabled: false,
      legacyReady: false,
    }),
    "pending",
  );
});

test("ohne Connect-Konto bleiben die Sektions-Schlüssel", () => {
  assert.equal(
    cardRail({ accountId: "", chargesEnabled: false, legacyReady: true }),
    "legacy",
  );
  assert.equal(
    cardRail({ accountId: "  ", chargesEnabled: false, legacyReady: false }),
    "none",
  );
});
