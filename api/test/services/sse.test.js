import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { subscribe, unsubscribe, broadcast } from "../../src/services/sse.js";

// The module keeps a single process-wide Map<userId, Set<res>>, so every test
// uses its own userId and unsubscribes what it subscribed to stay independent.
function makeFakeRes() {
  const res = { writes: [] };
  res.write = (chunk) => {
    res.writes.push(chunk);
    return true;
  };
  return res;
}

function sseFrame(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe("sse", () => {
  test("a subscribed connection receives broadcast payloads as SSE frames", () => {
    const res = makeFakeRes();
    subscribe("user-basic", res);
    try {
      broadcast("user-basic", { type: "recipe-updated", id: "r1" });

      assert.deepEqual(res.writes, [sseFrame({ type: "recipe-updated", id: "r1" })]);
    } finally {
      unsubscribe("user-basic", res);
    }
  });

  test("an unsubscribed connection receives nothing", () => {
    const res = makeFakeRes();
    subscribe("user-unsub", res);
    unsubscribe("user-unsub", res);

    broadcast("user-unsub", { type: "ping" });

    assert.deepEqual(res.writes, []);
  });

  test("unsubscribing an unknown user or connection is a no-op", () => {
    const res = makeFakeRes();
    assert.doesNotThrow(() => unsubscribe("user-never-subscribed", res));

    const subscribed = makeFakeRes();
    subscribe("user-partial-unsub", subscribed);
    try {
      // Removing a connection that was never added must not disturb the others
      unsubscribe("user-partial-unsub", makeFakeRes());
      broadcast("user-partial-unsub", { type: "still-here" });

      assert.deepEqual(subscribed.writes, [sseFrame({ type: "still-here" })]);
    } finally {
      unsubscribe("user-partial-unsub", subscribed);
    }
  });

  test("broadcasting to a user with no subscribers is a no-op", () => {
    assert.doesNotThrow(() => broadcast("user-with-no-subscribers", { type: "ping" }));
  });

  test("every connection for the same user receives the broadcast", () => {
    const first = makeFakeRes();
    const second = makeFakeRes();
    const third = makeFakeRes();
    subscribe("user-multi", first);
    subscribe("user-multi", second);
    subscribe("user-multi", third);
    try {
      broadcast("user-multi", { type: "fanout" });

      const expected = [sseFrame({ type: "fanout" })];
      assert.deepEqual(first.writes, expected);
      assert.deepEqual(second.writes, expected);
      assert.deepEqual(third.writes, expected);
    } finally {
      unsubscribe("user-multi", first);
      unsubscribe("user-multi", second);
      unsubscribe("user-multi", third);
    }
  });

  test("subscribing the same connection twice still delivers only one frame", () => {
    const res = makeFakeRes();
    subscribe("user-dedupe", res);
    subscribe("user-dedupe", res);
    try {
      broadcast("user-dedupe", { type: "once" });

      assert.deepEqual(
        res.writes,
        [sseFrame({ type: "once" })],
        "connections are held in a Set, so a repeat subscribe must not duplicate delivery",
      );
    } finally {
      unsubscribe("user-dedupe", res);
    }
  });

  test("connections belonging to a different user do not receive the broadcast", () => {
    const mine = makeFakeRes();
    const theirs = makeFakeRes();
    subscribe("user-a", mine);
    subscribe("user-b", theirs);
    try {
      broadcast("user-a", { type: "private", secret: "for-a-only" });

      assert.equal(mine.writes.length, 1);
      assert.deepEqual(theirs.writes, [], "must not leak another user's events");
    } finally {
      unsubscribe("user-a", mine);
      unsubscribe("user-b", theirs);
    }
  });

  // broadcast is called from request handlers that have already persisted a
  // change, so a write to one torn-down socket must not become a failed mutation.
  test("survives a torn-down connection and still delivers to the rest", () => {
    const dead = {
      write: () => {
        throw new Error("write after end");
      },
    };
    const healthy = makeFakeRes();
    subscribe("user-torn-down", dead);
    subscribe("user-torn-down", healthy);
    try {
      const result = broadcast("user-torn-down", { type: "update" });

      assert.equal(result.delivered, 1);
      assert.equal(result.dropped, 1);
      assert.equal(
        healthy.writes.length,
        1,
        "a connection queued behind a dead one must still receive the event",
      );
    } finally {
      unsubscribe("user-torn-down", dead);
      unsubscribe("user-torn-down", healthy);
    }
  });

  // A leaked connection would otherwise fail on every future broadcast.
  test("prunes a dead connection so it is not retried", () => {
    let attempts = 0;
    const dead = {
      write: () => {
        attempts += 1;
        throw new Error("write after end");
      },
    };
    subscribe("user-prune", dead);
    try {
      broadcast("user-prune", { type: "first" });
      broadcast("user-prune", { type: "second" });

      assert.equal(attempts, 1, "the dead connection should be dropped after the first failure");
    } finally {
      unsubscribe("user-prune", dead);
    }
  });

  test("reports delivery counts for a healthy broadcast", () => {
    const one = makeFakeRes();
    const two = makeFakeRes();
    subscribe("user-counts", one);
    subscribe("user-counts", two);
    try {
      assert.deepEqual(broadcast("user-counts", { type: "update" }), { delivered: 2, dropped: 0 });
    } finally {
      unsubscribe("user-counts", one);
      unsubscribe("user-counts", two);
    }
  });

  test("reports zero delivery when the user has no subscribers", () => {
    assert.deepEqual(broadcast("nobody-home", { type: "update" }), { delivered: 0, dropped: 0 });
  });
});
