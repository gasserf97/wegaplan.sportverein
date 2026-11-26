import assert from "node:assert/strict";
import test from "node:test";
import {
  cardRefundCoveredByBalance,
  eurBalanceCents,
} from "./stripe-refund";

test("EUR-Saldo zählt nur Euro-Zeilen", () => {
  assert.equal(
    eurBalanceCents([
      { amount: 1200, currency: "eur" },
      { amount: 50, currency: "usd" },
      { amount: 300, currency: "eur" },
    ]),
    1500,
  );
  assert.equal(eurBalanceCents(null), 0);
});

test("Erstattung nur, wenn verfügbares und ausstehendes Guthaben reicht", () => {
  assert.equal(
    cardRefundCoveredByBalance({
      refundCents: 800,
      availableCents: 500,
      pendingCents: 300,
    }),
    true,
  );
  assert.equal(
    cardRefundCoveredByBalance({
      refundCents: 801,
      availableCents: 500,
      pendingCents: 300,
    }),
    false,
  );
  assert.equal(
    cardRefundCoveredByBalance({
      refundCents: 100,
      availableCents: -20,
      pendingCents: 0,
    }),
    false,
  );
});
