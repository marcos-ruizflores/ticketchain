import { BaseError, ContractFunctionRevertedError, formatUnits, parseUnits, UserRejectedRequestError } from "viem";

export const EURT_DECIMALS = 6;

export const formatEur = (amount: bigint) => {
  const value = Number(formatUnits(amount, EURT_DECIMALS));
  return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EURT";
};

export const parseEur = (value: string) => parseUnits(value.replace(",", "."), EURT_DECIMALS);

export const formatDate = (timestamp: bigint | number) =>
  new Date(Number(timestamp) * 1000).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** tokenURI is base64 JSON with a base64 SVG inside. */
export function decodeTokenUri(uri: string): { name: string; image: string } | null {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) return null;
  try {
    return JSON.parse(atob(uri.slice(prefix.length)));
  } catch {
    return null;
  }
}

const REVERT_MESSAGES: Record<string, string> = {
  SoldOut: "Las entradas de este evento están agotadas.",
  WalletLimitReached: "Ya tienes el máximo de entradas que permite este evento.",
  EventStarted: "El evento ya ha empezado, la venta está cerrada.",
  PriceAboveCap: "Ese precio supera el tope de reventa del evento.",
  NotTicketOwner: "Esta entrada no es tuya.",
  TicketAlreadyUsed: "Esta entrada ya se ha usado.",
  NotListed: "Esta entrada ya no está a la venta.",
  CannotBuyOwnTicket: "No puedes comprar tu propia entrada.",
  NotOrganizer: "Solo el organizador puede hacer esto.",
  NotScanner: "No tienes permiso para validar entradas de este evento.",
  InvalidEvent: "Revisa los datos del evento: fecha futura, precio y límites válidos.",
  InvalidText: "Nombre o recinto no válidos. Usa letras sin acentos ni comillas, máximo 32/40 caracteres.",
  UnknownEvent: "Ese evento no existe.",
  FaucetCooldown: "Ya has pedido EURT hoy. Vuelve en 24 horas.",
  ERC20InsufficientBalance: "No tienes suficientes EURT. Pide más en el grifo.",
  ERC721NonexistentToken: "Esa entrada no existe.",
};

export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "Has cancelado la transacción.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return REVERT_MESSAGES[name] ?? `La transacción ha fallado (${name || "revert"}).`;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Algo ha fallado.";
}
