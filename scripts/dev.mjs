import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const WORKER_PORT = Number(process.env.GLOBALTRACE_WORKER_PORT || 8787);
const LOCAL_BIN = path.resolve("node_modules/.bin");
const WORKER_ONLY = process.argv.includes("--worker-only");

// wrangler dev refuses to start when assets.directory is missing, and a fresh
// clone has no dist yet.
mkdirSync(path.resolve("dist"), { recursive: true });

const children = [];
let shutdownPromise;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

start("wrangler", ["dev", "--local", "--port", String(WORKER_PORT)], {
  HOME: path.resolve(".wrangler-home"),
});
if (!WORKER_ONLY) {
  start("vite", ["--host", "127.0.0.1"], {
    GLOBALTRACE_WORKER_PORT: String(WORKER_PORT),
  });
}

function start(command, args, env) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...env,
      PATH: `${LOCAL_BIN}${path.delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  children.push(child);
  child.on("exit", (code) => shutdown(code ?? 1));
  child.on("error", (error) => {
    console.error(`${command} failed to start: ${error.message}`);
    shutdown(1);
  });
}

function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  process.exitCode = code;
  shutdownPromise = Promise.all(children.map(stop)).then(() => undefined);
  return shutdownPromise;
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return Promise.resolve();
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return Promise.resolve();
  }
  // Keep Node alive until taskkill has removed the shell and all descendants.
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("exit", resolve);
    killer.once("error", resolve);
  });
}
