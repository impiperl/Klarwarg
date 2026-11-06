import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const project = path.resolve(import.meta.dirname, "..");
async function freePort() {
  const socket = createServer().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => socket.once("listening", resolve));
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}
async function start(args: string[], port: number, data: string) {
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATA_DIR: data,
    PUBLIC_ORIGIN: "",
    COOKIE_SECURE: "false",
  };
  const child = spawn(process.execPath, args, {
    cwd: project,
    env,
    stdio: "ignore",
  });
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    await exited;
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)
          return { child, env, close };
      } catch {}
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("Test server exited before listening");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Test server did not start");
  } catch (error) {
    await close();
    throw error;
  }
}

test(
  "npm stop ends this project's npm-start server, then succeeds when already stopped",
  { timeout: 20000 },
  async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-stop-"));
    const port = await freePort();
    const server = await start(
      ["--import", "tsx", "server/index.ts"],
      port,
      dir,
    );
    try {
      const first = await run("npm", ["stop", "--silent"], {
        cwd: project,
        env: server.env,
      });
      assert.match(first.stdout, /beendet/);
      await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`));
      const again = await run("npm", ["stop", "--silent"], {
        cwd: project,
        env: server.env,
      });
      assert.match(again.stdout, /läuft nicht/);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "npm stop refuses to terminate another HTTP service on the configured port",
  { timeout: 20000 },
  async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-stop-other-"));
    const port = await freePort();
    const other = await start(
      [
        "-e",
        "require('http').createServer((req,res)=>res.end('other')).listen(Number(process.env.PORT),'127.0.0.1')",
      ],
      port,
      dir,
    );
    try {
      await assert.rejects(
        run("npm", ["stop", "--silent"], { cwd: project, env: other.env }),
        (error: any) => {
          assert.match(error.stderr, /anderen Prozess/);
          return true;
        },
      );
      assert.equal(
        await (await fetch(`http://127.0.0.1:${port}/`)).text(),
        "other",
      );
    } finally {
      await other.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
