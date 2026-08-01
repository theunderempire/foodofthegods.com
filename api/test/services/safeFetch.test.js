import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, safeFetch, resolver } from "../../src/services/safeFetch.js";

const originalFetch = globalThis.fetch;

// Resolve every hostname to a public address unless a test says otherwise, so
// these tests never touch the network.
beforeEach(() => {
  resolver.lookup = async () => [{ address: "93.184.216.34" }];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("assertPublicUrl", () => {
  test("allows a normal public https URL", async () => {
    await assert.doesNotReject(() => assertPublicUrl("https://example.com/recipe"));
  });

  test("allows a public http URL", async () => {
    await assert.doesNotReject(() => assertPublicUrl("http://example.com/img.jpg"));
  });

  for (const scheme of ["file:///etc/passwd", "gopher://example.com", "data:text/html,hi"]) {
    test(`rejects the ${scheme.split(":")[0]} scheme`, async () => {
      await assert.rejects(() => assertPublicUrl(scheme), /Unsupported URL scheme/);
    });
  }

  test("rejects a malformed URL", async () => {
    await assert.rejects(() => assertPublicUrl("not a url"), /Invalid URL/);
  });

  // The finding that motivated this guard: reaching cloud instance metadata.
  test("rejects the cloud metadata address", async () => {
    await assert.rejects(
      () => assertPublicUrl("http://169.254.169.254/latest/meta-data/"),
      /private or reserved/,
    );
  });

  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.1", "192.168.1.1"]) {
    test(`rejects the private literal ${ip}`, async () => {
      await assert.rejects(() => assertPublicUrl(`http://${ip}/`), /private or reserved/);
    });
  }

  test("allows 172.32.x.x, which is outside the private range", async () => {
    await assert.doesNotReject(() => assertPublicUrl("http://172.32.0.1/"));
  });

  test("rejects IPv6 loopback and unique-local literals", async () => {
    await assert.rejects(() => assertPublicUrl("http://[::1]/"), /private or reserved/);
    await assert.rejects(() => assertPublicUrl("http://[fd00::1]/"), /private or reserved/);
  });

  test("rejects an IPv4-mapped IPv6 private address", async () => {
    await assert.rejects(() => assertPublicUrl("http://[::ffff:10.0.0.1]/"), /private or reserved/);
  });

  // A hostname the attacker controls can point anywhere, so the guard has to
  // check the resolved address rather than trusting the name.
  test("rejects a public-looking hostname that resolves to a private address", async () => {
    resolver.lookup = async () => [{ address: "169.254.169.254" }];
    await assert.rejects(() => assertPublicUrl("https://evil.example/"), /private or reserved/);
  });

  test("rejects when any resolved address is private, not just the first", async () => {
    resolver.lookup = async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }];
    await assert.rejects(() => assertPublicUrl("https://evil.example/"), /private or reserved/);
  });

  test("rejects a hostname that cannot be resolved", async () => {
    resolver.lookup = async () => {
      throw new Error("ENOTFOUND");
    };
    await assert.rejects(() => assertPublicUrl("https://nope.example/"), /Could not resolve host/);
  });

  test("rejects localhost by resolved address", async () => {
    resolver.lookup = async () => [{ address: "127.0.0.1" }];
    await assert.rejects(() => assertPublicUrl("http://localhost:27017/"), /private or reserved/);
  });
});

describe("safeFetch", () => {
  test("returns the response for an allowed URL", async () => {
    globalThis.fetch = async () => ({ status: 200, headers: { get: () => null }, ok: true });

    const response = await safeFetch("https://example.com/img.jpg");

    assert.equal(response.status, 200);
  });

  test("never calls fetch when the URL is blocked", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return { status: 200, headers: { get: () => null } };
    };

    await assert.rejects(() => safeFetch("http://169.254.169.254/"), /private or reserved/);
    assert.equal(called, false);
  });

  // A single up-front check is not enough: a public URL can redirect inward.
  test("re-validates each redirect hop and blocks a redirect to a private address", async () => {
    const requested = [];
    globalThis.fetch = async (url) => {
      requested.push(url);
      return {
        status: 302,
        headers: { get: (name) => (name === "location" ? "http://169.254.169.254/" : null) },
      };
    };

    await assert.rejects(() => safeFetch("https://example.com/start"), /private or reserved/);
    assert.deepEqual(requested, ["https://example.com/start"], "must not follow the inward hop");
  });

  test("follows an allowed redirect chain to the final response", async () => {
    let hop = 0;
    globalThis.fetch = async () => {
      hop += 1;
      if (hop === 1) {
        return {
          status: 301,
          headers: { get: (name) => (name === "location" ? "https://example.com/final" : null) },
        };
      }
      return { status: 200, headers: { get: () => null } };
    };

    const response = await safeFetch("https://example.com/start");

    assert.equal(response.status, 200);
    assert.equal(hop, 2);
  });

  test("gives up after too many redirects", async () => {
    globalThis.fetch = async () => ({
      status: 302,
      headers: { get: (name) => (name === "location" ? "https://example.com/next" : null) },
    });

    await assert.rejects(() => safeFetch("https://example.com/start"), /Too many redirects/);
  });

  test("resolves a relative redirect against the current URL", async () => {
    const requested = [];
    globalThis.fetch = async (url) => {
      requested.push(url);
      if (requested.length === 1) {
        return {
          status: 302,
          headers: { get: (name) => (name === "location" ? "/moved" : null) },
        };
      }
      return { status: 200, headers: { get: () => null } };
    };

    await safeFetch("https://example.com/deep/path");

    assert.equal(requested[1], "https://example.com/moved");
  });
});
