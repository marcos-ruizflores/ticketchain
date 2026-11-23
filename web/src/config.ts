import { http, createConfig, injected } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import type { Address } from "viem";
import { euroAbi, marketAbi } from "./abi";

const env = import.meta.env;

export const targetChain = env.VITE_CHAIN === "local" ? foundry : sepolia;

export const config = createConfig({
  chains: [sepolia, foundry],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(env.VITE_CHAIN === "local" ? undefined : env.VITE_RPC_URL),
    [foundry.id]: http(env.VITE_CHAIN === "local" ? env.VITE_RPC_URL : undefined),
  },
});

export const euro = {
  address: env.VITE_EURT_ADDRESS as Address,
  abi: euroAbi,
  chainId: targetChain.id,
} as const;

export const market = {
  address: env.VITE_MARKET_ADDRESS as Address,
  abi: marketAbi,
  chainId: targetChain.id,
} as const;

export const isConfigured = Boolean(env.VITE_EURT_ADDRESS && env.VITE_MARKET_ADDRESS);

export const explorerTx = (hash: string) =>
  targetChain.blockExplorers?.default ? `${targetChain.blockExplorers.default.url}/tx/${hash}` : undefined;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
