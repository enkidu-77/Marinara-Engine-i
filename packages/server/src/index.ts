// ──────────────────────────────────────────────
// Server Entry Point
// ──────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { buildApp } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "7860", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

function loadTlsOptions() {
  const cert = process.env.SSL_CERT;
  const key = process.env.SSL_KEY;
  if (!cert || !key) return null;
  try {
    return {
      cert: readFileSync(cert),
      key: readFileSync(key),
    };
  } catch (err) {
    throw new Error(
      `Failed to load TLS certificate/key files.\n` +
        `  SSL_CERT=${cert}\n` +
        `  SSL_KEY=${key}\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n` +
        `Please ensure the paths are correct and the files are readable.`,
    );
  }
}

async function main() {
  const tls = loadTlsOptions();
  const app = await buildApp(tls ?? undefined);
  const protocol = tls ? "https" : "http";

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Marinara Engine server listening on ${protocol}://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[ERROR] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
