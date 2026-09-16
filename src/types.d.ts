interface ImportMetaEnv {
  readonly VITE_CLOAK_CONTRACT_ADDRESS?: string;
  readonly VITE_BOT_RPC_URL?: string;
  readonly VITE_BOT_EXPLORER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
interface Window {
  ethereum?: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    removeListener(event: string, listener: (...args: unknown[]) => void): void;
  };
}
