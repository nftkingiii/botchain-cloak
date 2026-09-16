export type InvoiceInput = {
  reference: string;
  issuer: string;
  amountMinor: number;
  currency: string;
  dueAt: string;
};
export type FieldCheck = { label: string; ok: boolean };
export type PublicEnvelope = {
  id: string;
  createdAt: string;
  commitment: `0x${string}`;
  nullifier: `0x${string}`;
  public: { amountMinor: number; currency: string; dueAt: string };
};
export function evaluateInvoice(invoice: InvoiceInput): {
  checks: FieldCheck[];
  passed: boolean;
  failed: string[];
};
export function makeEnvelope(invoice: InvoiceInput): Promise<{
  checks: FieldCheck[];
  passed: boolean;
  failed: string[];
  envelope: PublicEnvelope | null;
  privateMaterial?: { reference: string; issuer: string; salt: string };
}>;
export function envelopeStorageKey(scope: {
  chainId: number;
  contract: string | null;
  account: string | null;
}): string;
