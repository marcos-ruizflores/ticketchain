import { useAccount } from "wagmi";
import { market } from "../config";
import { type EventInfo, type TicketInfo, useEvents, useTickets, useTx } from "../hooks";
import { formatEur, shortAddress } from "../lib";
import { Empty, TicketImage, TxStatus } from "./common";

export function Resale() {
  const { tickets, isLoading } = useTickets();
  const { events } = useEvents();
  if (isLoading) return <p className="muted">Cargando reventa…</p>;

  const listed = tickets.filter((t) => t.listing);
  if (listed.length === 0)
    return <Empty title="No hay entradas en reventa">Cuando alguien ponga una entrada a la venta, aparecerá aquí.</Empty>;

  return (
    <div className="grid">
      {listed.map((t) => (
        <ListingCard key={t.id.toString()} ticket={t} ev={events.find((e) => e.id === t.eventId)} />
      ))}
    </div>
  );
}

function ListingCard({ ticket, ev }: { ticket: TicketInfo; ev?: EventInfo }) {
  const { address } = useAccount();
  const tx = useTx();
  const listing = ticket.listing!;
  const mine = address?.toLowerCase() === listing.seller.toLowerCase();
  const markup = ev ? Number((listing.price * 10_000n) / ev.price) / 100 - 100 : 0;

  return (
    <article className="card listing">
      <TicketImage tokenId={ticket.id} />
      <div className="listing__row">
        <span className="listing__price">{formatEur(listing.price)}</span>
        {ev && (
          <span className={markup > 0 ? "tag tag--up" : "tag"}>
            {markup > 0 ? `+${markup.toFixed(0)} %` : markup < 0 ? `${markup.toFixed(0)} %` : "precio original"}
          </span>
        )}
      </div>
      <p className="muted small">Vende {mine ? "tú" : shortAddress(listing.seller)}</p>
      {mine ? (
        <button
          className="btn btn--block"
          disabled={tx.busy}
          onClick={() => tx.run("Retirando…", () => tx.writeContractAsync({ ...market, functionName: "cancelListing", args: [ticket.id] }))}
        >
          Retirar de la venta
        </button>
      ) : (
        <button
          className="btn btn--primary btn--block"
          disabled={!address || tx.busy}
          onClick={() =>
            tx.run("Comprando…", () => tx.writeContractAsync({ ...market, functionName: "buyListed", args: [ticket.id] }), listing.price)
          }
        >
          {tx.busy ? "Procesando…" : "Comprar"}
        </button>
      )}
      <TxStatus tx={tx} />
    </article>
  );
}
