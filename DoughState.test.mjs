import { test } from "node:test"
import assert from "node:assert/strict"
import { loadLib } from "./loadLib.mjs"

const DS = loadLib("./DoughState.js", [
  "FEED_WINDOW_HOURS", "VOLUME_PER_FEED", "BUBBLES_PER_FEED",
  "DARKNESS_DEAD",
  "defaultState", "parseState", "clamp", "todayKey", "pad",
  "daysSince", "hoursSince", "inFeedWindow", "fedToday",
  "canFeed", "canStart", "canBake", "feedButtonText",
  "feed", "startJar", "bake", "pour", "canPour", "isDead",
  "aliveText", "ripenessLabel", "statusText", "doughColorComponents",
  "formatFeedClock", "nextFeedHint",
  "health", "displayBubbles", "displayDarkness", "persistFields",
  "lifecycle", "feedCycle", "healthBand", "writeHealth", "loafSummary",
  "hooch", "jarFull", "HOOCH_MAX"
])

const DAY = 86400000
const HOUR = 3600000

function makeState(overrides = {}) {
  return Object.assign(DS.defaultState(), overrides)
}

function daysAgoIso(n) {
  return new Date(Date.now() - n * DAY).toISOString()
}

function bakableState(overrides = {}) {
  return makeState(Object.assign({
    volume: 0.5,
    bubbles: 0.5,
    created: daysAgoIso(7),
    lastFed: new Date().toISOString(),
    loaves: []
  }, overrides))
}

function feedWindowOffset(offsetMinutes) {
  const now = new Date()
  let m = now.getHours() * 60 + now.getMinutes() - offsetMinutes
  m = ((m % 1440) + 1440) % 1440
  return { feedWindowMinutes: m, feedWindowHour: Math.floor(m / 60) }
}

function almostEqual(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-10, msg || `${actual} !== ${expected}`)
}

// ── clamp ──────────────────────────────────────────────────

test("clamp restricts value to [lo, hi]", () => {
  assert.equal(DS.clamp(5, 0, 10), 5)
  assert.equal(DS.clamp(-1, 0, 10), 0)
  assert.equal(DS.clamp(11, 0, 10), 10)
  assert.equal(DS.clamp(0, 0, 0), 0)
})

// ── pad ────────────────────────────────────────────────────

test("pad zero-pads single digits", () => {
  assert.equal(DS.pad(0), "00")
  assert.equal(DS.pad(9), "09")
  assert.equal(DS.pad(10), "10")
  assert.equal(DS.pad(12), "12")
})

// ── todayKey ───────────────────────────────────────────────

test("todayKey returns YYYY-MM-DD format", () => {
  assert.match(DS.todayKey(), /^\d{4}-\d{2}-\d{2}$/)
})

// ── daysSince / hoursSince ─────────────────────────────────

test("daysSince returns 0 for null", () => {
  assert.equal(DS.daysSince(null), 0)
  assert.equal(DS.daysSince(""), 0)
})

test("daysSince counts whole days elapsed", () => {
  const threeDaysAgo = new Date(Date.now() - 3 * DAY - 1000).toISOString()
  assert.equal(DS.daysSince(threeDaysAgo), 3)
})

test("hoursSince returns 999 for null", () => {
  assert.equal(DS.hoursSince(null), 999)
})

test("hoursSince returns fractional hours", () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * HOUR).toISOString()
  const h = DS.hoursSince(fiveHoursAgo)
  assert.ok(h >= 4.9 && h <= 5.1, `expected ~5, got ${h}`)
})

// ── defaultState ───────────────────────────────────────────

test("defaultState has empty jar values", () => {
  const s = DS.defaultState()
  assert.equal(s.volume, 0)
  assert.equal(s.bubbles, 0)
  assert.equal("darkness" in s, false)
  assert.equal("baked" in s, false)
  assert.equal(s.lastFed, null)
  assert.ok(s.created)
})

// ── parseState ─────────────────────────────────────────────

test("parseState round-trips valid JSON", () => {
  const input = JSON.stringify({
    created: "2025-01-15T10:00:00.000Z",
    lastFed: "2025-01-16T08:00:00.000Z",
    volume: 0.5, bubbles: 0.6, darkness: 0.1,
    baked: false, feedWindowHour: 8, feedWindowMinutes: 510,
    loaves: [{ bakedAt: "2025-01-20T08:00:00.000Z", quality: 0.84 }]
  })
  const s = DS.parseState(input)
  assert.equal(s.volume, 0.5)
  assert.equal(s.bubbles, 0.6)
  assert.equal("darkness" in s, false)
  assert.equal("baked" in s, false)
  assert.equal(s.feedWindowHour, 8)
  assert.equal(s.feedWindowMinutes, 510)
  assert.equal(s.loaves.length, 1)
  assert.equal(s.loaves[0].quality, 0.84)
})

test("parseState falls back to defaults on bad input", () => {
  for (const raw of ["", "{"]) {
    const s = DS.parseState(raw)
    assert.equal(s.volume, 0)
    assert.equal("baked" in s, false)
  }
})

