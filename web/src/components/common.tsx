import { useReadContract } from "wagmi";
import { market } from "../config";
import { decodeTokenUri } from "../lib";
import type { useTx } from "../hooks";

export function TicketImage({ tokenId }: { tokenId: bigint }) {
  const { data } = useReadContract({ ...market, functionName: "tokenURI", args: [tokenId] });
  const meta = data ? decodeTokenUri(data) : null;
  if (!meta) return <div className="ticket-img ticket-img--loading" aria-hidden />;
  return <img className="ticket-img" src={meta.image} alt={meta.name} />;
}

export function TxStatus({ tx }: { tx: ReturnType<typeof useTx> }) {
  const { status } = tx;
  if (status.kind === "idle") return null;
  if (status.kind === "pending") return <p className="status status--pending">{status.label}</p>;
  if (status.kind === "error") return <p className="status status--error" role="alert">{status.message}</p>;
  return <p className="status status--ok">Hecho.</p>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__text">{children}</p>}
    </div>
  );
}
