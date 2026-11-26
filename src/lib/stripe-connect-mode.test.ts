import assert from "node:assert/strict";
import test from "node:test";
import { cardRail } from "./stripe-connect-mode";

test("ein freigeschaltetes Connect-Konto nimmt die Kartenzahlung", () => {
  assert.equal(
    cardRail({
      accountId: "acct_123",
      chargesEnabled: true,
      legacyReady: true,
    }),
    "connect",
  );
});

test("ein noch nicht freigeschaltetes Konto blockiert die alten Schlüssel", () => {
  assert.equal(
    cardRail({
      accountId: "acct_123",
      chargesEnabled: false,
      legacyReady: true,
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
