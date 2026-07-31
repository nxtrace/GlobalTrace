import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const WORKER_PORT = Number(process.env.GLOBALTRACE_WORKER_PORT || 8787);
const LOCAL_BIN = path.resolve("node_modules/.bin");

// wrangler dev refuses to start when assets.directory is missing, and a fresh
// clone has no dist yet.
mkdirSync(path.resolve("dist"), { recursive: true });

const children = [];
let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

start("wrangler", ["dev", "--local", "--port", String(WORKER_PORT)], {
  HOME: path.resolve(".wrangler-home"),
});
start("vite", ["--host", "127.0.0.1"], {
  GLOBALTRACE_WORKER_PORT: String(WORKER_PORT),
});

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
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code;
}
