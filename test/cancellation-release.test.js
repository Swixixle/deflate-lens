"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");

test("stopping a browser model request aborts the provider request", { timeout: 8000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-cancel-"));
  let started, cancelled;
  const didStart = new Promise(resolve => { started = resolve; });
  const didCancel = new Promise(resolve => { cancelled = resolve; });
  const ai = {
    kind: "mock", model: "cancellation-test", mock: true,
    sample({ signal }) {
      started(signal.aborted);
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          cancelled(); reject(Object.assign(new Error("Stopped"), { code: "cancelled" }));
        }, { once: true });
      });
    },
  };
  const { app, ready } = createApp({ dataDir: dir, ai }); await ready;
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const controller = new AbortController();
  t.after(async () => { controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const request = fetch("http://127.0.0.1:" + server.address().port + "/api/sample", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "A delayed request" }), signal: controller.signal,
  }).catch(e => e);
  assert.equal(await didStart, false, "receiving the POST body must not abort the provider");
  controller.abort();
  await didCancel;
  assert.equal((await request).name, "AbortError");
});
