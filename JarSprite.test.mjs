import { test } from "node:test"
import assert from "node:assert/strict"
import { loadLib } from "./loadLib.mjs"

const JS = loadLib("./JarSprite.js", ["geometry"])

// Expected values come from the jar's declared geometry, not from the formulas:
// 18 rows, body occupies rows 3..16, and the fill area is 10 wide by 14 tall.
test("a full jar fills the body from row 3 to row 16", () => {
  const g = JS.geometry(1, 1, 0)
  assert.equal(g.fillRows, 14)
  assert.equal(g.fillTop, 3)
})

test("an empty jar has no fill and its top sits below the body", () => {
  const g = JS.geometry(0, 0, 0)
  assert.equal(g.fillRows, 0)
  assert.equal(g.fillTop, 17)
})

test("volume snaps to one of seven units", () => {
  assert.equal(JS.geometry(0.5, 1, 0).fillRows, 8)
  assert.equal(JS.geometry(0.1, 1, 0).fillRows, 2)
})

// Hooch is a quantity like the dough, so it adds to the fill rather than eating
// into it, and the jar looks as full as the numbers say it is.
test("hooch floats on the dough and raises the fill", () => {
  const g = JS.geometry(0.5, 0, 0.2)
  assert.equal(g.fillRows, 10)
  assert.equal(g.hoochRows, 2)
  assert.equal(g.doughTop, g.fillTop + 2)
})

test("a jar with no hooch is dough to the surface", () => {
  const g = JS.geometry(0.5, 0, 0)
  assert.equal(g.fillRows, 8)
  assert.equal(g.hoochRows, 0)
  assert.equal(g.doughTop, g.fillTop)
})

test("even a trace of hooch draws a row", () => {
  assert.equal(JS.geometry(0.5, 0, 0.02).hoochRows, 1)
})

test("hooch cannot claim more room than the jar has left", () => {
  const g = JS.geometry(1, 0, 0.5)
  assert.equal(g.fillRows, 14)
  assert.equal(g.hoochRows, 0)
})

test("bubbles fill at most one row of the ten-wide jar, and never show just one", () => {
  assert.equal(JS.geometry(1, 1, 0).bubbleCount, 10)
  assert.equal(JS.geometry(1, 0.05, 0.95).bubbleCount, 2)
  assert.equal(JS.geometry(1, 0, 1).bubbleCount, 0)
})

test("an empty jar shows no hooch and no bubbles", () => {
  const g = JS.geometry(0, 1, 0.4)
  assert.equal(g.hoochRows, 0)
  assert.equal(g.bubbleCount, 0)
})

const BODY = loadLib("./JarSprite.js", ["geometry", "body", "COLS", "ROWS"])

// Sentinel colours so each layer is identifiable without recomputing its shade.
const RIM = { r: 1, g: 0, b: 0 }
const DOUGH = { r: 0, g: 1, b: 0 }

function draw(volume, bubbles, hooch) {
  const grid = BODY.body(BODY.geometry(volume, bubbles, hooch), DOUGH, RIM)
  return grid.map((row) => row.map((c) => {
    if (!c || c.a === 0) return " "
    if (c.r === 1 && c.g === 0) return "L"
    if (c.r === 0.75 && c.g === 0) return "G"
    if (c.r === 0 && c.g === 1) return "."
    return "#"
  }).join("")).join("\n")
}

test("hooch draws as a band above the dough", () => {
  assert.equal(draw(0.5, 0.5, 0.2), [
    " LLLLLLLLLL ",
    " LLLLLLLLLL ",
    " G LLLLLL G ",
    "G          G",
    "G          G",
    "G          G",
    "G          G",
    "G##########G",
    "G##########G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    " GGGGGGGGGG "
  ].join("\n"))
})

test("an empty jar draws only glass", () => {
  assert.match(draw(0, 0, 0), /^ LLLLLLLLLL \n/)
  assert.equal(draw(0, 0, 0).includes("."), false)
  assert.equal(draw(0, 0, 0).includes("#"), false)
})

test("a jar filled to the brim caps the dough with hooch", () => {
  const rows = draw(0.7, 0, 0.3).split("\n")
  assert.equal(rows[3], "G##########G")
  assert.equal(rows[6], "G##########G")
  assert.equal(rows[7], "G..........G")
})

const FIZZ = loadLib("./JarSprite.js", [
  "geometry", "newFizz", "stepFizz", "gasCells", "BODY_TOP", "BODY_BOTTOM", "FILL_LEFT", "FILL_WIDTH"
])

