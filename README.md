# Cloak

Cloak is a browser-first invoice eligibility desk. It checks invoice field shape locally, creates a salted commitment, and provides an optional on-chain nullifier anchor. Invoice originals and the salt stay in tab memory; browser storage holds only the public envelope fields.

The local checklist is not a compliance verdict. No prover or compliance integration is connected. The deployed `CloakVerifier` does not verify a ZK proof or invoice facts: its public `accept(bytes32,bytes32)` records a commitment and marks a nullifier used once. An anchor proves only that this contract recorded those values.

Verified BOT Chain Testnet deployment evidence: [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md). RPC read-back confirms chain ID 968 and deployed bytecode at the documented address. There is no mainnet deployment claim.

## Run locally

```sh
npm ci --ignore-scripts
Copy-Item .env.example .env
npm run dev
```

The local app runs at `http://localhost:5173`. `npm run build && npm start` serves the production build on `0.0.0.0:$PORT` (default `4323`), including `/healthz` and deep-link refresh fallback.

## Commands

```sh
npm test
npm run typecheck
npm run format:check
npm run build
forge build
forge test
```

The app test script intentionally targets only `test-ui/*.test.mjs`; Solidity tests remain under Foundry and are not accidentally collected by Node.

## Runtime configuration

See `.env.example`: `VITE_CLOAK_CONTRACT_ADDRESS` (verified Testnet address), `VITE_BOT_RPC_URL`, `VITE_BOT_EXPLORER_URL`, and `PORT`. No secrets are needed. The address variable must refer to CloakVerifier on chain 968; code presence and `owner()` are read back before the app reports the contract ready.

## Wallet boundary

Public reads work without a wallet. Connecting requests accounts and asks the wallet to switch/add BOT Chain Testnet. An anchor happens only after a separate user click, nullifier-unused read, ABI simulation, wallet confirmation, receipt confirmation, and `usedNullifiers` read-back. The contract’s `accept` function is permissionless; `owner` is informational, not an authorization check. No private key is read by the app.

## Proof checklist

- [x] Testnet deployment transaction and verified source: [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md)
- [x] RPC chain ID, deployed bytecode and owner read-back verified
- [ ] User-approved wallet transaction from the interface
- [ ] Explorer receipt and post-transaction `usedNullifiers` read-back
- [ ] Independent direct-wallet/live-DApp walkthrough

The deployment receipt is contract evidence, not proof of invoice eligibility, compliance, business settlement, or zero-knowledge verification.
