import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConfig, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import type { Address } from "viem";
import { euro, market } from "./config";
import { errorMessage } from "./lib";

export type EventInfo = {
  id: bigint;
  organizer: Address;
  startsAt: bigint;
  maxSupply: number;
  sold: number;
  maxPerWallet: number;
  resaleCapBps: number;
  royaltyBps: number;
  price: bigint;
  name: string;
  venue: string;
};

export type TicketInfo = {
  id: bigint;
  owner: Address;
  eventId: bigint;
  seat: number;
  used: boolean;
  listing: { seller: Address; price: bigint } | null;
};

const range = (n: number) => Array.from({ length: n }, (_, i) => BigInt(i + 1));

export function useEvents() {
  const { data: count } = useReadContract({ ...market, functionName: "eventCount" });
  const ids = range(Number(count ?? 0n));
  const { data, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({ ...market, functionName: "getEvent", args: [id] }) as const),
    query: { enabled: ids.length > 0 },
  });

  const events: EventInfo[] = [];
  data?.forEach((r, i) => {
    if (r.status === "success") events.push({ id: ids[i], ...(r.result as Omit<EventInfo, "id">) });
  });
  return { events, isLoading: isLoading || count === undefined };
}

/** There's no enumeration on-chain, so read every ticket. Fine for a demo with a few hundred tickets. */
export function useTickets() {
  const { data: count } = useReadContract({ ...market, functionName: "ticketCount" });
  const ids = range(Number(count ?? 0n));
  const { data, isLoading } = useReadContracts({
    contracts: ids.flatMap(
      (id) =>
        [
          { ...market, functionName: "ownerOf", args: [id] },
          { ...market, functionName: "tickets", args: [id] },
          { ...market, functionName: "listings", args: [id] },
        ] as const,
    ),
    query: { enabled: ids.length > 0 },
  });

  const tickets: TicketInfo[] = [];
  if (data) {
    ids.forEach((id, i) => {
      const [owner, ticket, listing] = data.slice(i * 3, i * 3 + 3);
      if (owner.status !== "success" || ticket.status !== "success" || listing.status !== "success") return;
      const [eventId, seat, used] = ticket.result as readonly [bigint, number, boolean];
      const [seller, price] = listing.result as readonly [Address, bigint];
      tickets.push({
        id,
        owner: owner.result as Address,
        eventId,
        seat,
        used,
        listing: seller === "0x0000000000000000000000000000000000000000" ? null : { seller, price },
      });
    });
  }
  return { tickets, isLoading: isLoading || count === undefined };
}

export function useEuroBalance() {
  const { address } = useAccount();
  return useReadContract({
    ...euro,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
}

type Status = { kind: "idle" } | { kind: "pending"; label: string } | { kind: "error"; message: string } | { kind: "done"; label: string };

/**
 * Sends one or more transactions in order and refreshes every read once they're mined.
 * Handles the EURT approval automatically when a payment is needed.
 */
export function useTx() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function ensureAllowance(amount: bigint) {
    if (!address) throw new Error("Conecta tu wallet primero.");
    const allowance = await readContract(config, { ...euro, functionName: "allowance", args: [address, market.address] });
    if (allowance >= amount) return;
    setStatus({ kind: "pending", label: "Autoriza el pago en EURT…" });
    const hash = await writeContractAsync({ ...euro, functionName: "approve", args: [market.address, amount] });
    await waitForTransactionReceipt(config, { hash });
  }

  async function run(label: string, send: () => Promise<`0x${string}`>, payment?: bigint) {
    try {
      if (payment) await ensureAllowance(payment);
      setStatus({ kind: "pending", label });
      const hash = await send();
      setStatus({ kind: "pending", label: "Esperando confirmación…" });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("La transacción ha revertido.");
      await queryClient.invalidateQueries();
      setStatus({ kind: "done", label });
      return true;
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
      return false;
    }
  }

  return { run, status, writeContractAsync, busy: status.kind === "pending", reset: () => setStatus({ kind: "idle" }) };
}