// Every consumer dereferences the result immediately, so a state file holding a
// bare value must reset the jar, not hand back something that cannot be read.
test("parseState falls back to defaults on values that are not a state", () => {
  for (const raw of ["null", "42", "[]", '"text"', "true"]) {
    const s = DS.parseState(raw)
    assert.equal(s.volume, 0, raw)
    assert.equal(s.bubbles, 0, raw)
    assert.ok(Array.isArray(s.loaves), raw)
  }
})

test("parseState clamps out-of-range values", () => {
  const s = DS.parseState(JSON.stringify({ volume: 5, bubbles: -1, darkness: 99 }))
  assert.equal(s.volume, 1)
  assert.equal(s.bubbles, 0)
  assert.equal("darkness" in s, false)
})

test("parseState coerces non-numeric fields", () => {
  const s = DS.parseState(JSON.stringify({ volume: "abc", baked: "yes" }))
  assert.equal(s.volume, 0)
  assert.equal("baked" in s, false)
})

test("parseState drops leftover feedDays", () => {
  const s = DS.parseState(JSON.stringify({ feedDays: ["2025-01-16"] }))
  assert.equal(s.feedDays, undefined)
})

test("parseState treats a legacy darkness death as dead even if bubbles remain", () => {
  const s = DS.parseState(JSON.stringify({
    volume: 0.5, bubbles: 0.6, darkness: 1,
    lastFed: new Date().toISOString(),
    created: daysAgoIso(10)
  }))
  assert.equal(s.bubbles, 0)
  assert.equal("darkness" in s, false)
  assert.equal(DS.isDead(s), true)
})

test("persistFields omits baked", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.4, baked: true, loaves: [] })
  const p = DS.persistFields(s)
  assert.equal("baked" in p, false)
  assert.equal(p.volume, 0.5)
  assert.equal(p.bubbles, 0.4)
})

test("parseState treats a legacy baked endgame as dead", () => {
  const s = DS.parseState(JSON.stringify({
    volume: 0.5, bubbles: 0.8, darkness: 0.2, baked: true,
    lastFed: new Date().toISOString(),
    created: daysAgoIso(10)
  }))
  assert.equal(s.bubbles, 0)
  assert.equal("baked" in s, false)
  assert.equal(DS.isDead(s), true)
})

// ── inFeedWindow ───────────────────────────────────────────

test("inFeedWindow returns true at the started minute", () => {
  const s = makeState(Object.assign({ baked: false }, feedWindowOffset(0)))
  assert.equal(DS.inFeedWindow(s), true)
})

test("inFeedWindow returns false when more than 2 hours away", () => {
  const s = makeState(Object.assign({ baked: false }, feedWindowOffset(121)))
  assert.equal(DS.inFeedWindow(s), false)
})

test("inFeedWindow wraps around midnight", () => {
  const s = makeState(Object.assign({ baked: false }, feedWindowOffset(60)))
  assert.equal(DS.inFeedWindow(s), true)
})

test("inFeedWindow ignores baked flag", () => {
  const s = makeState(Object.assign({ baked: true }, feedWindowOffset(0)))
  assert.equal(DS.inFeedWindow(s), true)
})

// ── fedToday ───────────────────────────────────────────────

test("fedToday returns false when lastFed is null", () => {
  assert.equal(DS.fedToday(makeState()), false)
})

test("fedToday returns true when fed today", () => {
  const s = makeState({ lastFed: new Date().toISOString() })
  assert.equal(DS.fedToday(s), true)
})

test("fedToday returns false when fed yesterday", () => {
  const s = makeState({ lastFed: new Date(Date.now() - DAY).toISOString() })
  assert.equal(DS.fedToday(s), false)
})

// ── canFeed ────────────────────────────────────────────────

test("canFeed requires volume > 0", () => {
  assert.equal(DS.canFeed(makeState({ lastFed: null, volume: 0 })), false)
})

test("canFeed is false when already fed today", () => {
  const s = makeState({ volume: 0.5, lastFed: new Date().toISOString() })
  assert.equal(DS.canFeed(s), false)
})

test("canFeed is true for a live jar not fed today", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.5, lastFed: daysAgoIso(1) })
  assert.equal(DS.canFeed(s), true)
})

test("canFeed ignores baked flag", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.5, lastFed: daysAgoIso(1), baked: true })
  assert.equal(DS.canFeed(s), true)
})

// ── canStart ───────────────────────────────────────────────

test("canStart is true when volume is 0", () => {
  assert.equal(DS.canStart(makeState()), true)
})

test("canStart is false when volume > 0", () => {
  assert.equal(DS.canStart(makeState({ volume: 0.1 })), false)
})

test("canStart is true when volume is 0 even if baked flag is set", () => {
  assert.equal(DS.canStart(makeState({ baked: true })), true)
})

// ── canBake ────────────────────────────────────────────────

test("canBake requires volume and enough bubbles, not age or streak", () => {
  assert.equal(DS.canBake(bakableState({ bubbles: 0.2 })), false)
  assert.equal(DS.canBake(bakableState({ volume: 0.05, bubbles: 0.5 })), false)
  assert.equal(DS.canBake(bakableState()), true)
})

test("feedButtonText names an out-of-window feed instead of blocking it", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.5, lastFed: daysAgoIso(1)
  }, feedWindowOffset(150)))
  assert.equal(DS.canFeed(s), true)
  assert.equal(DS.inFeedWindow(s), false)
  assert.equal(DS.feedButtonText(s), "feed")
})

