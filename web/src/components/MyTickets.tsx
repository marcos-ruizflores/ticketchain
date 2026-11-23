import { useState } from "react";
import { useAccount } from "wagmi";
import { market } from "../config";
import { type EventInfo, type TicketInfo, useEvents, useTickets, useTx } from "../hooks";
import { formatEur, parseEur } from "../lib";
import { Empty, TicketImage, TxStatus } from "./common";

export function MyTickets() {
  const { address } = useAccount();
  const { tickets, isLoading } = useTickets();
  const { events } = useEvents();

  if (!address) return <Empty title="Conecta tu wallet">Así podrás ver tus entradas.</Empty>;
  if (isLoading) return <p className="muted">Cargando tus entradas…</p>;

  const mine = tickets.filter((t) => t.owner.toLowerCase() === address.toLowerCase());
  if (mine.length === 0) return <Empty title="Aún no tienes entradas">Compra una en la pestaña Eventos.</Empty>;

  return (
    <div className="grid">
      {mine.map((t) => (
        <MyTicket key={t.id.toString()} ticket={t} ev={events.find((e) => e.id === t.eventId)} />
      ))}
    </div>
  );
}

function MyTicket({ ticket, ev }: { ticket: TicketInfo; ev?: EventInfo }) {
  const tx = useTx();
  const cap = ev ? (ev.price * BigInt(ev.resaleCapBps)) / 10_000n : 0n;
  const [price, setPrice] = useState(() => (cap ? (Number(cap) / 1e6).toFixed(2) : ""));
  const started = ev ? Number(ev.startsAt) <= Date.now() / 1000 : false;

  let parsed: bigint | null = null;
  try {
    parsed = price ? parseEur(price) : null;
  } catch {
    parsed = null;
  }
  const overCap = parsed !== null && parsed > cap;

  const list = () => {
    if (!parsed) return;
    tx.run("Poniendo a la venta…", () =>
      tx.writeContractAsync({ ...market, functionName: "list", args: [ticket.id, parsed] }),
    );
  };

  return (
    <article className="card">
      <TicketImage tokenId={ticket.id} />
      <p className="muted small">Entrada #{ticket.id.toString()}, enséñala en la puerta para validarla</p>

      {ticket.used ? (
        <p className="pill pill--used">Usada</p>
      ) : ticket.listing ? (
        <>
          <p className="pill">En venta por {formatEur(ticket.listing.price)}</p>
          <button
            className="btn btn--block"
            disabled={tx.busy}
            onClick={() => tx.run("Retirando…", () => tx.writeContractAsync({ ...market, functionName: "cancelListing", args: [ticket.id] }))}
          >
            Retirar de la venta
          </button>
        </>
      ) : started ? (
        <p className="pill">El evento ya ha empezado</p>
      ) : (
        <form
          className="resell"
          onSubmit={(e) => {
            e.preventDefault();
            list();
          }}
        >
          <label htmlFor={`price-${ticket.id}`}>Revender por</label>
          <div className="resell__row">
            <input
              id={`price-${ticket.id}`}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-invalid={overCap}
            />
            <button className="btn" disabled={!parsed || overCap || tx.busy}>
              Vender
            </button>
          </div>
          <p className={overCap ? "hint hint--error" : "hint"}>Máximo {formatEur(cap)}, lo marca el contrato</p>
        </form>
      )}
      <TxStatus tx={tx} />
    </article>
  );
}
