// Copies the ABIs from Foundry's build output into src/abi.ts.
// Run `forge build` in the repo root first.
import { readFileSync, writeFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`../../out/${name}.sol/${name}.json`, import.meta.url))).abi;

const body = `// Generated from the compiled contracts. Run \`npm run abi\` after \`forge build\` to refresh.

export const euroAbi = ${JSON.stringify(read("EuroToken"), null, 2)} as const;

export const marketAbi = ${JSON.stringify(read("TicketMarket"), null, 2)} as const;
`;
writeFileSync(new URL("../src/abi.ts", import.meta.url), body);
console.log("src/abi.ts updated");
