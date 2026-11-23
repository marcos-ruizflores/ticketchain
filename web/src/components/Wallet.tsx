import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { euro, targetChain } from "../config";
import { useEuroBalance, useTx } from "../hooks";
import { formatEur, shortAddress } from "../lib";

export function Wallet() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useEuroBalance();
  const tx = useTx();

  if (!isConnected) {
    const injected = connectors[0];
    const hasWallet = typeof window !== "undefined" && "ethereum" in window;
    return hasWallet ? (
      <button className="btn btn--primary" onClick={() => connect({ connector: injected })} disabled={isPending}>
        {isPending ? "Conectando…" : "Conectar wallet"}
      </button>
    ) : (
      <a className="btn" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
        Instalar MetaMask
      </a>
    );
  }

  if (chainId !== targetChain.id) {
    return (
      <button className="btn btn--warn" onClick={() => switchChain({ chainId: targetChain.id })}>
        Cambiar a {targetChain.name}
      </button>
    );
  }

  return (
    <div className="wallet">
      <span className="wallet__balance">{balance !== undefined ? formatEur(balance) : "…"}</span>
      <button
        className="btn btn--small"
        disabled={tx.busy}
        title="Te da 500 EURT de prueba, una vez al día"
        onClick={() => tx.run("Pidiendo EURT…", () => tx.writeContractAsync({ ...euro, functionName: "claim" }))}
      >
        {tx.busy ? "…" : "+500 EURT"}
      </button>
      <button className="wallet__address" onClick={() => disconnect()} title="Desconectar">
        {shortAddress(address!)}
      </button>
      {tx.status.kind === "error" && (
        <p className="wallet__error" role="alert" onClick={tx.reset}>
          {tx.status.message}
        </p>
      )}
    </div>
  );
}
