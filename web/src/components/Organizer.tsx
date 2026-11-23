import { useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { market } from "../config";
import { useEvents, useTx } from "../hooks";
import { formatEur, parseEur } from "../lib";
import { Empty, TxStatus } from "./common";

export function Organizer() {
  const { address } = useAccount();
  if (!address) return <Empty title="Conecta tu wallet">Cualquiera puede crear un evento y venderlo aquí.</Empty>;
  return (
    <div className="organizer">
      <CreateEvent />
      <div className="stack">
        <CheckIn />
        <MyEvents />
      </div>
    </div>
  );
}

const defaultDate = () => {
  const d = new Date(Date.now() + 30 * 86400_000);
  d.setHours(21, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function CreateEvent() {
  const tx = useTx();
  const [form, setForm] = useState({
    name: "",
    venue: "",
    date: defaultDate(),
    price: "45",
    supply: "100",
    perWallet: "4",
    cap: "110",
    royalty: "5",
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const startsAt = BigInt(Math.floor(new Date(form.date).getTime() / 1000));
    tx.run("Creando evento…", () =>
      tx.writeContractAsync({
        ...market,
        functionName: "createEvent",
        args: [
          form.name.trim(),
          form.venue.trim(),
          startsAt,
          parseEur(form.price),
          Number(form.supply),
          Number(form.perWallet),
          Math.round(Number(form.cap) * 100),
          Math.round(Number(form.royalty) * 100),
        ],
      }),
    );
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h3>Crear evento</h3>
      <Field label="Nombre" hint="Máx. 32 caracteres, sin acentos ni comillas">
        <input value={form.name} onChange={set("name")} maxLength={32} required placeholder="Primavera Night" />
      </Field>
      <Field label="Recinto">
        <input value={form.venue} onChange={set("venue")} maxLength={40} required placeholder="Parc del Forum, Barcelona" />
      </Field>
      <Field label="Fecha y hora">
        <input type="datetime-local" value={form.date} onChange={set("date")} required />
      </Field>
      <div className="form__row">
        <Field label="Precio (EURT)">
          <input inputMode="decimal" value={form.price} onChange={set("price")} required />
        </Field>
        <Field label="Aforo">
          <input type="number" min={1} value={form.supply} onChange={set("supply")} required />
        </Field>
      </div>
      <div className="form__row form__row--3">
        <Field label="Máx. por persona">
          <input type="number" min={1} value={form.perWallet} onChange={set("perWallet")} required />
        </Field>
        <Field label="Tope reventa %">
          <input type="number" min={100} max={200} value={form.cap} onChange={set("cap")} required />
        </Field>
        <Field label="Comisión %">
          <input type="number" min={0} max={20} step="0.5" value={form.royalty} onChange={set("royalty")} required />
        </Field>
      </div>
      <button className="btn btn--primary btn--block" disabled={tx.busy}>
        {tx.busy ? "Procesando…" : "Crear evento"}
      </button>
      <TxStatus tx={tx} />
    </form>
  );
}

function CheckIn() {
  const { events } = useEvents();
  const { address } = useAccount();
  const tx = useTx();
  const scannerTx = useTx();
  const [ticketId, setTicketId] = useState("");
  const [scanner, setScanner] = useState("");
  const mine = events.filter((e) => e.organizer.toLowerCase() === address?.toLowerCase());
  const [eventId, setEventId] = useState("");
  const selected = eventId || mine[0]?.id.toString() || "";

  return (
    <div className="card form">
      <h3>Validar en la puerta</h3>
      <form
        className="resell__row"
        onSubmit={(e) => {
          e.preventDefault();
          tx.run("Validando…", () =>
            tx.writeContractAsync({ ...market, functionName: "checkIn", args: [BigInt(ticketId)] }),
          );
        }}
      >
        <input inputMode="numeric" placeholder="Nº de entrada" value={ticketId} onChange={(e) => setTicketId(e.target.value.replace(/\D/g, ""))} />
        <button className="btn btn--primary" disabled={!ticketId || tx.busy}>
          Validar
        </button>
      </form>
      <TxStatus tx={tx} />

      {mine.length > 0 && (
        <form
          className="scanner"
          onSubmit={(e) => {
            e.preventDefault();
            scannerTx.run("Autorizando…", () =>
              scannerTx.writeContractAsync({
                ...market,
                functionName: "setScanner",
                args: [BigInt(selected), scanner as `0x${string}`, true],
              }),
            );
          }}
        >
          <p className="muted small">Autoriza a otra wallet a validar entradas de tu evento</p>
          <select value={selected} onChange={(e) => setEventId(e.target.value)}>
            {mine.map((ev) => (
              <option key={ev.id.toString()} value={ev.id.toString()}>
                {ev.name}
              </option>
            ))}
          </select>
          <div className="resell__row">
            <input placeholder="0x…" value={scanner} onChange={(e) => setScanner(e.target.value.trim())} />
            <button className="btn" disabled={!isAddress(scanner) || scannerTx.busy}>
              Autorizar
            </button>
          </div>
          <TxStatus tx={scannerTx} />
        </form>
      )}
    </div>
  );
}

function MyEvents() {
  const { address } = useAccount();
  const { events } = useEvents();
  const mine = events.filter((e) => e.organizer.toLowerCase() === address?.toLowerCase());
  if (mine.length === 0) return null;
  return (
    <div className="card">
      <h3>Tus eventos</h3>
      <ul className="my-events">
        {mine.map((ev) => (
          <li key={ev.id.toString()}>
            <span>{ev.name}</span>
            <span className="muted">
              {ev.sold}/{ev.maxSupply} vendidas · {formatEur(ev.price * BigInt(ev.sold))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