// ── feed ───────────────────────────────────────────────────

test("a perfect feed on a mature starter raises health", () => {
  const s = makeState(Object.assign({
    volume: 0.3, bubbles: 0.2, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(0)))
  const next = DS.feed(s)
  assert.equal(next.volume, 0.42)
  almostEqual(next.bubbles, 0.35)
  assert.ok(next.lastFed)
})

test("a moderate feed (±45m) on a mature starter applies half the health change", () => {
  const s = makeState(Object.assign({
    volume: 0.3, bubbles: 0.2, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(45)))
  const next = DS.feed(s)
  almostEqual(next.bubbles, 0.275)
})

test("a late feed (±90m) on a mature starter applies a quarter of the health change", () => {
  const s = makeState(Object.assign({
    volume: 0.3, bubbles: 0.2, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(90)))
  const next = DS.feed(s)
  almostEqual(next.bubbles, 0.2375)
})

test("feeding outside ±2h adds volume, keeps health, and moves the perfect window", () => {
  const s = makeState(Object.assign({
    volume: 0.3, bubbles: 0.2, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(150)))
  const next = DS.feed(s)
  assert.equal(next.volume, 0.42)
  assert.equal(next.bubbles, 0.2)
  const now = new Date()
  const expected = now.getHours() * 60 + now.getMinutes()
  assert.ok(Math.abs(next.feedWindowMinutes - expected) <= 1)
})

test("a perfect feed on day 1 raises full health; display is 1/7 intensity", () => {
  const s = makeState(Object.assign({
    volume: 0.3, bubbles: 0.5, lastFed: null,
    created: new Date().toISOString()
  }, feedWindowOffset(0)))
  const next = DS.feed(s)
  almostEqual(next.bubbles, 0.65)
  almostEqual(DS.displayBubbles(next), 0.65 / 7)
  almostEqual(DS.displayDarkness(next), 0.35 / 7)
})

test("feed clamps volume to 1", () => {
  const s = makeState(Object.assign({
    volume: 0.95, bubbles: 0.2, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(0)))
  const next = DS.feed(s)
  assert.equal(next.volume, 1)
})

test("feed clamps health to 1", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.95, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(0)))
  const next = DS.feed(s)
  assert.equal(next.bubbles, 1)
})

test("feed does not mutate the original state", () => {
  const s = makeState({ volume: 0.3, lastFed: null })
  DS.feed(s)
  assert.equal(s.volume, 0.3)
})

test("feed returns the same reference when canFeed is false", () => {
  const s = makeState({ volume: 0.5, lastFed: new Date().toISOString() })
  assert.equal(DS.feed(s), s)
})

// ── startJar ───────────────────────────────────────────────

test("startJar initializes a new starter at perfect health", () => {
  const s = makeState({ volume: 0 })
  const next = DS.startJar(s)
  assert.equal(next.volume, 0.1)
  assert.equal(next.bubbles, 1)
  almostEqual(DS.displayBubbles(next), 1 / 7)
  almostEqual(DS.displayDarkness(next), 0)
  assert.ok(next.created)
  assert.ok(next.lastFed)
})

test("startJar sets the feed window to the current time", () => {
  const next = DS.startJar(makeState())
  const now = new Date()
  assert.equal(next.feedWindowHour, now.getHours())
  const expected = now.getHours() * 60 + now.getMinutes()
  assert.ok(Math.abs(next.feedWindowMinutes - expected) <= 1)
})

test("startJar does not mutate the original state", () => {
  const s = makeState({ volume: 0.5 })
  DS.startJar(s)
  assert.equal(s.volume, 0.5)
})

// ── bake ───────────────────────────────────────────────────

test("bake subtracts one daily dose from volume and logs loaf quality from health", () => {
  const s = bakableState()
  const next = DS.bake(s)
  almostEqual(next.volume, 0.5 - DS.VOLUME_PER_FEED)
  assert.equal(next.bubbles, 0.5)
  assert.equal(next.loaves.length, 1)
  assert.equal(next.loaves[0].quality, 0.5)
  assert.ok(next.loaves[0].bakedAt)
})

test("bake returns same reference when bubbles are too low", () => {
  const s = bakableState({ bubbles: 0.2 })
  assert.equal(DS.bake(s), s)
})

test("bake does not mutate the original state", () => {
  const s = bakableState()
  DS.bake(s)
  assert.equal(s.volume, 0.5)
})

test("bake can empty the jar when volume equals one daily dose", () => {
  const s = bakableState({ volume: DS.VOLUME_PER_FEED })
  const next = DS.bake(s)
  assert.equal(next.volume, 0)
  assert.equal(DS.canStart(next), true)
})

test("feed after bake restores one daily dose", () => {
  const s = bakableState({ lastFed: null })
  const baked = DS.bake(s)
  const fed = DS.feed(baked)
  assert.ok(Math.abs(fed.volume - 0.5) < 1e-10, `volume=${fed.volume}`)
})

// ── health / display / neglect ─────────────────────────────

test("day-1 perfect health shows 1/7 bubbles and no crust", () => {
  const s = makeState({
    volume: 0.5, bubbles: 1, lastFed: new Date().toISOString(),
    created: new Date().toISOString()
  })
  almostEqual(DS.health(s), 1)
  almostEqual(DS.displayBubbles(s), 1 / 7)
  almostEqual(DS.displayDarkness(s), 0)
})

test("day-2 neglected health is shown at 2/7 intensity", () => {
  const s = makeState({
    volume: 0.5, bubbles: 0.4, lastFed: new Date().toISOString(),
    created: daysAgoIso(1)
  })
  almostEqual(DS.displayBubbles(s), 0.4 * 2 / 7)
  almostEqual(DS.displayDarkness(s), 0.6 * 2 / 7)
})

test("a mature jar displays health at full intensity", () => {
  const s = makeState({
    volume: 0.5, bubbles: 0.4, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  })
  almostEqual(DS.displayBubbles(s), 0.4)
  almostEqual(DS.displayDarkness(s), 0.6)
})

test("health is unchanged until 26 hours after the last feed", () => {
  const s = makeState({
    volume: 0.5, bubbles: 0.8,
    lastFed: new Date(Date.now() - 25 * HOUR).toISOString(),
    created: daysAgoIso(10)
  })
  almostEqual(DS.health(s), 0.8)
})

test("health drops after the 2h grace past the next perfect time, more with each extra hour", () => {
  const base = {
    volume: 0.5, bubbles: 0.8, created: daysAgoIso(10)
  }
  const h27 = DS.health(makeState(Object.assign({
    lastFed: new Date(Date.now() - 27 * HOUR).toISOString()
  }, base)))
  const h28 = DS.health(makeState(Object.assign({
    lastFed: new Date(Date.now() - 28 * HOUR).toISOString()
  }, base)))
  assert.ok(h27 < 0.8, `27h health=${h27}`)
  assert.ok(h28 < h27, `28h health=${h28} should be < 27h ${h27}`)
})

test("a late feed after decay freezes health and does not restore it", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.8, lastFed: new Date(Date.now() - 30 * HOUR).toISOString(),
    created: daysAgoIso(10)
  }, feedWindowOffset(150)))
  const before = DS.health(s)
  const next = DS.feed(s)
  almostEqual(next.bubbles, before)
  almostEqual(DS.health(next), before)
})




