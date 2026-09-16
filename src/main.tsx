import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clipboard,
  FileCheck2,
  FileSearch,
  Fingerprint,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { evaluateInvoice, envelopeStorageKey, makeEnvelope } from "./core.mjs";
import {
  anchorEnvelope,
  BOT_EXPLORER,
  configuredAddress,
  readNetwork,
  readNullifier,
  requestBotChain,
} from "./chain";
import type { Address, Hex } from "viem";
import "./styles.css";

type Tab = "check" | "envelopes" | "verify";
type Invoice = {
  reference: string;
  issuer: string;
  amountMinor: number;
  currency: string;
  dueAt: string;
};
type Envelope = {
  id: string;
  createdAt: string;
  commitment: Hex;
  nullifier: Hex;
  public: { amountMinor: number; currency: string; dueAt: string };
  anchor?: { hash: Hex; blockNumber: string };
};
type NetworkState = {
  chainId: number;
  blockNumber: bigint;
  address: Address | null;
  code?: Hex;
  owner: Address | null;
};
const defaultInvoice: Invoice = {
  reference: "",
  issuer: "",
  amountMinor: 0,
  currency: "USD",
  dueAt: "",
};
const today = new Date().toISOString().slice(0, 10);
const addressInitial = (() => {
  try {
    return configuredAddress();
  } catch {
    return null;
  }
})();

function tabFromUrl(): Tab {
  const tab = new URLSearchParams(location.search).get("view");
  return tab === "envelopes" || tab === "verify" ? tab : "check";
}
function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
function short(value: string, start = 10, end = 8) {
  return value.length > start + end + 3
    ? `${value.slice(0, start)}…${value.slice(-end)}`
    : value;
}
function copy(value: string) {
  return navigator.clipboard.writeText(value);
}

