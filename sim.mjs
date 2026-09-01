#!/usr/bin/env node
// Terminal harness for DoughState.js and JarSprite.js. It draws the same jar the
// bar widget does, on a clock you control.
import { loadLib } from "./loadLib.mjs"

// DoughState reads the wall clock directly, so time travel means shadowing the
// global it resolves at call time.
const RealDate = Date
let skewMs = 0
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + skewMs)
    else super(...args)
  }
  static now() {
    return RealDate.now() + skewMs
  }
}

const DS = loadLib("./DoughState.js", [
  "defaultState", "startJar", "feed", "bake", "writeHealth", "clamp",
  "canFeed", "canBake", "canStart", "canPour", "pour", "isDead", "fedToday", "inFeedWindow",
  "health", "healthBand", "lifecycle", "feedCycle", "displayBubbles",
  "displayDarkness", "hooch", "jarFull", "hoursOverdue", "daysSince", "loafSummary",
  "minutesUntilFeed", "reminderDue", "setReminders", "feedQuality",
  "statusText", "nextFeedHint", "ripenessLabel", "doughColorComponents",
  "VOLUME_PER_FEED", "DEVELOPMENT_DAYS"
])

const JS = loadLib("./JarSprite.js", [
  "COLS", "ROWS", "geometry", "body", "newFizz", "stepFizz", "gasCells", "fizzColor"
])

const RIM = { r: 1, g: 225 / 255, b: 77 / 255 }
// The widget is transparent behind the dough; a terminal has nothing to blend
// the hooch against, so pick a backdrop and composite here.
const BACKDROP = [22, 22, 29]

function toBytes(cell) {
  if (!cell || cell.a === 0) return null
  const a = cell.a === undefined ? 1 : cell.a
  return [cell.r, cell.g, cell.b].map((c, i) => Math.round(c * 255 * a + BACKDROP[i] * (1 - a)))
}

function geomOf(state) {
  return JS.geometry(state.volume, DS.displayBubbles(state), DS.hooch(state))
}

// QML overlays the fizz with extra Rectangles; a terminal cell holds one colour,
// so flatten the layers before drawing.
function raster(state, fizz) {
  const geom = geomOf(state)
  const dough = DS.doughColorComponents(state)
  const grid = JS.body(geom, dough, RIM).map((row) => row.map(toBytes))
  if (!fizz) return grid
  const fizzRgb = toBytes(JS.fizzColor(dough))
  for (const [col, row] of fizz.bubbles) grid[row][col] = fizzRgb
  for (const [col, row] of JS.gasCells(fizz, geom)) grid[row][col] = fizzRgb
  return grid
}

// A half-block splits one terminal line into two rows, each about as tall as a
// character is wide. So a cell drawn `zoom` characters wide needs `zoom` of them
// to come out square.
const ZOOM = 2

function toLines(grid, zoom) {
  const halfRows = []
  for (const row of grid)
    for (let i = 0; i < zoom; i++) halfRows.push(row)

  const lines = []
  for (let r = 0; r < halfRows.length; r += 2) {
    let out = ""
    for (let c = 0; c < JS.COLS; c++) {
      const top = halfRows[r][c]
      const bot = halfRows[r + 1][c]
      const glyph = (top ? "▀" : bot ? "▄" : " ").repeat(zoom)
      if (!top && !bot) out += glyph
      else if (top && bot) out += `\x1b[38;2;${top.join(";")}m\x1b[48;2;${bot.join(";")}m${glyph}\x1b[0m`
      else if (top) out += `\x1b[38;2;${top.join(";")}m${glyph}\x1b[0m`
      else out += `\x1b[38;2;${bot.join(";")}m${glyph}\x1b[0m`
    }
    lines.push(out)
  }
  return lines
}

function render(state, fizz, zoom = ZOOM) {
  return toLines(raster(state, fizz), zoom)
}

// ── State readouts ────────────────────────────────────────────────────────────

function pct(n) {
  return String(Math.round(n * 100)).padStart(3) + "%"
}

function readout(state) {
  const geom = geomOf(state)
  return [
    `lifecycle  ${DS.lifecycle(state)}`,
    `feed cycle ${DS.feedCycle(state)}`,
    `health     ${DS.healthBand(state)}`,
    "",
    `volume     ${pct(state.volume)}   fill ${geom.fillRows / 2}/7`,
    `health     ${pct(DS.health(state))}`,
    `bubbles    ${pct(geom.bubbles)}   cells ${geom.bubbleCount}`,
    `hooch      ${pct(DS.hooch(state))}   rows ${geom.hoochRows}`,
    `ripeness   ${DS.ripenessLabel(state) || "7/7"}  day ${DS.daysSince(state.created)}`,
    `loaves     ${DS.loafSummary(state)}`,
    `reminder   ${state.remindersEnabled === false ? "off" : DS.reminderDue(state) ? "due" : "in " + DS.minutesUntilFeed(state) + "m"}   quality ${DS.feedQuality(state)}`,
    "",
    `feed ${DS.canFeed(state) ? "yes" : "no "}   bake ${DS.canBake(state) ? "yes" : "no "}   pour ${DS.canPour(state) ? "yes" : "no "}   start ${DS.canStart(state) ? "yes" : "no "}`,
    "",
    DS.statusText(state),
    DS.nextFeedHint(state)
  ]
}

