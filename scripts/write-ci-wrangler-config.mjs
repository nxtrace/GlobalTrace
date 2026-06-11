import { readFile, writeFile } from "node:fs/promises";

const inputPath = "wrangler.jsonc";
const outputPath = process.env.CI_WRANGLER_CONFIG_OUT || ".wrangler-ci.jsonc";

const requiredEnv = {
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  GLOBALTRACE_HOSTNAME: process.env.GLOBALTRACE_HOSTNAME,
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
};

for (const [name, value] of Object.entries(requiredEnv)) {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
}

const hostname = requiredEnv.GLOBALTRACE_HOSTNAME.trim();
if (hostname.includes("://") || hostname.includes("/") || /\s/.test(hostname)) {
  throw new Error("GLOBALTRACE_HOSTNAME must be a bare hostname without protocol, path, or spaces");
}

const config = JSON.parse(await readFile(inputPath, "utf8"));
config.account_id = requiredEnv.CLOUDFLARE_ACCOUNT_ID.trim();
config.workers_dev = false;
config.routes = [
  {
    pattern: hostname,
    custom_domain: true,
  },
];
config.vars = {
  ...(config.vars || {}),
  APP_ENV: "production",
  TURNSTILE_SITE_KEY: requiredEnv.TURNSTILE_SITE_KEY.trim(),
};

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
