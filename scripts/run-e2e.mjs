import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, E2E_BASE_URL: "http://127.0.0.1:3000", E2E_TEST_MODE: "1" };
const server = spawn(process.execPath, [join(root, "scripts", "e2e-server.mjs")], { cwd: root, env, stdio: "inherit" });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`E2E-сервер завершился с кодом ${server.exitCode}`);
    try {
      const response = await fetch(env.E2E_BASE_URL);
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("E2E-сервер не запустился за 30 секунд");
}

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

let exitCode = 1;
try {
  await waitUntilReady();
  const playwright = spawn(
    process.execPath,
    [join(root, "node_modules", "@playwright", "test", "cli.js"), "test"],
    { cwd: root, env, stdio: "inherit" },
  );
  const [code] = await once(playwright, "exit");
  exitCode = typeof code === "number" ? code : 1;
} finally {
  await stopServer();
}

process.exitCode = exitCode;
