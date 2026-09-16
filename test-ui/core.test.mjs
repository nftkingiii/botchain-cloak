import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateInvoice,
  envelopeStorageKey,
  makeEnvelope,
} from "../src/core.mjs";

const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const invoice = {
  reference: "INV-207",
  issuer: "Northline Studio",
  amountMinor: 294000,
  currency: "USD",
  dueAt: future,
};
test("invoice checklist returns specific local validation failures", () => {
  const result = evaluateInvoice({ ...invoice, amountMinor: 0 });
  assert.equal(result.passed, false);
  assert.deepEqual(result.failed, ["Amount"]);
});
test("envelope separates a random private salt from public fields", async () => {
  const result = await makeEnvelope(invoice);
  assert.equal(result.passed, true);
  assert.match(result.envelope.commitment, /^0x[0-9a-f]{64}$/);
  assert.match(result.envelope.nullifier, /^0x[0-9a-f]{64}$/);
  assert.equal("salt" in result.envelope, false);
  assert.equal("issuer" in result.envelope.public, false);
  assert.equal(result.privateMaterial.reference, invoice.reference);
});
test("local record storage namespaces chain, contract, and account", () => {
  assert.notEqual(
    envelopeStorageKey({ chainId: 968, contract: "0xAbC", account: "0x1" }),
    envelopeStorageKey({ chainId: 968, contract: "0xabc", account: "0x2" }),
  );
});
