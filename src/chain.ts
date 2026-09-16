import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";

export const BOT_CHAIN_ID = 968;
export const BOT_RPC =
  import.meta.env.VITE_BOT_RPC_URL || "https://rpc.bohr.life";
export const BOT_EXPLORER =
  import.meta.env.VITE_BOT_EXPLORER_URL || "https://scan.bohr.life";
export const CLOAK_ADDRESS = (import.meta.env.VITE_CLOAK_CONTRACT_ADDRESS ||
  "") as Address;
export const botChain = defineChain({
  id: BOT_CHAIN_ID,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [BOT_RPC] } },
  blockExplorers: { default: { name: "BOT Scan", url: BOT_EXPLORER } },
  testnet: true,
});
export const cloakAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "usedNullifiers",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "accept",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "nullifier", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "EnvelopeAccepted",
    anonymous: false,
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "issuer", type: "address", indexed: true },
    ],
  },
] as const;
export const publicClient = createPublicClient({
  chain: botChain,
  transport: http(BOT_RPC, { timeout: 10000, retryCount: 1 }),
});
export function configuredAddress(): Address | null {
  if (!CLOAK_ADDRESS) return null;
  if (!isAddress(CLOAK_ADDRESS))
    throw new Error("VITE_CLOAK_CONTRACT_ADDRESS is not a valid EVM address");
  return CLOAK_ADDRESS;
}
export async function readNetwork() {
  const [chainId, blockNumber] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
  ]);
  if (chainId !== BOT_CHAIN_ID)
    throw new Error(
      `RPC chain mismatch: got ${chainId}; expected ${BOT_CHAIN_ID}`,
    );
  const address = configuredAddress();
  const code = address ? await publicClient.getCode({ address }) : undefined;
  if (address && (!code || code === "0x"))
    throw new Error(
      "Configured Cloak contract has no bytecode on BOT Chain Testnet",
    );
  const owner = address
    ? await publicClient.readContract({
        address,
        abi: cloakAbi,
        functionName: "owner",
      })
    : null;
  return { chainId, blockNumber, address, code, owner };
}
export async function readNullifier(
  nullifier: Hex,
  address = configuredAddress(),
) {
  if (!address)
    throw new Error(
      "Set VITE_CLOAK_CONTRACT_ADDRESS to enable on-chain verification",
    );
  return publicClient.readContract({
    address,
    abi: cloakAbi,
    functionName: "usedNullifiers",
    args: [nullifier],
  });
}
export function walletClient(provider: NonNullable<Window["ethereum"]>) {
  return createWalletClient({ chain: botChain, transport: custom(provider) });
}
export async function requestBotChain(
  provider: NonNullable<Window["ethereum"]>,
) {
  const current = Number(await provider.request({ method: "eth_chainId" }));
  if (current === BOT_CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x3c8" }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x3c8",
          chainName: botChain.name,
          nativeCurrency: botChain.nativeCurrency,
          rpcUrls: [BOT_RPC],
          blockExplorerUrls: [BOT_EXPLORER],
        },
      ],
    });
  }
}
export async function anchorEnvelope(
  account: Address,
  commitment: Hex,
  nullifier: Hex,
  provider: NonNullable<Window["ethereum"]>,
  address = configuredAddress(),
) {
  if (!address)
    throw new Error("Set VITE_CLOAK_CONTRACT_ADDRESS to enable anchoring");
  const wallet = walletClient(provider);
  const [chainId, used] = await Promise.all([
    wallet.getChainId(),
    readNullifier(nullifier, address),
  ]);
  if (chainId !== BOT_CHAIN_ID)
    throw new Error(
      `Wallet is on chain ${chainId}; switch to BOT Chain Testnet before anchoring`,
    );
  if (used)
    throw new Error(
      "This nullifier has already been anchored; no transaction was sent",
    );
  const { request } = await publicClient.simulateContract({
    account,
    address,
    abi: cloakAbi,
    functionName: "accept",
    args: [commitment, nullifier],
  });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120000,
  });
  if (receipt.status !== "success")
    throw new Error(`Transaction ${hash} reverted`);
  if (!(await readNullifier(nullifier, address)))
    throw new Error("Receipt confirmed, but nullifier read-back is false");
  return { hash, blockNumber: receipt.blockNumber };
}
