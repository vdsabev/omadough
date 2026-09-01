.pragma library

// Pixel geometry for the mason jar: 12 columns by 18 rows. The body walls sit on
// the outer columns; the fill area inside is 10 wide by 14 tall.
var COLS = 12
var ROWS = 18
var BODY_TOP = 3
var BODY_BOTTOM = 16
var FILL_UNITS = 7
var ROWS_PER_UNIT = 2
var FILL_LEFT = 1
var FILL_WIDTH = 10

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function rowsFor(quantity) {
  return Math.round(quantity * FILL_UNITS) * ROWS_PER_UNIT
}

// Dough and hooch are both quantities filling the same jar, so they stack: the
// fill is as deep as the two together and the hooch band takes the top of it.
function geometry(volume, bubbles, hooch) {
  var v = clamp(volume, 0, 1)
  var h = v > 0 ? clamp(hooch, 0, 1 - v) : 0
  var fillRows = rowsFor(v + h)
  var hoochRows = h > 0 ? Math.min(fillRows, Math.max(1, rowsFor(h))) : 0
  var fillTop = BODY_BOTTOM + 1 - fillRows
  return {
    bubbles: bubbles,
    fillRows: fillRows,
    fillTop: fillTop,
    hoochRows: hoochRows,
    doughTop: fillTop + hoochRows,
    bubbleCount: v > 0 && bubbles > 0 ? Math.max(2, Math.floor(bubbles * FILL_WIDTH)) : 0
  }
}

var SPRITE = [
  ".LLLLLLLLLL.",
  ".LLLLLLLLLL.",
  ".G.LLLLLL.G.",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  "G..........G",
  ".GGGGGGGGGG."
]

// The hooch is translucent so the surface behind the widget shows through it.
var HOOCH = { r: 0.28, g: 0.16, b: 0.08 }
var HOOCH_ALPHA = 0.75
var GLASS_DIM = 0.75

function rgba(c, a) {
  return { r: c.r, g: c.g, b: c.b, a: a }
}

function isInterior(col, row) {
  return SPRITE[row].charAt(col) === "." && row >= BODY_TOP && row <= BODY_BOTTOM
    && col >= FILL_LEFT && col < FILL_LEFT + FILL_WIDTH
}

function inFill(geom, col, row) {
  return col >= FILL_LEFT && col < FILL_LEFT + FILL_WIDTH
    && row >= geom.fillTop && row <= BODY_BOTTOM
}

function inDough(geom, col, row) {
  return col >= FILL_LEFT && col < FILL_LEFT + FILL_WIDTH
    && row >= geom.doughTop && row <= BODY_BOTTOM
}

// Colours are {r,g,b,a} in 0..1, matching DoughState.doughColorComponents. A null
// cell is transparent. Changes only when the dough does, so callers may cache it.
function body(geom, dough, rim) {
  var glass = { r: rim.r * GLASS_DIM, g: rim.g * GLASS_DIM, b: rim.b * GLASS_DIM }
  var grid = []
  for (var row = 0; row < ROWS; row++) {
    var cells = []
    for (var col = 0; col < COLS; col++) {
      var code = SPRITE[row].charAt(col)
      if (code === "L")
        cells.push(rgba(rim, 1))
      else if (code === "G")
        cells.push(rgba(glass, 1))
      else if (geom.fillRows > 0 && isInterior(col, row) && inFill(geom, col, row))
        cells.push(row < geom.doughTop ? rgba(HOOCH, HOOCH_ALPHA) : rgba(dough, 1))
      else
        cells.push(null)
    }
    grid.push(cells)
  }
  return grid
}

// The plume peeks out of the dough, drifts up and to the right, then disperses.
// Columns run 0..3 from the origin; the row is pinned so the peek sits on the
// dough surface.
var GAS_FRAMES = [
  [[1, 3], [1, 4]],
  [[2, 2], [1, 3], [3, 3]],
  [[1, 0], [0, 1], [2, 1], [1, 2]],
  [[2, 0], [1, 1], [1, 0], [2, 1]],
  [[1, -1], [3, -1]],
  [[2, -2]],
  []
]
var GAS_MAX_CELLS = 4
var GAS_PERIOD = GAS_FRAMES.length
var GAS_MIN_BUBBLES = 0.05
var GAS_WIDTH = 4
var GAS_PEEK_ROWS = 5