function App() {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const [invoice, setInvoice] = useState<Invoice>(defaultInvoice);
  const [privateMaterial, setPrivateMaterial] = useState<{
    reference: string;
    issuer: string;
    salt: string;
  } | null>(null);
  const [activeEnvelope, setActiveEnvelope] = useState<Envelope | null>(null);
  const [records, setRecords] = useState<Envelope[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "prepared" | "anchored"
  >("all");
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<Address | null>(null);
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [network, setNetwork] = useState<NetworkState | null>(null);
  const [networkState, setNetworkState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [networkError, setNetworkError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verification, setVerification] = useState<
    "idle" | "checking" | "used" | "unused" | "error"
  >("idle");
  const [verifyError, setVerifyError] = useState("");
  const [usedMap, setUsedMap] = useState<Record<string, boolean | "checking">>(
    {},
  );
  const address = network?.address || addressInitial;
  const storageKey = envelopeStorageKey({
    chainId: 968,
    contract: address,
    account,
  });
  const checks = useMemo(() => evaluateInvoice(invoice).checks, [invoice]);

  const refreshNetwork = useCallback(async () => {
    setNetworkState("loading");
    setNetworkError("");
    try {
      setNetwork(await readNetwork());
      setNetworkState("ready");
    } catch (error) {
      setNetwork(null);
      setNetworkError(
        error instanceof Error ? error.message : "Could not read BOT Chain",
      );
      setNetworkState("error");
    }
  }, []);

  useEffect(() => {
    const syncTab = () => setTab(tabFromUrl());
    window.addEventListener("popstate", syncTab);
    return () => window.removeEventListener("popstate", syncTab);
  }, []);
  const navigate = (next: Tab) => {
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.pushState({}, "", url);
    setTab(next);
    setNotice(null);
  };
  useEffect(() => {
    void refreshNetwork();
  }, [refreshNetwork]);
  useEffect(() => {
    let live = true;
    const provider = window.ethereum;
    if (!provider) return;
    void Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ])
      .then(([accounts, chain]) => {
        if (!live) return;
        setAccount(
          (accounts as string[])[0]
            ? ((accounts as string[])[0] as Address)
            : null,
        );
        setWalletChain(Number(chain));
      })
      .catch(() => undefined);
    const onAccounts = (...args: unknown[]) => {
      const values = args[0] as string[];
      setAccount((values?.[0] as Address) || null);
      setVerification("idle");
      setUsedMap({});
      setNotice({
        kind: "info",
        text: "Wallet account changed. Account-scoped envelope records were reloaded.",
      });
    };
    const onChain = (...args: unknown[]) => {
      setWalletChain(Number(args[0]));
      setVerification("idle");
      setUsedMap({});
      void refreshNetwork();
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      live = false;
      provider.removeListener("accountsChanged", onAccounts);
      provider.removeListener("chainChanged", onChain);
    };
  }, [refreshNetwork]);
  useEffect(() => {
    try {
      setRecords(
        JSON.parse(localStorage.getItem(storageKey) || "[]") as Envelope[],
      );
    } catch {
      setRecords([]);
    }
    setUsedMap({});
  }, [storageKey]);
  const persistRecords = (next: Envelope[]) => {
    setRecords(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setNotice({
        kind: "error",
        text: "No injected wallet found. Install a compatible EVM wallet to anchor on-chain.",
      });
      return;
    }
    setBusy("wallet");
    setNotice(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.[0]) throw new Error("Wallet did not return an account");
      await requestBotChain(window.ethereum);
      setAccount(accounts[0] as Address);
      setWalletChain(968);
      setNotice({
        kind: "success",
        text: "Wallet connected on BOT Chain Testnet.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Wallet connection was not completed",
      });
    } finally {
      setBusy("");
    }
  };
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    setBusy("switch");
    setNotice(null);
    try {
      await requestBotChain(window.ethereum);
      setWalletChain(968);
      setNotice({
        kind: "success",
        text: "Wallet switched to BOT Chain Testnet.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Network switch was not completed",
      });
    } finally {
      setBusy("");
    }
  };
  const disconnectWallet = () => {
    setAccount(null);
    setWalletChain(null);
    setVerification("idle");
    setUsedMap({});
    setNotice({
      kind: "info",
      text: "Disconnected in Cloak. Revoke this site in your wallet to remove provider access.",
    });
  };

  const submitInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setBusy("evaluate");
    setActiveEnvelope(null);
    setPrivateMaterial(null);
    const result = await makeEnvelope(invoice);
    if (!result.envelope) {
      setNotice({
        kind: "error",
        text: `Review the highlighted fields: ${result.failed.join(", ")}.`,
      });
      setBusy("");
      return;
    }
    const envelope = result.envelope as Envelope;
    setPrivateMaterial(
      result.privateMaterial as {
        reference: string;
        issuer: string;
        salt: string;
      },
    );
    setActiveEnvelope(envelope);
    const next = [
      envelope,
      ...records.filter((record) => record.id !== envelope.id),
    ];
    persistRecords(next);
    setNotice({
      kind: "success",
      text: "Local policy checks pass. This is not a compliance decision or cryptographic proof.",
    });
    setBusy("");
  };

  const anchor = async (record: Envelope) => {
    if (!account || !window.ethereum) {
      setNotice({
        kind: "error",
        text: "Connect a wallet before choosing to anchor.",
      });
      return;
    }
    if (walletChain !== 968) {
      setNotice({
        kind: "error",
        text: "Wallet network is not BOT Chain Testnet. Reconnect or switch network.",
      });
      return;
    }
    setBusy(`anchor:${record.id}`);
    setNotice({
      kind: "info",
      text: "Simulating CloakVerifier.accept. Your wallet will ask for explicit confirmation if simulation succeeds.",
    });
    try {
      const receipt = await anchorEnvelope(
        account,
        record.commitment,
        record.nullifier,
        window.ethereum,
      );
      const updated = records.map((item) =>
        item.id === record.id
          ? {
              ...item,
              anchor: {
                hash: receipt.hash,
                blockNumber: receipt.blockNumber.toString(),
              },
            }
          : item,
      );
      persistRecords(updated);
      if (activeEnvelope?.id === record.id)
        setActiveEnvelope({
          ...record,
          anchor: {
            hash: receipt.hash,
            blockNumber: receipt.blockNumber.toString(),
          },
        });
      setUsedMap((value) => ({ ...value, [record.nullifier]: true }));
      setNotice({
        kind: "success",
        text: `Transaction confirmed in block ${receipt.blockNumber.toString()}. The nullifier read-back is true.`,
      });
    } catch (error) {
      const walletError = error as { code?: number; name?: string };
      const text =
        walletError.code === 4001 ||
        walletError.name === "UserRejectedRequestError"
          ? "Wallet request rejected. No anchor was recorded."
          : error instanceof Error
            ? error.message
            : "Anchor did not complete. Check wallet activity for a revert.";
      setNotice({ kind: "error", text });
    } finally {
      setBusy("");
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerification("checking");
    setVerifyError("");
    if (!/^0x[0-9a-fA-F]{64}$/.test(verifyInput.trim())) {
      setVerification("error");
      setVerifyError(
        "Enter a 32-byte nullifier (0x followed by 64 hex characters).",
      );
      return;
    }
    try {
      const used = await readNullifier(verifyInput.trim() as Hex);
      setVerification(used ? "used" : "unused");
    } catch (error) {
      setVerification("error");
      setVerifyError(
        error instanceof Error
          ? error.message
          : "Could not read this nullifier",
      );
    }
  };

  const checkSavedNullifier = async (record: Envelope) => {
    setUsedMap((value) => ({ ...value, [record.nullifier]: "checking" }));
    try {
      const used = await readNullifier(record.nullifier);
      setUsedMap((value) => ({ ...value, [record.nullifier]: used }));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Read failed",
      });
    }
  };
  const exportCsv = () => {
    const rows = [
      [
        "commitment",
        "nullifier",
        "amount_minor",
        "currency",
        "due_at",
        "status",
        "transaction_hash",
      ],
      ...visibleRecords.map((item) => [
        item.commitment,
        item.nullifier,
        item.public.amountMinor,
        item.public.currency,
        item.public.dueAt,
        item.anchor ? "anchored" : "prepared_local",
        item.anchor?.hash || "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "cloak-public-envelopes.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const visibleRecords = records.filter(
    (record) =>
      (statusFilter === "all" ||
        (statusFilter === "anchored") === Boolean(record.anchor)) &&
      `${record.commitment} ${record.nullifier} ${record.public.currency} ${record.public.dueAt}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="?view=check"
          onClick={(event) => {
            event.preventDefault();
            navigate("check");
          }}
          aria-label="Cloak invoice desk"
        >
          <img src="/cloak-mark.svg" width="34" height="34" alt="" />
          <span>Cloak</span>
        </a>
        <nav className="primary-nav" aria-label="Primary workflows">
          {(
            [
              ["check", "Check invoice", FileCheck2],
              ["envelopes", "Envelopes", Fingerprint],
              ["verify", "Verify", FileSearch],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              className={`nav-item ${tab === key ? "selected" : ""}`}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {key === "envelopes" && records.length > 0 && (
                <span className="nav-count">{records.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span
            className={`network-pill ${networkState === "ready" ? "online" : networkState === "error" ? "offline" : "checking"}`}
          >
            <i />
            {networkState === "ready"
              ? `BOT Testnet · ${network?.blockNumber.toString()}`
              : networkState === "loading"
                ? "Connecting to RPC"
                : "RPC unavailable"}
          </span>
          {account && walletChain === 968 ? (
            <button
              className="wallet-button connected"
              onClick={disconnectWallet}
              title="Disconnect wallet from this page"
            >
              <Wallet size={16} />
              <span>{short(account, 6, 4)}</span>
              <LogOut size={14} />
            </button>
          ) : account ? (
            <button
              className="wallet-button"
              onClick={() => void switchNetwork()}
              disabled={busy === "switch"}
            >
              {busy === "switch" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Wallet size={16} />
              )}
              <span>Switch to BOT</span>
            </button>
          ) : (
            <button
              className="wallet-button"
              onClick={() => void connectWallet()}
              disabled={busy === "wallet"}
            >
              {busy === "wallet" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Wallet size={16} />
              )}
              <span>Connect wallet</span>
            </button>
          )}
        </div>
      </header>

      <main className="workspace">
        <section className="page-intro">
          <div>
            <h1>
              {tab === "check"
                ? "Check invoice"
                : tab === "envelopes"
                  ? "Envelopes"
                  : "Verify"}
            </h1>
            <p>
              {tab === "check"
                ? "Review the invoice privately. Only a commitment and selected terms can leave this screen."
                : tab === "envelopes"
                  ? "Public-safe envelope details saved in this browser, scoped to the active chain, contract and account."
                  : "Check whether a nullifier is recorded on the deployed CloakVerifier."}
            </p>
          </div>
          <button
            className="quiet-icon"
            title="Refresh BOT Chain reads"
            aria-label="Refresh BOT Chain reads"
            onClick={() => void refreshNetwork()}
          >
            <RefreshCw
              size={17}
              className={networkState === "loading" ? "spin" : ""}
            />
          </button>
        </section>

        {networkError && (
          <div className="inline-alert warning">
            <CircleAlert size={17} />
            <span>
              {networkError} Public chain reads may be unavailable until RPC
              recovers.
            </span>
          </div>
        )}
        {notice && (
          <div className={`inline-alert ${notice.kind}`} role="status">
            <span className="notice-icon">
              {notice.kind === "success" ? (
                <CheckCircle2 size={17} />
              ) : notice.kind === "error" ? (
                <CircleAlert size={17} />
              ) : (
                <CircleHelp size={17} />
              )}
            </span>
            <span>{notice.text}</span>
            <button
              className="quiet-icon compact"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {tab === "check" && (
          <>
            <div className="check-layout">
              <section
                className="form-column"
                aria-labelledby="invoice-form-title"
              >
                <div className="section-heading">
                  <div>
                    <h2 id="invoice-form-title">Invoice details</h2>
                    <p>
                      Originals stay in this browser tab. They are not posted to
                      a server.
                    </p>
                  </div>
                  <span className="local-badge">
                    <span /> Local only
                  </span>
                </div>
                <form
                  onSubmit={(event) => void submitInvoice(event)}
                  noValidate
                >
                  <div className="field-grid">
                    <label className="field">
                      <span>Invoice reference</span>
                      <input
                        autoComplete="off"
                        maxLength={100}
                        value={invoice.reference}
                        onChange={(event) =>
                          setInvoice({
                            ...invoice,
                            reference: event.target.value,
                          })
                        }
                        placeholder="e.g. INV-2048"
                        aria-invalid={
                          invoice.reference.length > 0 && !checks[0].ok
                        }
                      />
                      <small>
                        Private field · not included in public envelope
                      </small>
                    </label>
                    <label className="field">
                      <span>Issuer name</span>
                      <input
                        autoComplete="organization"
                        maxLength={120}
                        value={invoice.issuer}
                        onChange={(event) =>
                          setInvoice({ ...invoice, issuer: event.target.value })
                        }
                        placeholder="Legal or trading name"
                      />
                      <small>
                        Private field · not included in public envelope
                      </small>
                    </label>
                    <label className="field">
                      <span>Invoice amount</span>
                      <div className="amount-input">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={
                            invoice.amountMinor ? invoice.amountMinor / 100 : ""
                          }
                          onChange={(event) =>
                            setInvoice({
                              ...invoice,
                              amountMinor: Math.round(
                                Number(event.target.value) * 100,
                              ),
                            })
                          }
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                        <select
                          aria-label="Currency"
                          value={invoice.currency}
                          onChange={(event) =>
                            setInvoice({
                              ...invoice,
                              currency: event.target.value,
                            })
                          }
                        >
                          {[
                            "USD",
                            "EUR",
                            "GBP",
                            "NGN",
                            "CAD",
                            "AUD",
                            "JPY",
                          ].map((currency) => (
                            <option key={currency}>{currency}</option>
                          ))}
                        </select>
                      </div>
                      <small>
                        Local field-shape limit: max 100,000.00 units; not a
                        financing decision
                      </small>
                    </label>
                    <label className="field">
                      <span>Due date</span>
                      <input
                        type="date"
                        min={today}
                        value={invoice.dueAt}
                        onChange={(event) =>
                          setInvoice({ ...invoice, dueAt: event.target.value })
                        }
                      />
                      <small>Included in public envelope terms</small>
                    </label>
                  </div>
                  <div className="policy-block">
                    <div className="policy-title">
                      <span>Local policy checklist</span>
                      <span className="policy-caption">
                        Input completeness · not external verification
                      </span>
                    </div>
                    <ul>
                      {checks.map((check) => (
                        <li
                          key={check.label}
                          className={check.ok ? "passed" : "pending-check"}
                        >
                          {check.ok ? (
                            <Check size={15} />
                          ) : (
                            <span className="empty-check" />
                          )}
                          <span>{check.label}</span>
                          <small>{check.ok ? "Ready" : "Needed"}</small>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={busy === "evaluate"}
                  >
                    {busy === "evaluate" ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <ShieldCheck size={17} />
                    )}
                    {busy === "evaluate"
                      ? "Preparing locally…"
                      : "Check invoice"}
                  </button>
                  <p className="form-footnote">
                    No prover or compliance service is connected. A passing
                    checklist means only that these fields meet local format
                    rules.
                  </p>
                </form>
              </section>
              <aside className="disclosure-column">
                <div className="boundary-visual">
                  <img
                    src="/disclosure-boundary.svg"
                    alt="Disclosure boundary: issuer and invoice identity on the private side; commitment and selected terms on the public side"
                  />
                </div>
                <div className="boundary-labels">
                  <span>
                    <i className="dot-private" /> Private inputs
                  </span>
                  <span>
                    <i className="dot-public" /> Public envelope
                  </span>
                </div>
                <div className="editorial-note">
                  <span className="note-rule" />
                  <div>
                    <h3>A commitment is a fingerprint, not a verdict.</h3>
                    <p>
                      Cloak’s contract records a commitment and prevents a
                      nullifier from being used twice. It does not check invoice
                      truth, eligibility, or prove a zero-knowledge statement.
                    </p>
                  </div>
                </div>
                {network?.owner && (
                  <div className="contract-fact">
                    <span>Verifier owner</span>
                    <a
                      href={`${BOT_EXPLORER}/address/${network.owner}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(network.owner)} <ArrowUpRight size={13} />
                    </a>
                    <small>
                      Contract read-back · permissionless accept function
                    </small>
                  </div>
                )}
              </aside>
            </div>

            {activeEnvelope && (
              <section className="result-sheet" aria-live="polite">
                <div className="result-head">
                  <div>
                    <div className="result-state">
                      <CheckCircle2 size={18} /> Local checks pass
                    </div>
                    <h2>Envelope prepared</h2>
                    <p>
                      No external compliance result or cryptographic proof was
                      produced.
                    </p>
                  </div>
                  <span className="result-time">
                    {new Date(activeEnvelope.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="disclosure-columns">
                  <div className="disclosure-side private-side">
                    <h3>
                      <span className="side-mark" />
                      Private · stays here
                    </h3>
                    <dl>
                      <div>
                        <dt>Invoice reference</dt>
                        <dd>{privateMaterial?.reference || "Not retained"}</dd>
                      </div>
                      <div>
                        <dt>Issuer</dt>
                        <dd>{privateMaterial?.issuer || "Not retained"}</dd>
                      </div>
                      <div>
                        <dt>Random salt</dt>
                        <dd className="muted-dd">
                          {privateMaterial
                            ? "Held in tab memory only"
                            : "Not retained · cannot be recovered"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="boundary-divider">
                    <span>
                      COMMITMENT
                      <br />
                      BOUNDARY
                    </span>
                  </div>
                  <div className="disclosure-side public-side">
                    <h3>
                      <span className="side-mark" />
                      Public · written only if you choose
                    </h3>
                    <dl>
                      <div>
                        <dt>Amount</dt>
                        <dd>
                          {formatMoney(
                            activeEnvelope.public.amountMinor,
                            activeEnvelope.public.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Due date</dt>
                        <dd>{activeEnvelope.public.dueAt}</dd>
                      </div>
                      <div>
                        <dt>Commitment</dt>
                        <dd className="mono copyable">
                          <code title={activeEnvelope.commitment}>
                            {short(activeEnvelope.commitment, 17, 14)}
                          </code>
                          <button
                            onClick={() => void copy(activeEnvelope.commitment)}
                            title="Copy commitment"
                            aria-label="Copy commitment"
                          >
                            <Clipboard size={14} />
                          </button>
                        </dd>
                      </div>
                      <div>
                        <dt>Nullifier status</dt>
                        <dd>
                          {activeEnvelope.anchor
                            ? "Recorded on BOT Chain"
                            : "Not anchored"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="result-actions">
                  <div className="fine-print">
                    <CircleHelp size={15} />
                    <span>
                      Anchoring publishes commitment, nullifier and your wallet
                      address. Do not include sensitive data in either hash.
                    </span>
                  </div>
                  <button
                    className="primary-button"
                    disabled={
                      !account ||
                      !address ||
                      Boolean(activeEnvelope.anchor) ||
                      busy === `anchor:${activeEnvelope.id}`
                    }
                    onClick={() => void anchor(activeEnvelope)}
                  >
                    {busy === `anchor:${activeEnvelope.id}` ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Fingerprint size={17} />
                    )}
                    {!address
                      ? "Contract address not configured"
                      : activeEnvelope.anchor
                        ? "Anchored"
                        : !account
                          ? "Connect wallet to anchor"
                          : "Anchor nullifier on BOT"}
                  </button>
                </div>
                {activeEnvelope.anchor && (
                  <a
                    className="tx-link"
                    href={`${BOT_EXPLORER}/tx/${activeEnvelope.anchor.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Confirmed transaction {short(activeEnvelope.anchor.hash)}{" "}
                    <ArrowUpRight size={14} />
                  </a>
                )}
              </section>
            )}
          </>
        )}

        {tab === "envelopes" && (
          <section className="records-view">
            <div className="list-toolbar">
              <div
                className="filter-set"
                role="group"
                aria-label="Filter envelopes"
              >
                {(
                  [
                    ["all", "All"],
                    ["prepared", "Prepared"],
                    ["anchored", "Anchored"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={statusFilter === key ? "filter-active" : ""}
                    onClick={() => setStatusFilter(key)}
                  >
                    {label}
                    <span>
                      {key === "all"
                        ? records.length
                        : records.filter(
                            (record) =>
                              Boolean(record.anchor) === (key === "anchored"),
                          ).length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="list-actions">
                <label className="search-box">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search hashes or terms"
                    aria-label="Search envelopes"
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={exportCsv}
                  disabled={!visibleRecords.length}
                >
                  <ArrowDownToLine size={16} />
                  Export CSV
                </button>
              </div>
            </div>
            {!records.length ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <Fingerprint size={28} strokeWidth={1.4} />
                </div>
                <h2>No envelopes in this scope</h2>
                <p>
                  Prepare an invoice first. Saved records contain public
                  envelope fields only and stay in this browser.
                </p>
                <button
                  className="text-action"
                  onClick={() => navigate("check")}
                >
                  Check an invoice <ArrowUpRight size={15} />
                </button>
              </div>
            ) : !visibleRecords.length ? (
              <div className="empty-state compact-empty">
                <h2>No matching envelopes</h2>
                <p>Try another filter or search term.</p>
                <button
                  className="text-action"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="envelope-list">
                {visibleRecords.map((record) => (
                  <article className="envelope-row" key={record.id}>
                    <div className="row-main">
                      <span
                        className={`row-status ${record.anchor ? "anchored" : "prepared"}`}
                      >
                        <i />
                        {record.anchor ? "Anchored" : "Prepared locally"}
                      </span>
                      <code>{short(record.commitment, 15, 12)}</code>
                      <span className="row-amount">
                        {formatMoney(
                          record.public.amountMinor,
                          record.public.currency,
                        )}
                      </span>
                      <span className="row-date">
                        Due {record.public.dueAt}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="quiet-icon"
                        title="Check nullifier on BOT Chain"
                        aria-label="Check nullifier on BOT Chain"
                        onClick={() => void checkSavedNullifier(record)}
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        className="row-action"
                        onClick={() => {
                          setPrivateMaterial(null);
                          setActiveEnvelope(record);
                          navigate("check");
                        }}
                      >
                        Open <ArrowUpRight size={14} />
                      </button>
                      {usedMap[record.nullifier] !== undefined && (
                        <span
                          className={`used-label ${usedMap[record.nullifier] === true ? "yes" : "no"}`}
                        >
                          {usedMap[record.nullifier] === "checking"
                            ? "Checking…"
                            : usedMap[record.nullifier]
                              ? "Used on-chain"
                              : "Not recorded"}
                        </span>
                      )}
                    </div>
                    {record.anchor && (
                      <a
                        className="row-tx"
                        href={`${BOT_EXPLORER}/tx/${record.anchor.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(record.anchor.hash)} <ArrowUpRight size={13} />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
            <p className="scope-note">
              Local browser data · Chain 968 · Contract{" "}
              {address ? short(address, 8, 6) : "not configured"} · Account{" "}
              {account ? short(account, 7, 5) : "local"}
            </p>
          </section>
        )}

        {tab === "verify" && (
          <section className="verify-layout">
            <div className="verify-form">
              <div className="verify-icon">
                <Fingerprint size={23} />
              </div>
              <h2>Nullifier lookup</h2>
              <p>
                Read the deployed contract’s <code>usedNullifiers</code>{" "}
                mapping. This confirms only whether a value was recorded.
              </p>
              <form onSubmit={(event) => void verify(event)}>
                <label className="field">
                  <span>Nullifier</span>
                  <input
                    className="mono"
                    spellCheck={false}
                    autoComplete="off"
                    value={verifyInput}
                    onChange={(event) => {
                      setVerifyInput(event.target.value);
                      setVerification("idle");
                    }}
                    placeholder="0x… 64 hex characters"
                  />
                  <small>Read-only call · no wallet required</small>
                </label>
                <button
                  className="primary-button"
                  disabled={verification === "checking" || !address}
                >
                  {verification === "checking" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Search size={17} />
                  )}
                  {verification === "checking"
                    ? "Checking chain…"
                    : "Check on BOT Chain"}
                </button>
                {!address && (
                  <p className="field-error">
                    Set VITE_CLOAK_CONTRACT_ADDRESS to enable this read.
                  </p>
                )}
                {verifyError && (
                  <p className="field-error" role="alert">
                    {verifyError}
                  </p>
                )}
              </form>
              {verification === "used" && (
                <div className="verify-result used">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Nullifier is recorded</strong>
                    <span>
                      The contract reports this value has already been accepted.
                    </span>
                  </div>
                </div>
              )}
              {verification === "unused" && (
                <div className="verify-result unused">
                  <CircleHelp size={18} />
                  <div>
                    <strong>Nullifier not recorded</strong>
                    <span>
                      This contract has no accepted entry for the supplied
                      value.
                    </span>
                  </div>
                </div>
              )}
              {verification === "error" && (
                <div className="verify-result failed">
                  <CircleAlert size={18} />
                  <div>
                    <strong>Lookup unavailable</strong>
                    <span>Check the RPC connection and retry.</span>
                  </div>
                </div>
              )}
            </div>
            <aside className="verification-limits">
              <h3>What this check proves</h3>
              <p>
                The contract mapping says whether a nullifier was marked as
                used. <b>It does not prove:</b>
              </p>
              <ul>
                <li>the invoice exists or is accurate</li>
                <li>eligibility, compliance, payment, or settlement</li>
                <li>that a zero-knowledge proof was verified</li>
              </ul>
              <div className="contract-fact">
                <span>Read target</span>
                {address ? (
                  <a
                    href={`${BOT_EXPLORER}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(address)} <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <strong>Not configured</strong>
                )}
                <small>BOT Chain Testnet · chain ID 968</small>
              </div>
            </aside>
          </section>
        )}
        <footer className="footer">
          <span>
            Cloak <span className="footer-sep">·</span> Confidential invoice
            desk
          </span>
          <span>Testnet tool · No prover or compliance adapter</span>
          <a
            href="https://github.com/nftkingiii/botchain-cloak"
            target="_blank"
            rel="noreferrer"
          >
            Contract source <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
