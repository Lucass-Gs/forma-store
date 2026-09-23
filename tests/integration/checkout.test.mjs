import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "./client.mjs";
import { randomUUID } from "node:crypto";
test("concurrent last-unit purchase, server price, idempotency and cancellation", async () => {
  const a = await new Client().login(),
    b = await new Client().login("bruno@example.test");
  const p = await a.ok("/admin/products", "POST", {
    name: "Concorrência " + Date.now(),
    price_cents: 1234,
    stock: 1,
  });
  assert.equal(
    (
      await b.request("/admin/products/" + p.id, "PATCH", {
        price_cents: 1,
        stock: 999,
      })
    ).status,
    403,
  );
  const payload = { items: [{ productId: p.id, quantity: 1 }], total_cents: 1 };
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.all([
    a.request("/checkout", "POST", payload, { "Idempotency-Key": keys[0] }),
    b.request("/checkout", "POST", payload, { "Idempotency-Key": keys[1] }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const index = results.findIndex((r) => r.status === 201),
    owner = index === 0 ? a : b,
    other = index === 0 ? b : a,
    order = results[index].value;
  assert.equal(order.total_cents, 1234);
  assert.equal(
    (
      await owner.ok("/checkout", "POST", payload, {
        "Idempotency-Key": keys[index],
      })
    ).id,
    order.id,
  );
  assert.equal(
    (
      await owner.request(
        "/checkout",
        "POST",
        { items: [{ productId: p.id, quantity: 2 }] },
        { "Idempotency-Key": keys[index] },
      )
    ).status,
    409,
  );
  assert.equal(
    (await other.request("/orders/" + order.id + "/cancel", "POST")).status,
    404,
  );
  await Promise.all([
    owner.ok("/orders/" + order.id + "/cancel", "POST"),
    owner.ok("/orders/" + order.id + "/cancel", "POST"),
  ]);
  assert.equal((await a.ok("/products/" + p.id)).stock, 1);
});
