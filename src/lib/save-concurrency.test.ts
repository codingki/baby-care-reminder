import assert from "node:assert/strict";
import { createSaveTracker } from "./save-concurrency.ts";

const tracker = createSaveTracker((scope) => {
  refreshes.push(scope);
});
const refreshes: string[] = [];
const order: string[] = [];

const scope = "log:family:baby";
tracker.add(scope);
tracker.add(scope);
tracker.add(scope);

const failed = "fail-id";
const kept = ["a", "b"];
const rows = new Map<string, string>([
  [kept[0], "feed"],
  [failed, "chiller"],
  [kept[1], "diaper"],
]);

await Promise.allSettled([
  tracker.after(kept[0], async () => {
    order.push(kept[0]);
  }),
  tracker.after(failed, async () => {
    order.push(failed);
    rows.delete(failed);
    throw new Error("save failed");
  }),
  tracker.after(kept[1], async () => {
    order.push(kept[1]);
  }),
]);

tracker.finish(scope);
tracker.finish(scope);
assert.equal(tracker.count(scope), 1);
assert.deepEqual(refreshes, []);
tracker.finish(scope);
assert.equal(tracker.count(scope), 0);
assert.deepEqual(refreshes, [scope]);
assert.deepEqual([...rows.keys()], kept);
assert.equal(rows.has(failed), false);

const retryId = failed;
rows.set(retryId, "chiller");
await tracker.after(retryId, async () => {
  order.push(`retry:${retryId}`);
});
assert.equal(rows.get(retryId), "chiller");
assert.equal(order.filter((item) => item === retryId || item.endsWith(retryId)).length, 2);
console.log("concurrent save tracker ok");
