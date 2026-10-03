# AGENTS.md — installing and running Deflate Lens for someone

These instructions are for an assistant that has a terminal on the person's computer (a connected coding or desktop
assistant). Reading this file in a browser gives no access to anyone's computer; the steps below only work where you
can run commands. Every command named here exists in this repository; nothing else is assumed.

The person's intent, in their words: *"Install and open Deflate Lens on this computer. Follow the repository setup
instructions, preserve any existing data and settings, and ask me only for anything you cannot obtain or configure
yourself."*

## What this is

A local web app (Node.js + Express, no build step, no database) that runs on `127.0.0.1` and stores everything as
JSON and text under `data/` inside the project folder. It ships with one read-only example run. Real analysis uses the
person's own Anthropic API key, which the page asks for once and writes to `.env`. Searching sources uses free public
APIs (Crossref, PubMed; OpenAlex with an optional key) and needs no key.

## Steps

1. **Inspect the environment.** `node --version` must be 18 or newer; `npm --version` must answer. If Node is missing
   or old, tell the person to install the LTS from https://nodejs.org (or use their package manager if they prefer:
   `brew install node` on a Mac with Homebrew). Do not install Node without asking; that is a system-level change.
2. **Get the code.** Either unzip the ZIP the person has, or run
   `git clone https://github.com/Swixixle/deflate-lens.git`. `cd` into the folder that contains `package.json`.
3. **Run the one setup command:** `npm run setup`
   - It checks Node and npm, runs `npm ci` from the lockfile only when dependencies are missing or stale, creates
     `.env` from `.env.example` only if `.env` does not exist, creates `data/` if needed, and prints what it found.
   - It never overwrites an existing `.env`, never touches `data/`, and never prints key values.
   - If it stops, its last line says why and what to do. Fix that and run it again; it is safe to repeat.
   - On a machine that must not install packages itself, run `npm run setup -- --no-install` and install the
     dependencies the way that host allows (`npm ci` in the project folder).
4. **Start and open:** `npm run launch`
   - Starts the server, waits until `GET /api/health` answers, prints the address actually in use, and opens the
     page with the platform opener (`open` on macOS, `xdg-open` on Linux, `start` on Windows) when one exists.
   - If a Deflate Lens server already answers on the port, it reuses it and opens the page; nothing new starts.
   - If the port is held by another program, it picks the next free port and prints that address.
   - It reports success only after the health check answers. A process that dies is reported as a failure with the
     reason. Stop with Ctrl+C. Use `npm run launch -- --no-open` to print the address without opening a browser,
     `npm run launch -- --port 4000` to choose a port, `npm start` to run without the launcher.
5. **Check health yourself** if you want to confirm: `curl -s http://127.0.0.1:3123/api/health` returns `{"ok":true,…}`
   with `ai` null (no key yet) or the model name, and `version`.
6. **Present the address** to the person. The supplied example (a Rogan–Peterson episode, 16 cards) opens without a key.

## The API key

Real analysis needs the person's Anthropic API key. Do not ask for it up front: the page asks for it once, the first
time real analysis is requested, and writes it to `.env` on this computer. If the person would rather give it to you,
put it in `.env` as `ANTHROPIC_API_KEY=sk-ant-…` (the file is created by setup; edit it in place, keep the other
lines) and restart the server. Never paste the key into a chat, a log, a commit, or a file other than `.env`. Never
set `DEFLATE_MOCK_AI=1` for the person; that produces placeholder output and is for tests.

## Repeat runs and updates

`npm run setup` and `npm run launch` are safe to repeat. A second setup leaves `.env`, saved runs, sources and
attribution decisions exactly as they were (the test suite checks this). After updating the code (`git pull` or a new
ZIP unpacked over the old folder), run `npm run setup` again; it reinstalls dependencies only if the lockfile changed.
Saved runs are parsed under the rules they were saved with, so an update never silently renumbers a run's turns.

## Where things are

- `data/runs/<id>/` — one folder per run: `run.json`, `transcript.txt`, `passages/*.json`, `summary.json`, `attachments/`.
- `data/runs/<id>/archive/` — passages replaced by a re-segment. `data/trash/` — runs deleted in the app. The app
  never removes files.
- `.env` — local settings, including the key. Mode 600 when the app writes it.
- Back up by copying `data/`. Restore by putting it back.

## Checks you can run

- `npm test` — 47 tests, no network, no key, about fifteen seconds.
- `npm run doctor` — prints what is configured without printing secrets.
- `npm run research-smoke` — hits the live Crossref and PubMed services for two example claims (needs network).
- `node scripts/ui-check.js` — optional headless-browser check; needs `npm install --no-save playwright && npx playwright install chromium` first.

## What not to do

- Do not run `npm install` to "upgrade"; `npm ci` from the lockfile is what setup does, deliberately.
- Do not delete or rewrite `data/` or `.env` to fix a problem; ask first. Both hold the person's work.
- Do not expose the server beyond localhost (`HOST=0.0.0.0`) unless the person asks and understands there is no login.
- Do not describe a link as "read" or a claim as "verified": the app itself does not, and its exports say what each status means.
