import "./env.ts";
import path from "node:path";
import { createApp } from "./app.ts";
const { app, store, setupCode } = await createApp(
  path.resolve(process.env.DATA_DIR || "data"),
);
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4317);
const server = app.listen(port, host, () => {
  console.log(`Klarwarg API & Website: http://${host}:${port} · Admin: /admin`);
  // Lokal geht die Einrichtung ohne Code; über einen Proxy oder eine Domain braucht sie diesen.
  if (!store.get("admin"))
    console.log(`Einrichtungscode für den Adminzugang: ${setupCode}`);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
