"use strict";
/* Are the installed dependencies the ones package-lock.json names? Compared by content: each locked package's installed
   version. (Until 0.13.1 setup compared file dates, so a copy unpacked next to dependencies installed earlier was told
   they were not installed, and an update whose archive carried an older date than the last install kept stale ones.)
   Optional packages (for other platforms) may be absent. Returns {ok, total, stale: [name], why}. */
const fs = require("fs"), path = require("path");
function lockedDependencies(root) {
  const lock = path.join(root, "package-lock.json");
  if (!fs.existsSync(lock)) return { ok: false, total: 0, stale: [], why: "package-lock.json is missing; this copy of the project is incomplete." };
  let packages;
  try { packages = JSON.parse(fs.readFileSync(lock, "utf8")).packages; } catch (e) { packages = null; }
  if (!packages || typeof packages !== "object") return { ok: false, total: 0, stale: [], why: "package-lock.json could not be read; this copy of the project is incomplete." };
  const names = Object.keys(packages).filter(k => k.startsWith("node_modules/") && !packages[k].optional && !packages[k].link);
  const installed = k => { try { return JSON.parse(fs.readFileSync(path.join(root, k, "package.json"), "utf8")).version; } catch (e) { return null; } };
  const stale = names.filter(k => installed(k) !== packages[k].version).map(k => k.replace(/^(?:.*\/)?node_modules\//, ""));
  return { ok: !stale.length, total: names.length, stale, why: stale.length ? (stale.length === names.length ? "the dependencies are not installed" : stale.length + " of " + names.length + " dependencies are missing or differ from package-lock.json (" + stale.slice(0, 3).join(", ") + (stale.length > 3 ? ", …" : "") + ")") : "" };
}
module.exports = { lockedDependencies };
