import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { createAdmin } from "../server/admin.ts";
import { createSite } from "../src/model.ts";

test("SQLite-Admin: kurzer Erstlogin, Neustart, Passwortwechsel und kein Überschreiben", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwerk-admin-"));
  const initial = await Store.open(dir);
  const site = createSite();
  site.name = "Vorhandener Entwurf";
  initial.save(site, 0);
  createAdmin(initial, { username: "admin", password: "test123" });
  assert.equal(initial.draft()!.name, site.name);
  const savedAdmin = initial.get("admin");
  assert.throws(
    () => createAdmin(initial, { username: "other", password: "replace" }),
    /bereits vorhanden/,
  );
  assert.equal(initial.get("admin"), savedAdmin);
  assert.doesNotMatch(
    readFileSync(path.join(dir, "klarwerk.sqlite")).toString(),
    /test123/,
  );
  initial.close();
  const { app, store } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = (route: string, body: object, cookie = "") =>
    fetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await (await fetch(base + "/auth")).json()).setup, false);
    assert.equal((await fetch(base + "/draft")).status, 401);
    assert.equal(
      (await post("/login", { username: "admin", password: "wrong" })).status,
      401,
    );
    const login = await post("/login", {
      username: "admin",
      password: "test123",
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).mustChangePassword, true);
    let cookie = login.headers.get("set-cookie")!.split(";")[0];
    const initialCookie = cookie;
    const pendingAuth = await (
      await fetch(base + "/auth", { headers: { Cookie: cookie } })
    ).json();
    assert.equal(pendingAuth.mustChangePassword, true);
    const draft = await fetch(base + "/draft", { headers: { Cookie: cookie } });
    assert.equal(draft.status, 403);
    assert.equal((await draft.json()).code, "password_change_required");
    assert.equal((await post("/publish", {}, cookie)).status, 403);
    assert.equal(
      (await post("/login", { username: "admin", password: "test123" })).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/password",
          { current: "test123", password: "short" },
          cookie,
        )
      ).status,
      400,
    );
    const changed = await post(
      "/password",
      { current: "test123", password: "a-new-long-password" },
      cookie,
    );
    assert.equal(changed.status, 200);
    cookie = changed.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await fetch(base + "/draft", { headers: { Cookie: initialCookie } }))
        .status,
      401,
    );
    const unlocked = await fetch(base + "/draft", {
      headers: { Cookie: cookie },
    });
    assert.equal(unlocked.status, 200);
    assert.equal((await unlocked.json()).site.name, site.name);
    assert.equal(JSON.parse(store.get("admin")!).mustChangePassword, false);
    assert.equal(
      (
        await post(
          "/password",
          { current: "a-new-long-password", password: "a-new-long-password" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await post("/login", { username: "admin", password: "test123" })).status,
      401,
    );
    assert.equal(
      (
        await post("/login", {
          username: "admin",
          password: "a-new-long-password",
        })
      ).status,
      200,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Adminvorbelegung erzeugt einen unveröffentlichten Entwurf und zufällige Salze", async () => {
  const dirs = [0, 1].map(() =>
    mkdtempSync(path.join(tmpdir(), "klarwerk-admin-seed-")),
  );
  const stores = await Promise.all(dirs.map((dir) => Store.open(dir)));
  try {
    for (const store of stores) {
      createAdmin(store, { username: "admin", password: "test123" });
      assert.ok(store.draft());
      assert.equal(store.get("revision"), "1");
      assert.equal(store.publicSite(), undefined);
    }
    const [a, b] = stores.map((store) => JSON.parse(store.get("admin")!));
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
  } finally {
    stores.forEach((store) => store.close());
    dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  }
});