// ── isDead ─────────────────────────────────────────────────

test("isDead when health has reached 0 and volume > 0", () => {
  assert.equal(DS.isDead(makeState({
    volume: 0.5, bubbles: 0, lastFed: new Date().toISOString()
  })), true)
})

test("isDead is false when health remains", () => {
  assert.equal(DS.isDead(makeState({
    volume: 0.5, bubbles: 0.01, lastFed: new Date().toISOString()
  })), false)
})

test("isDead is false when volume is 0", () => {
  assert.equal(DS.isDead(makeState({ volume: 0, bubbles: 0 })), false)
})

test("isDead ignores baked flag", () => {
  assert.equal(DS.isDead(makeState({
    volume: 0.5, bubbles: 0, baked: true, lastFed: new Date().toISOString()
  })), true)
})

// ── aliveText ──────────────────────────────────────────────

test("aliveText is empty when volume is 0", () => {
  assert.equal(DS.aliveText(makeState()), "")
})

test("aliveText says 'today' on day 0", () => {
  const s = makeState({ volume: 0.5, created: new Date().toISOString() })
  assert.equal(DS.aliveText(s), "today")
})

test("aliveText says '1 day ago' on day 1", () => {
  const s = makeState({ volume: 0.5, created: new Date(Date.now() - DAY).toISOString() })
  assert.equal(DS.aliveText(s), "1 day ago")
})

test("aliveText says 'N days ago' for N >= 2", () => {
  const s = makeState({ volume: 0.5, created: new Date(Date.now() - 5 * DAY).toISOString() })
  assert.equal(DS.aliveText(s), "5 days ago")
})

test("ripenessLabel is empty when the jar is empty", () => {
  assert.equal(DS.ripenessLabel(makeState()), "")
})

test("ripenessLabel is 1/7 on the start day", () => {
  const s = makeState({ volume: 0.1, created: new Date().toISOString() })
  assert.equal(DS.ripenessLabel(s), "1/7")
})

test("ripenessLabel is 2/7 on the second day", () => {
  const s = makeState({ volume: 0.1, created: daysAgoIso(1) })
  assert.equal(DS.ripenessLabel(s), "2/7")
})

test("ripenessLabel is 7/7 on day 6", () => {
  const s = makeState({ volume: 0.1, created: daysAgoIso(6) })
  assert.equal(DS.ripenessLabel(s), "7/7")
})

test("ripenessLabel hides after the first 7 days", () => {
  const s = makeState({ volume: 0.1, created: daysAgoIso(7) })
  assert.equal(DS.ripenessLabel(s), "")
})

// ── statusText ─────────────────────────────────────────────

// Helper: create a state guaranteed to be outside the feed window
function outsideFeedWindow(overrides = {}) {
  return makeState(Object.assign(feedWindowOffset(5 * 60), overrides))
}

test("statusText: empty jar", () => {
  assert.match(DS.statusText(makeState()), /empty jar/)
})

