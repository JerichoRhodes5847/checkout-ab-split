import test from "node:test";
import assert from "node:assert/strict";
import { assignVariant } from "./checkout_service.ts";

test("the same shopper stays in the same half of the experiment", () => {
  const first = assignVariant("shopper-123");
  assert.equal(first, assignVariant("shopper-123"));
  assert.ok(first === "control" || first === "treatment");
});
