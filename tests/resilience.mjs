import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "./integration/client.mjs";
const docker = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const c = await new Client().login();
let stopped = false;
try {
  docker("stop", "worker");
  stopped = true;
  const p = await c.ok("/admin/products", "POST", {
    name: "Outbox recovery " + Date.now(),
    price_cents: 100,
    stock: 1,
  });
  const order = await c.ok(
    "/checkout",
    "POST",
    { items: [{ productId: p.id, quantity: 1 }] },
    { "Idempotency-Key": randomUUID() },
  );
  assert.equal(order.status, "confirmed");
  docker("start", "worker");
  stopped = false;
  let notice;
  for (let i = 0; i < 60; i++) {
    notice = (await c.ok("/admin/operations")).notifications.find(
      (n) => n.order_id === order.id,
    );
    if (notice) break;
    await sleep(500);
  }
  assert.ok(notice, "Worker recovers pending outbox");
  assert.match(notice.event_id, /^[0-9a-f-]{36}$/);
  docker(
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "app",
    "-d",
    "forma_store",
    "-c",
    `UPDATE outbox SET published_at=NULL WHERE id='${notice.event_id}'`,
  );
  await sleep(3000);
  assert.equal(
    (await c.ok("/admin/operations")).notifications.filter(
      (n) => n.order_id === order.id,
    ).length,
    1,
  );
  console.log("PASS worker outage, durable outbox and duplicate delivery");
} finally {
  if (stopped) docker("start", "worker");
}
