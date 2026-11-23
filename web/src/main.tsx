import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config, isConfigured, targetChain } from "./config";
import { Wallet } from "./components/Wallet";
import { Events } from "./components/Events";
import { Resale } from "./components/Resale";
import { MyTickets } from "./components/MyTickets";
import { Organizer } from "./components/Organizer";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchInterval: 15_000 } } });

const TABS = [
  { id: "eventos", label: "Eventos", view: Events },
  { id: "reventa", label: "Reventa", view: Resale },
  { id: "mis-entradas", label: "Mis entradas", view: MyTickets },
  { id: "organizador", label: "Organizador", view: Organizer },
] as const;

type TabId = (typeof TABS)[number]["id"];

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === window.location.hash)?.id ?? "eventos";

const networkName = targetChain.id === 31337 ? "una red local de pruebas" : `la red ${targetChain.name}`;

function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const View = TABS.find((t) => t.id === tab)!.view;

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      <header className="header">
        <div className="header__inner">
          <a className="logo" href="./">
            <span className="logo__mark" aria-hidden>
              T
            </span>
            TicketChain
          </a>
          {isConfigured && <Wallet />}
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h1>Entradas que no se pueden revender a precio de oro</h1>
          <p>
            Cada entrada es un NFT en {networkName}. Puedes revenderla, pero el contrato nunca acepta un precio por encima
            del tope que fija el organizador, y le paga su parte de cada reventa.
          </p>
        </section>

        {!isConfigured ? (
          <div className="card notice">
            <h3>Falta configurar los contratos</h3>
            <p>
              Copia <code>web/.env.example</code> a <code>web/.env</code> y rellena las direcciones de EURT y del market
              después de desplegarlos.
            </p>
          </div>
        ) : (
          <>
            <nav className="tabs" role="tablist">
              {TABS.map((t) => (
                <a key={t.id} href={`#${t.id}`} role="tab" aria-selected={tab === t.id} className="tabs__tab">
                  {t.label}
                </a>
              ))}
            </nav>
            <View />
          </>
        )}
      </main>

      <footer className="footer">
        Demo en testnet. EURT es un token de prueba sin valor.{" "}
        <a href="https://github.com/marcos-ruizflores/ticketchain" target="_blank" rel="noreferrer">
          Código en GitHub
        </a>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
