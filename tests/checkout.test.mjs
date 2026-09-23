import test from "node:test";
import assert from "node:assert/strict";
import { normalizeItems } from "../dist/domain.js";
test("duplicate lines are normalized and quantity limits cannot be bypassed", () => {
  const productId = "40000000-0000-4000-8000-000000000001";
  assert.deepEqual(
    normalizeItems({
      items: [
        { productId, quantity: 2 },
        { productId, quantity: 3 },
      ],
    }),
    [{ productId, quantity: 5 }],
  );
  assert.throws(() =>
    normalizeItems({
      items: [
        { productId, quantity: 20 },
        { productId, quantity: 1 },
      ],
    }),
  );
  assert.throws(() => normalizeItems({ items: [{ productId, quantity: -1 }] }));
});