function occupied(cells) {
  return new Set(cells.map(([c, r]) => c + "," + r))
}

function insideDough(geom, [c, r]) {
  return c >= FIZZ.FILL_LEFT && c < FIZZ.FILL_LEFT + FIZZ.FILL_WIDTH
    && r >= geom.doughTop && r <= FIZZ.BODY_BOTTOM
}

test("bubbles keep their count and never overlap while they move", () => {
  const geom = FIZZ.geometry(0.5, 0.6, 0.3)
  let fizz = FIZZ.newFizz(geom)
  for (let i = 0; i < 20; i++) {
    fizz = FIZZ.stepFizz(fizz, geom)
    assert.equal(fizz.bubbles.length, geom.bubbleCount)
    assert.equal(occupied(fizz.bubbles).size, geom.bubbleCount)
    for (const cell of fizz.bubbles) assert.ok(insideDough(geom, cell), `${cell} escaped the dough`)
  }
})

test("bubbles actually move", () => {
  const geom = FIZZ.geometry(0.5, 0.2, 0.8)
  let fizz = FIZZ.newFizz(geom)
  const before = JSON.stringify(fizz.bubbles)
  for (let i = 0; i < 5; i++) fizz = FIZZ.stepFizz(fizz, geom)
  assert.notEqual(JSON.stringify(fizz.bubbles), before)
})

test("bubbles left above a falling dough surface are reseated, not dropped", () => {
  const high = FIZZ.geometry(1, 1, 0)
  const low = FIZZ.geometry(0.15, 1, 0)
  let fizz = FIZZ.stepFizz(FIZZ.newFizz(high), high)
  fizz = FIZZ.stepFizz(fizz, low)
  assert.equal(fizz.bubbles.length, low.bubbleCount)
  for (const cell of fizz.bubbles) assert.ok(insideDough(low, cell), `${cell} floats above the dough`)
})

test("gas rises above the dough and stays inside the jar", () => {
  const geom = FIZZ.geometry(0.3, 0.8, 0.2)
  let fizz = FIZZ.newFizz(geom)
  for (let i = 0; i < 20; i++) {
    fizz = FIZZ.stepFizz(fizz, geom)
    for (const [c, r] of FIZZ.gasCells(fizz, geom)) {
      assert.ok(r < geom.fillTop, `gas at row ${r} is inside the dough`)
      assert.ok(r >= FIZZ.BODY_TOP && r <= FIZZ.BODY_BOTTOM, `gas at row ${r} is outside the body`)
      assert.ok(c >= FIZZ.FILL_LEFT && c < FIZZ.FILL_LEFT + FIZZ.FILL_WIDTH, `gas at column ${c} is in the wall`)
    }
  }
})

test("a full jar has no headroom, so no gas", () => {
  const geom = FIZZ.geometry(1, 1, 0)
  const fizz = FIZZ.stepFizz(FIZZ.newFizz(geom), geom)
  assert.deepEqual(FIZZ.gasCells(fizz, geom), [])
})

test("flat dough gives off no gas", () => {
  const geom = FIZZ.geometry(0.3, 0.04, 0.96)
  const fizz = FIZZ.stepFizz(FIZZ.newFizz(geom), geom)
  assert.deepEqual(FIZZ.gasCells(fizz, geom), [])
})

test("the gas plume changes shape as it rises and then clears", () => {
  const geom = FIZZ.geometry(0.3, 0.8, 0.2)
  let fizz = FIZZ.newFizz(geom)
  const shapes = new Set()
  for (let i = 0; i < 7; i++) {
    fizz = FIZZ.stepFizz(fizz, geom)
    shapes.add(FIZZ.gasCells(fizz, geom).length)
  }
  assert.ok(shapes.size > 1, "the plume never changed")
  assert.ok(shapes.has(0), "the plume never cleared")
})

const COLOR = loadLib("./JarSprite.js", ["fizzColor"])

test("fizz is a dimmer, cooler shade of the dough it rises from", () => {
  const c = COLOR.fizzColor({ r: 1, g: 1, b: 1 })
  assert.ok(c.r < 1 && c.g < 1 && c.b < 1, "fizz is not darker than the dough")
  assert.ok(c.r < c.g && c.g < c.b, "fizz is not cooler than the dough")
  assert.equal(c.a, 1)
})

test("fizz on black dough stays black", () => {
  assert.deepEqual(COLOR.fizzColor({ r: 0, g: 0, b: 0 }), { r: 0, g: 0, b: 0, a: 1 })
})
