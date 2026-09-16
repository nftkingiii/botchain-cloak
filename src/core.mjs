export const LIMIT_MINOR = 10000000;
const localToday = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
})();
export function evaluateInvoice(invoice) {
  const checks = [
    {
      label: "Invoice reference",
      ok:
        typeof invoice.reference === "string" &&
        invoice.reference.trim().length > 0,
    },
    {
      label: "Issuer",
      ok:
        typeof invoice.issuer === "string" && invoice.issuer.trim().length > 0,
    },
    {
      label: "Amount",
      ok:
        Number.isSafeInteger(invoice.amountMinor) &&
        invoice.amountMinor > 0 &&
        invoice.amountMinor <= LIMIT_MINOR,
    },
    { label: "Currency", ok: /^[A-Z]{3}$/.test(invoice.currency || "") },
    {
      label: "Due date",
      ok:
        /^\d{4}-\d{2}-\d{2}$/.test(invoice.dueAt || "") &&
        invoice.dueAt >= localToday,
    },
  ];
  return {
    checks,
    passed: checks.every((check) => check.ok),
    failed: checks.filter((check) => !check.ok).map((check) => check.label),
  };
}

export async function makeEnvelope(invoice, cryptoApi = crypto) {
  const result = evaluateInvoice(invoice);
  if (!result.passed) return { ...result, envelope: null };
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  const salt = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const encoder = new TextEncoder();
  const privateCanonical = JSON.stringify({
    reference: invoice.reference.trim(),
    issuer: invoice.issuer.trim(),
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    dueAt: invoice.dueAt,
    salt,
  });
  const hash = await cryptoApi.subtle.digest(
    "SHA-256",
    encoder.encode(privateCanonical),
  );
  const commitment = `0x${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const nullifierHash = await cryptoApi.subtle.digest(
    "SHA-256",
    encoder.encode(`cloak-nullifier:v1:${invoice.reference.trim()}:${salt}`),
  );
  const nullifier = `0x${[...new Uint8Array(nullifierHash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return {
    ...result,
    envelope: {
      id: cryptoApi.randomUUID(),
      createdAt: new Date().toISOString(),
      commitment,
      nullifier,
      public: {
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        dueAt: invoice.dueAt,
      },
    },
    privateMaterial: {
      reference: invoice.reference.trim(),
      issuer: invoice.issuer.trim(),
      salt,
    },
  };
}

export function envelopeStorageKey({ chainId, contract, account }) {
  return `cloak:envelopes:${chainId}:${(contract || "unconfigured").toLowerCase()}:${(account || "local").toLowerCase()}`;
}
