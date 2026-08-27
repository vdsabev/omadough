#!/usr/bin/env node
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { loadLib } from "./loadLib.mjs"

const DS = loadLib("./DoughState.js", [
  "defaultState", "parseState", "persistFields",
  "canFeed", "canStart", "canBake", "isDead",
  "feed", "startJar", "bake",
  "statusText", "aliveText", "feedButtonText",
  "health", "displayBubbles", "displayDarkness"
])

const STATE_DIR = join(homedir(), ".config", "omadough")
const STATE_PATH = join(STATE_DIR, "state.json")

function usage() {
  return `omadough — feed your starter from the console

Usage:
  omadough              show status
  omadough status       show status
  omadough feed         feed (once per day)
  omadough start        start a new jar (empty or dead)
  omadough bake         bake a loaf if the starter is ready
  omadough help         this text

State: ${STATE_PATH}
The bar widget reloads that file when it changes.
`
}

const MAX_STATE_BYTES = 1 << 20

// O_NONBLOCK so a FIFO at this path fails fast instead of blocking the open.
function loadState() {
  let fd
  try {
    fd = openSync(STATE_PATH, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (e) {
    if (e && e.code === "ENOENT") return DS.defaultState()
    if (e && e.code === "ELOOP") fail(`Refusing to follow a symlink at ${STATE_PATH}`)
    throw e
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile())
      fail(`Not a regular file: ${STATE_PATH}`)
    if (st.size > MAX_STATE_BYTES)
      fail(`State file is too large (${st.size} bytes): ${STATE_PATH}`)
    return DS.parseState(readFileSync(fd, "utf8"))
  } finally {
    closeSync(fd)
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true })
  const tmp = `${STATE_PATH}.${process.pid}.tmp`
  const text = JSON.stringify(DS.persistFields(state), null, 2) + "\n"
  // O_EXCL: never write through a name that already exists at the temp path.
  writeFileSync(tmp, text, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW })
  try {
    renameSync(tmp, STATE_PATH)
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    throw e
  }
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
      `volume ${pct(state.volume)}  bubbles ${pct(DS.displayBubbles(state))}  health ${pct(DS.health(state))}`
    )
    if (Array.isArray(state.loaves) && state.loaves.length)
      lines.push(`${state.loaves.length} ${state.loaves.length === 1 ? "loaf" : "loaves"} baked`)
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

if (cmd === "bake") {
  if (!DS.canBake(state))
    fail("Not ready to bake (need volume and enough bubbles).")
  state = DS.bake(state)
  saveState(state)
  process.stdout.write("Baked.\n" + formatStatus(state) + "\n")
  process.exit(0)
}

fail("Unknown command: " + cmd + "\n\n" + usage())