test("statusText: baked flag does not override a live starter", () => {
  const s = makeState({ volume: 0.5, bubbles: 1, baked: true, lastFed: new Date().toISOString() })
  assert.match(DS.statusText(s), /happy sourdough/)
})

test("statusText: dead", () => {
  assert.match(DS.statusText(makeState({
    volume: 0.5, bubbles: 0, lastFed: new Date().toISOString()
  })), /died/)
})

test("statusText: time to feed (in window, not fed today)", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 1,
    lastFed: new Date(Date.now() - 2 * DAY).toISOString()
  }, feedWindowOffset(0)))
  assert.match(DS.statusText(s), /feeding time/)
})

test("statusText: fed today", () => {
  const s = makeState({ volume: 0.5, bubbles: 1, lastFed: new Date().toISOString() })
  assert.match(DS.statusText(s), /happy sourdough/)
})

test("statusText: hungry (> 24h since feed)", () => {
  const s = outsideFeedWindow({
    volume: 0.5, bubbles: 1,
    lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  })
  assert.match(DS.statusText(s), /hungry/)
})

test("statusText: low health is dark even if recently fed", () => {
  const s = makeState({
    volume: 1, bubbles: 0.2, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  })
  assert.match(DS.statusText(s), /looking tired/)
})

test("statusText: very low health is hanging on", () => {
  const s = makeState({
    volume: 1, bubbles: 0.1, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  })
  assert.match(DS.statusText(s), /hanging on/)
})

test("statusText: mid health is sluggish", () => {
  const s = makeState({
    volume: 1, bubbles: 0.5, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  })
  assert.match(DS.statusText(s), /sluggish/)
})

test("statusText: hungry only when health is still high", () => {
  const s = outsideFeedWindow({
    volume: 0.5, bubbles: 0.2,
    lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  })
  assert.match(DS.statusText(s), /looking tired/)
})

// ── inFeedWindow (edge cases) ──────────────────────────────

test("inFeedWindow: 2 hours away is inside", () => {
  const s = makeState(Object.assign({ baked: false }, feedWindowOffset(120)))
  assert.equal(DS.inFeedWindow(s), true)
})

test("inFeedWindow: just over 2 hours away is outside", () => {
  const s = makeState(Object.assign({ baked: false }, feedWindowOffset(121)))
  assert.equal(DS.inFeedWindow(s), false)
})

// ── startJar (edge cases) ─────────────────────────────────

test("startJar restarts a full jar at one dose", () => {
  const next = DS.startJar(makeState({ volume: 0.8 }))
  assert.equal(next.volume, 0.1)
  assert.equal(DS.health(next), 1)
})

test("startJar brings a dead starter back to Alive", () => {
  const s = makeState({ volume: 0.5, bubbles: 0 })
  assert.equal(DS.lifecycle(s), "Dead")
  assert.equal(DS.lifecycle(DS.startJar(s)), "Alive")
})

// ── bake (edge cases) ─────────────────────────────────────

test("canBake stays true after baking as long as volume and health remain", () => {
  const s = bakableState({ volume: 0.5 })
  const once = DS.bake(s)
  assert.equal(DS.canBake(once), true)
  const twice = DS.bake(once)
  assert.ok(Math.abs(twice.volume - (0.5 - 2 * DS.VOLUME_PER_FEED)) < 1e-10)
})

test("bake does not consume a dead starter", () => {
  const s = bakableState({ bubbles: 0 })
  assert.equal(DS.bake(s), s)
})

test("two perfect feeds on a mature starter reach bakeable displayed bubbles", () => {
  let s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.1, lastFed: null,
    created: daysAgoIso(7)
  }, feedWindowOffset(0)))
  s = DS.feed(s)
  s.lastFed = daysAgoIso(1)
  s = DS.feed(s)
  almostEqual(s.bubbles, 0.4)
  assert.equal(DS.canBake(s), true)
})

test("perfect health on day 1 is not bakeable because display is too quiet", () => {
  const s = makeState({
    volume: 0.5, bubbles: 1, lastFed: new Date().toISOString(),
    created: new Date().toISOString()
  })
  assert.equal(DS.health(s), 1)
  assert.equal(DS.canBake(s), false)
})

// ── isDead (edge cases) ───────────────────────────────────

test("isDead: tiny remaining health is alive", () => {
  const s = makeState({
    volume: 0.5, bubbles: 0.001, lastFed: new Date().toISOString()
  })
  assert.equal(DS.isDead(s), false)
})

// ── statusText (edge cases) ───────────────────────────────

test("statusText: dead is not hidden by baked flag", () => {
  const s = makeState({
    volume: 0.5, bubbles: 0, baked: true, lastFed: new Date().toISOString()
  })
  assert.match(DS.statusText(s), /died/)
})

test("formatFeedClock: 10:03", () => {
  assert.equal(DS.formatFeedClock(makeState({ feedWindowMinutes: 10 * 60 + 3 })), "10:03")
})

test("formatFeedClock: midnight", () => {
  assert.equal(DS.formatFeedClock(makeState({ feedWindowMinutes: 0 })), "0:00")
})

test("nextFeedHint: empty jar", () => {
  assert.equal(DS.nextFeedHint(makeState()), "")
})

