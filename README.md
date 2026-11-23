# TicketChain

Concert tickets as NFTs, with resale rules enforced by the contract instead of by a platform's terms of service.

**Live demo:** https://marcos-ruizflores.github.io/ticketchain/ (Sepolia testnet, MetaMask needed to buy)

Scalpers buy tickets in bulk and resell them at 5x the price. Here a ticket can only change hands through the contract, and the contract refuses any resale above the cap the organizer set. The organizer also gets a cut of every resale.

## Live on Sepolia

| Contract | Address |
|---|---|
| EuroToken (EURT) | [`0x26a11F8c057c9e9a6044c26A87B2f479D4B7fdB7`](https://sepolia.etherscan.io/address/0x26a11F8c057c9e9a6044c26A87B2f479D4B7fdB7#code) |
| TicketMarket | [`0xCa32Aaf74dd5d27031431dd113049643A5E27181`](https://sepolia.etherscan.io/address/0xCa32Aaf74dd5d27031431dd113049643A5E27181#code) |

Both are verified on Etherscan. Grab some test EURT from the faucet in the app and buy a ticket.

## How it works

- **Organizers** create an event with a price, capacity, a per-wallet limit, a resale cap (for example 110% of face value) and a royalty on resales.
- **Fans** buy tickets with EURT, a test euro stablecoin with 6 decimals like EURC. Each ticket is an ERC-721 token with a seat number.
- **Resale** happens on the same contract. The listing price can't go over the cap, and the payment is split automatically between the seller and the organizer.
- **Direct transfers are disabled.** Otherwise people could agree on a price off-chain and just send the NFT, skipping the cap.
- **At the door**, the organizer or a scanner wallet checks the ticket in. A used ticket can't be listed again.
- **Metadata and artwork live on-chain.** `tokenURI` returns JSON with an SVG ticket built by the contract, so it doesn't depend on a server or an IPFS pin.

| Valid | Used |
|---|---|
| Green `VALID` stamp | Red `USED` stamp after check-in |

## Contracts

| Contract | What it does |
|---|---|
| `EuroToken.sol` | ERC-20 test stablecoin (EURT), owner mint plus a public faucet with a 24h cooldown |
| `TicketMarket.sol` | Events, primary sale, capped resale, royalties, check-in, transfer lock |
| `TicketArt.sol` | Builds the token metadata and SVG on-chain |

Built with Solidity 0.8.28 and OpenZeppelin 5.

### Design decisions

- **Stablecoin instead of ETH.** Ticket prices are in euros, and paying in ETH means the price moves between listing and purchase. A euro token keeps the resale cap meaningful.
- **Basis points everywhere.** `resaleCapBps = 11_000` means 110%. Integer math, no rounding surprises. The cap can't go above 2x and royalties can't go above 20%.
- **Per-wallet limits count tickets held, not tickets bought.** The counter is updated in `_update`, so it stays right through purchases and resales.
- **Text is validated.** Event names end up inside JSON and SVG, so the contract only accepts printable ASCII without quotes, `<`, `>` or `&`.
- **ReentrancyGuard and custom errors** on every path that moves money.

## Tests

```bash
npm install
forge test
```

28 tests cover the primary sale, wallet limits, the resale cap, the payment split, check-in and the transfer lock. Two fuzz tests check that resale payments always add up to what the buyer paid, and that no price above the cap is ever accepted.

## Deploy to Sepolia

```bash
cp .env.example .env               # add an Etherscan API key
cast wallet import deployer --interactive
source .env
forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --broadcast --verify
```

The script deploys EURT and the market and creates a demo event. You need a little Sepolia ETH for gas, which you can get from any public faucet.

## Web app

`web/` is a small React app (Vite, TypeScript, wagmi, viem) to use the contracts from the browser:

- **Eventos**: upcoming events with stock, rules and a buy button
- **Reventa**: tickets for sale, with how far above face value each one is
- **Mis entradas**: your tickets rendered from the on-chain SVG, with a resale form that shows the cap
- **Organizador**: create events, check tickets in at the door and authorise scanner wallets

EURT approvals are handled automatically before a purchase, and contract errors are shown as readable messages.

```bash
cd web
npm install
cp .env.example .env   # contract addresses from the deploy script
npm run dev
```

There's no ticket enumeration on-chain, so the app reads every ticket through multicall. That's fine for a demo. A real deployment would index the events with a subgraph or a small backend.

## Roadmap

- QR check-in. The ticket holder signs a message and the scanner verifies the signature and the owner
- Refunds if an event is cancelled