function shuffleInPlace(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

function pickGasOrigin(fizz, geom) {
  var lo = FILL_LEFT
  var hi = Math.max(lo, FILL_LEFT + FILL_WIDTH - GAS_WIDTH)
  fizz.gasCol = lo + Math.floor(Math.random() * (hi - lo + 1))
  fizz.gasRow = geom.fillTop - GAS_PEEK_ROWS
}

function newFizz(geom) {
  var fizz = { tick: 0, bubbles: [], gasCol: FILL_LEFT, gasRow: 0, fillTop: geom.fillTop }
  pickGasOrigin(fizz, geom)
  reseat(fizz, geom)
  return fizz
}

function key(col, row) {
  return row * 32 + col
}

// Keeps exactly geom.bubbleCount cells occupied. Cells the dough no longer covers
// are dropped and replaced elsewhere, so the count never dips as the level moves.
function reseat(fizz, geom) {
  var occupied = {}
  var kept = []
  for (var i = 0; i < fizz.bubbles.length && kept.length < geom.bubbleCount; i++) {
    var col = fizz.bubbles[i][0]
    var row = fizz.bubbles[i][1]
    if (!inDough(geom, col, row) || occupied[key(col, row)])
      continue
    occupied[key(col, row)] = true
    kept.push([col, row])
  }
  while (kept.length < geom.bubbleCount) {
    var free = []
    for (var r = geom.doughTop; r <= BODY_BOTTOM; r++)
      for (var c = FILL_LEFT; c < FILL_LEFT + FILL_WIDTH; c++)
        if (inDough(geom, c, r) && !occupied[key(c, r)])
          free.push([c, r])
    if (!free.length)
      break
    var spot = free[Math.floor(Math.random() * free.length)]
    occupied[key(spot[0], spot[1])] = true
    kept.push(spot)
  }
  fizz.bubbles = kept
  return occupied
}

var STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0], [1, -1], [-1, 1], [1, 1], [-1, -1]]

// An exclusion walk: each bubble takes one free neighbouring cell, so bubbles are
// neither born nor lost mid-frame.
function stepFizz(fizz, geom) {
  if (fizz.fillTop !== geom.fillTop) {
    fizz.fillTop = geom.fillTop
    pickGasOrigin(fizz, geom)
  }
  fizz.tick = (fizz.tick + 1) % (GAS_PERIOD * 2)
  if (fizz.tick % GAS_PERIOD === 0)
    pickGasOrigin(fizz, geom)

  var occupied = reseat(fizz, geom)
  var order = shuffleInPlace(fizz.bubbles.map(function (_, i) { return i }))
  for (var o = 0; o < order.length; o++) {
    var i = order[o]
    var col = fizz.bubbles[i][0]
    var row = fizz.bubbles[i][1]
    var dirs = shuffleInPlace(STEPS.slice())
    for (var d = 0; d < dirs.length; d++) {
      var nc = col + dirs[d][0]
      var nr = row + dirs[d][1]
      if (!inDough(geom, nc, nr) || occupied[key(nc, nr)])
        continue
      delete occupied[key(col, row)]
      occupied[key(nc, nr)] = true
      fizz.bubbles[i] = [nc, nr]
      break
    }
  }
  return fizz
}

function gasCells(fizz, geom) {
  if (!(geom.fillRows > 0 && geom.bubbleCount > 0 && geom.fillTop > BODY_TOP))
    return []
  if (geom.bubbles <= GAS_MIN_BUBBLES)
    return []
  var frame = GAS_FRAMES[fizz.tick % GAS_PERIOD]
  var cells = []
  for (var i = 0; i < frame.length && cells.length < GAS_MAX_CELLS; i++) {
    var col = fizz.gasCol + frame[i][0]
    var row = fizz.gasRow + frame[i][1]
    if (row >= 0 && row < ROWS && isInterior(col, row) && row < geom.fillTop)
      cells.push([col, row])
  }
  return cells
}

var FIZZ_DIM = { r: 0.62, g: 0.64, b: 0.68 }

function fizzColor(dough) {
  return { r: dough.r * FIZZ_DIM.r, g: dough.g * FIZZ_DIM.g, b: dough.b * FIZZ_DIM.b, a: 1 }
}
