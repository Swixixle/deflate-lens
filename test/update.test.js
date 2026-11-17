"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http"), { spawn, spawnSync } = require("node:child_process");

test("the one-command updater handles a folder with spaces, backs up old code and preserves local data, settings and git metadata", async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-update-")); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const current = path.join(tmp, "deflate-lens 3"), source = path.join(tmp, "archive", "deflate-lens-main");
  for (const root of [current, source]) {
    fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "deflate-lens" }));
    fs.mkdirSync(path.join(root, "data")); fs.mkdirSync(path.join(root, ".git")); fs.mkdirSync(path.join(root, "node_modules"));
  }
  fs.writeFileSync(path.join(current, "app.js"), "old code"); fs.writeFileSync(path.join(source, "app.js"), "new code");
  for (const name of [".env", "data/saved.json", ".git/HEAD", "node_modules/marker"]) {
    fs.writeFileSync(path.join(current, name), "keep exactly"); fs.writeFileSync(path.join(source, name), "must never replace");
  }
  const zip = path.join(tmp, "latest.zip"); const zipped = spawnSync("zip", ["-qr", zip, "deflate-lens-main"], { cwd: path.dirname(source) }); assert.equal(zipped.status, 0);
  const server = http.createServer((req, res) => { res.setHeader("Content-Type", "application/zip"); fs.createReadStream(zip).pipe(res); }); await new Promise(r => server.listen(0, "127.0.0.1", r)); t.after(() => new Promise(r => server.close(r)));
  const child = spawn("bash", [path.join(__dirname, "../scripts/update.sh")], { cwd: current, env: { ...process.env, DEFLATE_UPDATE_ARCHIVE: "http://127.0.0.1:" + server.address().port + "/latest.zip", DEFLATE_UPDATE_NO_LAUNCH: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", b => output += b); child.stderr.on("data", b => output += b);
  assert.equal(await new Promise(r => child.on("exit", r)), 0, output);
  assert.equal(fs.readFileSync(path.join(current, "app.js"), "utf8"), "new code");
  for (const name of [".env", "data/saved.json", ".git/HEAD", "node_modules/marker"]) assert.equal(fs.readFileSync(path.join(current, name), "utf8"), "keep exactly");
  const backup = fs.readdirSync(path.join(current, ".deflate-backups"))[0]; assert.ok(backup);
  const old = spawnSync("tar", ["-xOzf", path.join(current, ".deflate-backups", backup), "./app.js"], { encoding: "utf8" }); assert.equal(old.stdout, "old code");
  const list = spawnSync("tar", ["-tzf", path.join(current, ".deflate-backups", backup)], { encoding: "utf8" }); assert.ok(!list.stdout.includes(".env")); assert.ok(!list.stdout.includes("saved.json"));
});
