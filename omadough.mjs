#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { loadLib } from "./loadLib.mjs"

const DS = loadLib("./DoughState.js", [
  "defaultState", "parseState", "persistFields",
  "canFeed", "canStart", "canBake", "canPour", "isDead",
  "feed", "startJar", "bake", "pour",
  "statusText", "aliveText", "feedButtonText",
  "health", "displayBubbles", "hooch", "jarFull", "loafSummary"
])

const STATE_PATH = join(homedir(), ".config", "omadough", "state.json")
const HELPER = fileURLToPath(new URL("./bin/omadough-state", import.meta.url))

function usage() {
  return `omadough — feed your starter from the console

Usage:
  omadough              show status
  omadough status       show status
  omadough feed         feed (once per day)
  omadough start        start a new jar (empty or dead)
  omadough remove       remove the hooch to make room
  omadough bake         bake a loaf if the starter is ready
  omadough help         this text

State: ${STATE_PATH}
The bar widget re-reads that file when its popup opens, and hourly.
`
}

// The helper is the one place that touches the state file; see bin/omadough-state
// for the guarantees and the exit codes.
function helper(args, input) {
  // maxBuffer is left at its 1 MiB default, which the helper's own ceiling can
  // reach but not exceed; ENOBUFS needs more than the limit, not the limit.
  const result = spawnSync("python3", [HELPER, ...args, STATE_PATH], { input, encoding: "utf8" })
  if (result.error) fail(`cannot run ${HELPER}: ${result.error.message}`)
  return result
}

function loadState() {
  const result = helper(["read"])
  if (result.status === 10) return DS.defaultState()
  if (result.status !== 0) fail(result.stderr.trim() || `cannot read ${STATE_PATH}`)
  return DS.parseState(result.stdout)
}

function saveState(state) {
  const result = helper(["write"], JSON.stringify(DS.persistFields(state), null, 2) + "\n")
  if (result.status !== 0) fail(result.stderr.trim() || `cannot write ${STATE_PATH}`)
}

function pct(n) {
  return Math.round(n * 100) + "%"
}

function formatStatus(state) {
  const lines = [DS.statusText(state)]
  const age = DS.aliveText(state)
  if (age) lines.push(`started ${age}`)
  if (state.volume > 0) {
    lines.push(
      `volume ${pct(state.volume)}  hooch ${pct(DS.hooch(state))}  bubbles ${pct(DS.displayBubbles(state))}  health ${pct(DS.health(state))}`
    )
    if (Array.isArray(state.loaves) && state.loaves.length)
      lines.push(`baked ${DS.loafSummary(state)}`)
  }
  return lines.join("\n")
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

const cmd = (process.argv[2] || "status").toLowerCase()
if (["-h", "--help", "help"].includes(cmd)) {
  process.stdout.write(usage())
  process.exit(0)
}

let state = loadState()

if (cmd === "status") {
  process.stdout.write(formatStatus(state) + "\n")
  process.exit(0)
}

if (cmd === "feed") {
  if (DS.canStart(state) || state.volume === 0)
    fail("Jar is empty. Run: omadough start")
  if (DS.isDead(state))
    fail("Starter is dead. Run: omadough start")
  if (DS.jarFull(state))
    fail("No room — the jar is full of hooch. Run: omadough remove")
  if (!DS.canFeed(state))
    fail(DS.feedButtonText(state))
  state = DS.feed(state)
  saveState(state)
  process.stdout.write("Fed.\n" + formatStatus(state) + "\n")
  process.exit(0)
}

if (cmd === "start") {
  if (!DS.canStart(state) && !DS.isDead(state))
    fail("Jar already has a starter. Feed or bake instead.")
  state = DS.startJar(state)
  saveState(state)
  process.stdout.write("Started.\n" + formatStatus(state) + "\n")
  process.exit(0)
}

if (cmd === "remove" || cmd === "pour") {
  if (!DS.canPour(state))
    fail("No hooch to remove.")
  state = DS.pour(state)
  saveState(state)
  process.stdout.write("Removed the hooch.\n" + formatStatus(state) + "\n")
  process.exit(0)
}

if (cmd === "bake") {
  if (!DS.canBake(state))
    fail("Not ready to bake (need volume and enough bubbles).")
  state = DS.bake(state)
  saveState(state)
  process.stdout.write("Baked.\n" + formatStatus(state) + "\n")
  process.exit(0)
}

fail("Unknown command: " + cmd + "\n\n" + usage())