test("nextFeedHint: after feeding today", () => {
  const s = makeState({
    volume: 0.5, bubbles: 1,
    lastFed: new Date().toISOString(),
    feedWindowMinutes: 10 * 60 + 3
  })
  assert.equal(DS.nextFeedHint(s), "feed again tomorrow around 10:03")
})

test("nextFeedHint: not yet fed today", () => {
  const s = makeState({
    volume: 0.5, bubbles: 1,
    lastFed: new Date(Date.now() - DAY).toISOString(),
    feedWindowMinutes: 10 * 60 + 3
  })
  assert.equal(DS.nextFeedHint(s), "around 10:03")
})

test("statusText: fed today takes priority over inFeedWindow", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 1,
    lastFed: new Date().toISOString()
  }, feedWindowOffset(0)))
  assert.match(DS.statusText(s), /happy sourdough/)
})

// ── doughColorComponents (edge cases) ─────────────────────

test("doughColorComponents: darkness at 1.0 returns minimum RGB", () => {
  const c = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 0, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  }))
  assert.ok(c.r < 0.6, `r=${c.r}`)
  assert.ok(c.g < 0.5, `g=${c.g}`)
  assert.ok(c.b < 0.35, `b=${c.b}`)
  assert.equal(c.a, 1)
})

test("doughColorComponents: mid-range darkness produces intermediate color", () => {
  const c = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 0.5, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  }))
  assert.ok(c.r > 0.5 && c.r < 0.9, `r=${c.r}`)
  assert.ok(c.g > 0.4 && c.g < 0.85, `g=${c.g}`)
  assert.ok(c.b > 0.2 && c.b < 0.8, `b=${c.b}`)
  assert.equal(c.a, 1)
})

test("doughColorComponents: dark dough has higher R than B", () => {
  const c = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 0, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  }))
  assert.ok(c.r > c.b, `r=${c.r} should be > b=${c.b}`)
})

// ── doughColorComponents ───────────────────────────────────

test("doughColorComponents returns transparent when volume is 0", () => {
  const c = DS.doughColorComponents(makeState())
  assert.equal(c.a, 0)
})

test("doughColorComponents returns white for fresh dough", () => {
  const c = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 1, lastFed: new Date().toISOString(),
    created: daysAgoIso(7)
  }))
  assert.equal(c.r, 1)
  assert.equal(c.g, 1)
  assert.equal(c.b, 1)
  assert.equal(c.a, 1)
})

test("doughColorComponents darkens as darkness increases", () => {
  const light = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 1, lastFed: new Date().toISOString(), created: daysAgoIso(7)
  }))
  const dark = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 0.2, lastFed: new Date().toISOString(), created: daysAgoIso(7)
  }))
  assert.ok(dark.r < light.r)
  assert.ok(dark.g < light.g)
  assert.ok(dark.b < light.b)
})

test("doughColorComponents clamps at extremes", () => {
  const c = DS.doughColorComponents(makeState({
    volume: 0.5, bubbles: 0, lastFed: new Date().toISOString(), created: daysAgoIso(7)
  }))
  assert.ok(c.r >= 0 && c.r <= 1)
  assert.ok(c.g >= 0 && c.g <= 1)
  assert.ok(c.b >= 0 && c.b <= 1)
})

// ── lifecycle ──────────────────────────────────────────────

test("lifecycle: an empty jar is Empty", () => {
  assert.equal(DS.lifecycle(makeState({ volume: 0, bubbles: 1 })), "Empty")
})

test("lifecycle: a jar with dough and health is Alive", () => {
  assert.equal(DS.lifecycle(makeState({
    volume: 0.5,
    bubbles: 0.5,
    lastFed: new Date().toISOString()
  })), "Alive")
})

test("lifecycle: a jar with dough and no health is Dead", () => {
  assert.equal(DS.lifecycle(makeState({
    volume: 0.5,
    bubbles: 0,
    lastFed: new Date().toISOString()
  })), "Dead")
})

test("lifecycle: an empty jar with no health is still Empty, not Dead", () => {
  assert.equal(DS.lifecycle(makeState({ volume: 0, bubbles: 0 })), "Empty")
})

// ── feedCycle ──────────────────────────────────────────────

test("feedCycle: fed today is Fed", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.8, lastFed: new Date().toISOString()
  }, feedWindowOffset(0)))
  assert.equal(DS.feedCycle(s), "Fed")
})

test("feedCycle: not fed today and inside the window is Due", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.8, lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  }, feedWindowOffset(0)))
  assert.equal(DS.feedCycle(s), "Due")
})

test("feedCycle: past a day, outside the window, is Late", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.8, lastFed: new Date(Date.now() - 30 * HOUR).toISOString()
  }, feedWindowOffset(300)))
  assert.equal(DS.feedCycle(s), "Late")
})

test("feedCycle: within a day but outside the window is Rested", () => {
  const endOfYesterday = new Date()
  endOfYesterday.setHours(0, 0, 0, 0)
  endOfYesterday.setMinutes(-1)
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.8, lastFed: endOfYesterday.toISOString()
  }, feedWindowOffset(300)))
  assert.equal(DS.feedCycle(s), "Rested")
})

test("feedCycle: an empty jar has no feed cycle", () => {
  assert.equal(DS.feedCycle(makeState()), "None")
})

