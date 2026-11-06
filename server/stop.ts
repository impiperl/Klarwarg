import "./env.ts";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const project = realpathSync(path.join(import.meta.dirname, ".."));
const port = Number(process.env.PORT || 4317);

function listeners(): number[] {
  try {
    return execFileSync("fuser", ["-n", "tcp", String(port)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw new Error(
      "Zum Stoppen wird unter Linux fuser benötigt (Paket psmisc).",
    );
  }
}

async function stop() {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT muss eine Zahl zwischen 1 und 65535 sein.");
  const pids = listeners();
  if (!pids.length) {
    console.log(`Klarwarg läuft nicht auf Port ${port}.`);
    return;
  }
  // Nur den Server dieses Projekts stoppen, niemals einen anderen Dienst auf demselben Port.
  for (const pid of pids) {
    const cwd = realpathSync(`/proc/${pid}/cwd`);
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    const isServer = ["server/index.ts", "server-build/index.mjs"].some(
      (file) =>
        args.some((arg) => arg === file || arg === path.join(project, file)),
    );
    if (cwd !== project || !isServer)
      throw new Error(
        `Port ${port} wird von einem anderen Prozess verwendet. Er wurde nicht beendet.`,
      );
  }
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  // SIGTERM lässt den Server seine SQLite-Daten ordentlich schließen.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!listeners().length) {
      console.log(`Klarwarg auf Port ${port} beendet.`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Port ${port} ist noch belegt. Bitte das Serverterminal prüfen.`,
  );
}

stop().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
