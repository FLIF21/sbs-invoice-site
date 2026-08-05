import { spawn } from "node:child_process";

let initializationProcess;

function run(command, args) {
  return new Promise((resolve, reject) => {
    initializationProcess = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });
    initializationProcess.once("error", reject);
    initializationProcess.once("exit", (code, signal) => {
      initializationProcess = undefined;
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? code ?? "an unknown status"}`));
    });
  });
}

const server = spawn(process.execPath, ["server.js"], {
  env: process.env,
  stdio: "inherit",
});

const serverExit = new Promise((resolve) => {
  server.once("error", (error) => resolve({ code: 1, error }));
  server.once("exit", (code, signal) => resolve({ code, signal }));
});

function shutdown(signal) {
  initializationProcess?.kill(signal);
  server.kill(signal);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

const initialization = (async () => {
  await run("./node_modules/.bin/prisma", ["migrate", "deploy"]);
  await run("./node_modules/.bin/tsx", ["prisma/seed.ts"]);
  console.log("Container database initialization completed");
})();

const firstResult = await Promise.race([
  serverExit.then((result) => ({ type: "server", result })),
  initialization.then(() => ({ type: "initialization" })).catch((error) => ({ type: "initialization-error", error })),
]);

if (firstResult.type === "server") {
  initializationProcess?.kill("SIGTERM");
  if (firstResult.result.error) console.error(firstResult.result.error);
  process.exit(firstResult.result.code ?? 1);
}

if (firstResult.type === "initialization-error") {
  console.error("Container database initialization failed", firstResult.error);
  server.kill("SIGTERM");
  await serverExit;
  process.exit(1);
}

const finalServerResult = await serverExit;
if (finalServerResult.error) console.error(finalServerResult.error);
process.exit(finalServerResult.code ?? (finalServerResult.signal ? 1 : 0));