test("feedCycle: a dead jar has no feed cycle", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0, lastFed: new Date().toISOString()
  }, feedWindowOffset(0)))
  assert.equal(DS.feedCycle(s), "None")
})

// ── healthBand ─────────────────────────────────────────────

test("healthBand: names the four bands at their boundaries", () => {
  const band = (h) => DS.healthBand(makeState({
    volume: 0.5, bubbles: h, lastFed: new Date().toISOString()
  }))
  assert.equal(band(1), "Happy")
  assert.equal(band(0.7), "Happy")
  assert.equal(band(0.69), "Sluggish")
  assert.equal(band(0.4), "Sluggish")
  assert.equal(band(0.39), "Tired")
  assert.equal(band(0.2), "Tired")
  assert.equal(band(0.19), "Failing")
  assert.equal(band(0.01), "Failing")
})

test("healthBand: reads decayed health, not the stored bubbles", () => {
  const s = makeState({
    volume: 0.5,
    bubbles: 0.75,
    lastFed: new Date(Date.now() - 40 * HOUR).toISOString()
  })
  assert.ok(DS.health(s) < 0.7)
  assert.equal(DS.healthBand(s), "Sluggish")
})

// ── statusText priority over the three machines ────────────

test("statusText: Due outranks a failing health band", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0.1, lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  }, feedWindowOffset(0)))
  assert.equal(DS.feedCycle(s), "Due")
  assert.equal(DS.healthBand(s), "Failing")
  assert.match(DS.statusText(s), /feeding time/)
})

test("statusText: Dead outranks Due", () => {
  const s = makeState(Object.assign({
    volume: 0.5, bubbles: 0, lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  }, feedWindowOffset(0)))
  assert.equal(DS.lifecycle(s), "Dead")
  assert.match(DS.statusText(s), /died/)
})

test("statusText: Empty outranks everything", () => {
  const s = makeState(Object.assign({
    volume: 0, bubbles: 0, lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  }, feedWindowOffset(0)))
  assert.equal(DS.lifecycle(s), "Empty")
  assert.match(DS.statusText(s), /empty jar/)
})

test("statusText: Late reads hungry only in the Happy band", () => {
  const late = (bubbles) => makeState(Object.assign({
    volume: 0.5, bubbles: bubbles, lastFed: new Date(Date.now() - 30 * HOUR).toISOString()
  }, feedWindowOffset(300)))
  assert.equal(DS.feedCycle(late(0.9)), "Late")
  assert.match(DS.statusText(late(0.9)), /hungry/)
  assert.match(DS.statusText(late(0.5)), /sluggish/)
})

// ── one home for health ────────────────────────────────────

test("persistFields omits darkness", () => {
  const p = DS.persistFields(makeState({ volume: 0.5, bubbles: 0.4 }))
  assert.equal("darkness" in p, false)
  assert.equal(p.bubbles, 0.4)
})

test("writeHealth stores health in bubbles alone", () => {
  const s = makeState()
  DS.writeHealth(s, 0.35)
  assert.equal(s.bubbles, 0.35)
  assert.equal("darkness" in s, false)
})

test("a saved jar round-trips its health", () => {
  const s = DS.startJar(DS.defaultState())
  DS.writeHealth(s, 0.42)
  const back = DS.parseState(JSON.stringify(DS.persistFields(s)))
  almostEqual(DS.health(back), 0.42)
  assert.equal(DS.lifecycle(back), "Alive")
})

test("a saved dead jar reloads dead without a darkness field", () => {
  const s = DS.startJar(DS.defaultState())
  DS.writeHealth(s, 0)
  const back = DS.parseState(JSON.stringify(DS.persistFields(s)))
  assert.equal(DS.lifecycle(back), "Dead")
})

// ── loafSummary ────────────────────────────────────────────

function loaves(...qualities) {
  return qualities.map((q) => ({ bakedAt: new Date().toISOString(), quality: q }))
}

test("loafSummary: no loaves yet", () => {
  assert.equal(DS.loafSummary(makeState()), "none yet")
  assert.equal(DS.loafSummary(makeState({ loaves: [] })), "none yet")
})

test("loafSummary: one loaf is singular", () => {
  assert.equal(DS.loafSummary(makeState({ loaves: loaves(0.82) })), "1 loaf, avg quality 82%")
})

test("loafSummary: averages the qualities", () => {
  const s = makeState({ loaves: loaves(1, 0.9, 0.8, 0.7, 0.7) })
  assert.equal(DS.loafSummary(s), "5 loaves, avg quality 82%")
})

test("loafSummary: rounds the average to a whole percent", () => {
  assert.equal(DS.loafSummary(makeState({ loaves: loaves(0.5, 0.334) })), "2 loaves, avg quality 42%")
})

test("loafSummary: a loaf saved without a quality is counted but not averaged", () => {
  const s = makeState({ loaves: [{ bakedAt: new Date().toISOString() }, { quality: 0.6 }] })
  assert.equal(DS.loafSummary(s), "2 loaves, avg quality 60%")
})

test("loafSummary: loaves that are all unrated report no average", () => {
  const s = makeState({ loaves: [{ bakedAt: "x" }, { bakedAt: "y" }] })
  assert.equal(DS.loafSummary(s), "2 loaves")
})

