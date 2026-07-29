/**
 * Log in to Pro-Data and save credentials to `.env.local`.
 *
 * Usage:
 *   npm run prodata:login -- YOUR_PASSWORD
 *
 * Or set PRODATA_API_PASSWORD in .env.local first, then:
 *   npm run prodata:login
 */
import fs from "fs";
import path from "path";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();

const ENV_PATH = path.join(process.cwd(), ".env.local");

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

async function main() {
  const password =
    process.argv[2]?.trim() || process.env.PRODATA_API_PASSWORD?.trim();
  if (!password) {
    console.error("Missing Pro-Data password.");
    console.error("");
    console.error("  npm run prodata:login -- YOUR_PASSWORD");
    console.error("");
    console.error("Or add PRODATA_API_PASSWORD=... to .env.local and run again.");
    process.exit(1);
  }

  const baseUrl =
    process.env.PRODATA_API_URL?.trim() ||
    "http://office2.prodata-ks.com:8080/RestAPI";
  const username = process.env.PRODATA_API_USERNAME?.trim() || "prodata";
  const uniqueIdent =
    process.env.PRODATA_API_UNIQUE_IDENT?.trim() || "1234567";

  process.env.PRODATA_SYNC_ENABLED = "true";
  process.env.PRODATA_API_URL = baseUrl;
  process.env.PRODATA_API_USERNAME = username;
  process.env.PRODATA_API_PASSWORD = password;
  process.env.PRODATA_API_UNIQUE_IDENT = uniqueIdent;

  const { proDataLogin } = await import("../src/lib/integrations/prodata-client");
  console.log("Logging in to Pro-Data…");
  const token = await proDataLogin({
    baseUrl,
    username,
    password,
    uniqueIdent,
  });

  let envContent = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8")
    : "";

  envContent = upsertEnvLine(envContent, "PRODATA_SYNC_ENABLED", "true");
  envContent = upsertEnvLine(envContent, "PRODATA_API_URL", baseUrl);
  envContent = upsertEnvLine(envContent, "PRODATA_API_USERNAME", username);
  envContent = upsertEnvLine(envContent, "PRODATA_API_PASSWORD", password);
  envContent = upsertEnvLine(envContent, "PRODATA_API_UNIQUE_IDENT", uniqueIdent);
  envContent = upsertEnvLine(envContent, "PRODATA_API_TOKEN", token);

  fs.writeFileSync(ENV_PATH, envContent, "utf8");

  console.log("Saved to .env.local:");
  console.log("  PRODATA_SYNC_ENABLED=true");
  console.log("  PRODATA_API_PASSWORD=***");
  console.log("  PRODATA_API_TOKEN=<fresh JWT>");
  console.log("");
  console.log("Run: npm run test:prodata-api");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