function visibleWidth(line) {
  return line.replace(/\x1b\[[0-9;]*m/g, "").length
}

function sideBySide(left, right, gap = 4) {
  const n = Math.max(left.length, right.length)
  const pad = " ".repeat(left.reduce((w, l) => Math.max(w, visibleWidth(l)), 0))
  const out = []
  for (let i = 0; i < n; i++) out.push((left[i] || pad) + " ".repeat(gap) + (right[i] || ""))
  return out
}

function ripeState(mutate) {
  const s = DS.startJar(DS.defaultState())
  s.created = new Date(Date.now() - DS.DEVELOPMENT_DAYS * 86400000).toISOString()
  mutate(s)
  return s
}

// ── Grid mode: the reachable space, laid out ──────────────────────────────────

function gridMode() {
  const rows = []
  for (let hStep = 6; hStep >= 0; hStep--) {
    const jars = []
    for (let vStep = 1; vStep <= 7; vStep++) {
      const s = ripeState((s) => {
        s.volume = vStep / 7
        DS.writeHealth(s, hStep / 6)
      })
      jars.push(render(s, JS.newFizz(geomOf(s)), 1))
    }
    rows.push(`health ${pct(hStep / 6)}`, ...jars.reduce((acc, j) => sideBySide(acc, j, 1)), "")
  }
  process.stdout.write("volume 1/7 → 7/7 across, health 100% → 0% down\n\n")
  process.stdout.write(rows.join("\n") + "\n")
}

// ── Ascii mode: colour-free, for diffing ──────────────────────────────────────

function asciiMode() {
  const cases = [
    ["empty", (s) => { s.volume = 0 }],
    ["fresh start", () => {}],
    ["half volume, healthy", (s) => { s.volume = 0.5 }],
    ["full volume, healthy", (s) => { s.volume = 1 }],
    ["full volume, half health", (s) => { s.volume = 1; DS.writeHealth(s, 0.5) }],
    ["full volume, dying", (s) => { s.volume = 1; DS.writeHealth(s, 0.05) }]
  ]
  for (const [label, mutate] of cases) {
    const s = ripeState(mutate)
    const fizz = JS.newFizz(geomOf(s))
    const dough = toBytes(DS.doughColorComponents(s))
    const rim = toBytes({ ...RIM, a: 1 })
    const fizzRgb = toBytes(JS.fizzColor(DS.doughColorComponents(s)))
    const art = raster(s, fizz).map((row) => row.map((c) => {
      if (!c) return " "
      const k = String(c)
      if (k === String(rim)) return "L"
      if (k === String(fizzRgb)) return "o"
      if (k === String(dough)) return "."
      if (c[0] === Math.round(rim[0] * 0.75)) return "G"
      return "#"
    }).join("")).join("\n")
    process.stdout.write(`${label}\n${art}\n\n`)
  }
}

// ── Interactive mode ──────────────────────────────────────────────────────────

const HELP = [
  "s start   f feed   b bake   p remove hooch   m reminder   r reset",
  "n/N day ±   t/T hour ±",
  "h/H health ±   v/V volume ±",
  "space pause   q quit"
]

function interactive() {
  let state = DS.startJar(DS.defaultState())
  let fizz = JS.newFizz(geomOf(state))
  let paused = false

  const draw = () => {
    const body = sideBySide(render(state, fizz), readout(state))
    process.stdout.write("\x1b[H\x1b[2J" + body.join("\n") + "\n\n" + HELP.join("\n") + "\n")
  }

  const bump = (field, delta) => {
    if (field === "health") DS.writeHealth(state, DS.clamp(DS.health(state) + delta, 0, 1))
    else state.volume = DS.clamp(state.volume + delta, 0, 1)
  }

  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (key) => {
    switch (key) {
      case "q": case "\u0003": process.stdout.write("\x1b[?25h"); process.exit(0)
      case "s": state = DS.startJar(state); break
      case "f": state = DS.feed(state); break
      case "b": state = DS.bake(state); break
      case "p": state = DS.pour(state); break
      case "m": state = DS.setReminders(state, state.remindersEnabled === false); break
      case "r": state = DS.startJar(DS.defaultState()); skewMs = 0; break
      case "n": skewMs += 86400000; break
      case "N": skewMs -= 86400000; break
      case "t": skewMs += 3600000; break
      case "T": skewMs -= 3600000; break
      case "h": bump("health", -0.05); break
      case "H": bump("health", 0.05); break
      case "v": bump("volume", -DS.VOLUME_PER_FEED); break
      case "V": bump("volume", DS.VOLUME_PER_FEED); break
      case " ": paused = !paused; break
      default: return
    }
    draw()
  })

  process.stdout.write("\x1b[?25l")
  setInterval(() => {
    if (paused) return
    JS.stepFizz(fizz, geomOf(state))
    draw()
  }, 1000)
  draw()
}

const mode = process.argv[2] || "run"
if (mode === "grid") gridMode()
else if (mode === "ascii") asciiMode()
else if (mode === "run") interactive()
else {
  process.stdout.write("Usage: node sim.mjs [run|grid|ascii]\n")
  process.exit(1)
}
