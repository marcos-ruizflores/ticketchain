import { useAccount } from "wagmi";
import { market } from "../config";
import { type EventInfo, useEvents, useTx } from "../hooks";
import { formatDate, formatEur } from "../lib";
import { Empty, TxStatus } from "./common";

export function Events() {
  const { events, isLoading } = useEvents();
  if (isLoading) return <p className="muted">Cargando eventos…</p>;
  if (events.length === 0) return <Empty title="Todavía no hay eventos">Crea el primero desde la pestaña Organizador.</Empty>;

  const now = Date.now() / 1000;
  const sorted = [...events].sort((a, b) => Number(a.startsAt - b.startsAt));
  return (
    <div className="grid">
      {sorted.map((ev) => (
        <EventCard key={ev.id.toString()} ev={ev} past={Number(ev.startsAt) <= now} />
      ))}
    </div>
  );
}

function EventCard({ ev, past }: { ev: EventInfo; past: boolean }) {
  const { isConnected } = useAccount();
  const tx = useTx();
  const soldOut = ev.sold >= ev.maxSupply;
  const left = ev.maxSupply - ev.sold;

  const buy = () =>
    tx.run("Comprando entrada…", () => tx.writeContractAsync({ ...market, functionName: "buy", args: [ev.id] }), ev.price);

  return (
    <article className="card event">
      <div className="event__head">
        <h3>{ev.name}</h3>
        <span className="event__price">{formatEur(ev.price)}</span>
      </div>
      <p className="muted">{ev.venue}</p>
      <p className="event__date">{formatDate(ev.startsAt)}</p>

      <div className="meter" aria-label={`${ev.sold} de ${ev.maxSupply} vendidas`}>
        <div className="meter__fill" style={{ width: `${(ev.sold / ev.maxSupply) * 100}%` }} />
      </div>
      <p className="event__stock">{soldOut ? "Agotado" : `Quedan ${left} de ${ev.maxSupply}`}</p>

      <ul className="rules">
        <li>Máximo {ev.maxPerWallet} por persona</li>
        <li>Reventa hasta el {ev.resaleCapBps / 100} % del precio</li>
        <li>{ev.royaltyBps / 100} % de cada reventa al organizador</li>
      </ul>

      <button className="btn btn--primary btn--block" onClick={buy} disabled={!isConnected || soldOut || past || tx.busy}>
        {past ? "Evento pasado" : soldOut ? "Agotado" : tx.busy ? "Procesando…" : "Comprar entrada"}
      </button>
      <TxStatus tx={tx} />
    </article>
  );
}