test("canFeed: a dead starter cannot be fed back to life", () => {
  const s = neglectedJar(60, { bubbles: 0 })
  assert.equal(DS.lifecycle(s), "Dead")
  assert.equal(DS.canFeed(s), false)
  assert.equal(DS.feed(s), s)
})

test("canFeed: an empty jar cannot be fed", () => {
  assert.equal(DS.canFeed(makeState({ volume: 0 })), false)
})

test("nextFeedHint stays quiet when hooch, not the clock, blocks the feed", () => {
  const s = neglectedJar(66, { volume: 0.6 })
  assert.equal(DS.feedCycle(s), "Blocked")
  assert.equal(DS.nextFeedHint(s), "")
})

// ── hooch and pour ─────────────────────────────────────────

// Hooch accrues on the same clock as the decay, so a jar is described by how
// long it has gone unfed.
function neglectedJar(hoursUnfed, overrides = {}) {
  return makeState(Object.assign({
    volume: 0.5,
    bubbles: 0.5,
    created: daysAgoIso(10),
    lastFed: new Date(Date.now() - hoursUnfed * HOUR).toISOString()
  }, overrides))
}

test("hooch: a jar fed inside its window has thrown none", () => {
  assert.equal(DS.hooch(neglectedJar(2)), 0)
  assert.equal(DS.hooch(neglectedJar(26)), 0)
})

test("hooch: accrues once the feed is overdue", () => {
  almostEqual(DS.hooch(neglectedJar(36)), 0.1)
  almostEqual(DS.hooch(neglectedJar(46)), 0.2)
})

test("hooch: stops at the maximum", () => {
  almostEqual(DS.hooch(neglectedJar(66)), DS.HOOCH_MAX)
  almostEqual(DS.hooch(neglectedJar(500)), DS.HOOCH_MAX)
})

test("hooch: an empty jar throws none", () => {
  assert.equal(DS.hooch(neglectedJar(100, { volume: 0 })), 0)
})

test("canPour: any hooch at all is worth pouring", () => {
  assert.equal(DS.canPour(neglectedJar(30)), true)
  assert.equal(DS.canPour(neglectedJar(66)), true)
})

test("canPour: nothing to pour before the feed is overdue", () => {
  assert.equal(DS.canPour(neglectedJar(2)), false)
})

test("canPour: a dead starter is past pouring", () => {
  const s = neglectedJar(100, { bubbles: 0 })
  assert.equal(DS.lifecycle(s), "Dead")
  assert.equal(DS.canPour(s), false)
})

test("pour empties the hooch and frees the room it took", () => {
  const s = neglectedJar(66)
  almostEqual(DS.hooch(s), DS.HOOCH_MAX)
  const next = DS.pour(s)
  assert.equal(DS.hooch(next), 0)
})

test("pour adds no health and no volume", () => {
  const s = neglectedJar(40)
  const next = DS.pour(s)
  almostEqual(DS.health(next), DS.health(s))
  assert.equal(next.volume, s.volume)
})

test("pour does not count as a feed", () => {
  const s = neglectedJar(40)
  const next = DS.pour(s)
  assert.equal(next.lastFed, s.lastFed)
  assert.equal(DS.fedToday(next), false)
})

test("pouring twice does nothing the second time", () => {
  const once = DS.pour(neglectedJar(40))
  assert.equal(DS.canPour(once), false)
  assert.equal(DS.pour(once), once)
})

test("pour leaves a jar with no hooch alone", () => {
  const s = neglectedJar(2)
  assert.equal(DS.pour(s), s)
})

test("hooch keeps accruing after a pour, from the pour onwards", () => {
  const s = DS.pour(neglectedJar(100))
  s.pouredAt = new Date(Date.now() - 40 * HOUR).toISOString()
  almostEqual(DS.hooch(s), 0.14)
})

// ── a jar full of hooch has no room to feed ────────────────

test("hooch filling the last of the headroom blocks feeding", () => {
  const s = neglectedJar(66, Object.assign({ volume: 0.6 }, feedWindowOffset(0)))
  almostEqual(DS.hooch(s), 0.4)
  assert.equal(DS.canFeed(s), false)
})

test("a full jar with no hooch is still feedable", () => {
  const s = neglectedJar(25, Object.assign({ volume: 1 }, feedWindowOffset(0)))
  assert.equal(DS.hooch(s), 0)
  assert.equal(DS.canFeed(s), true)
})

test("pouring makes room to feed again", () => {
  const s = neglectedJar(66, Object.assign({ volume: 0.6 }, feedWindowOffset(0)))
  assert.equal(DS.canFeed(s), false)
  assert.equal(DS.canFeed(DS.pour(s)), true)
})

test("feedCycle reports a jar it cannot feed as Blocked", () => {
  const s = neglectedJar(66, { volume: 0.6 })
  assert.equal(DS.feedCycle(s), "Blocked")
})

test("statusText asks you to remove the hooch when the jar is full", () => {
  const s = neglectedJar(66, { volume: 0.6 })
  assert.match(DS.statusText(s), /remove/)
})

test("pouredAt is saved", () => {
  const s = DS.pour(neglectedJar(40))
  assert.equal(DS.persistFields(s).pouredAt, s.pouredAt)
})
