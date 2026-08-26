import { test } from "node:test"
import assert from "node:assert/strict"
import { loadLib } from "./loadLib.mjs"

const DS = loadLib("./DoughState.js", [
  "FEED_WINDOW_HOURS", "VOLUME_PER_FEED", "BUBBLES_PER_FEED",
  "BUBBLES_PER_SKIP", "DARKNESS_PER_SKIP", "DARKNESS_RECOVER",
  "DARKNESS_DEAD", "STREAK_WINDOW_DAYS", "STREAK_REQUIRED",
  "defaultState", "parseState", "clamp", "todayKey", "pad",
  "daysSince", "hoursSince", "inFeedWindow", "fedToday",
  "canFeed", "canStart", "canBake", "recentStreak",
  "feed", "startJar", "bake", "advanceDay", "isDead",
  "aliveText", "streakText", "statusText", "doughColorComponents"
])

const DAY = 86400000
const HOUR = 3600000

function makeState(overrides = {}) {
  return Object.assign(DS.defaultState(), overrides)
}

function feedDays(...daysAgo) {
  const now = Date.now()
  return daysAgo.map(d => new Date(now - d * DAY).toISOString().slice(0, 10))
}

// ── Constants ──────────────────────────────────────────────

test("constants match documented values", () => {
  assert.equal(DS.FEED_WINDOW_HOURS, 2)
  assert.equal(DS.VOLUME_PER_FEED, 0.12)
  assert.equal(DS.BUBBLES_PER_FEED, 0.15)
  assert.equal(DS.BUBBLES_PER_SKIP, 0.08)
  assert.equal(DS.DARKNESS_PER_SKIP, 0.04)
  assert.equal(DS.DARKNESS_RECOVER, 0.06)
  assert.equal(DS.DARKNESS_DEAD, 1.0)
  assert.equal(DS.STREAK_WINDOW_DAYS, 7)
  assert.equal(DS.STREAK_REQUIRED, 4)
})

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
  assert.equal(s.darkness, 0)
  assert.equal(s.baked, false)
  assert.equal(s.lastFed, null)
  assert.ok(s.created)
  assert.ok(Array.isArray(s.feedDays))
  assert.equal(s.feedDays.length, 0)
})

// ── parseState ─────────────────────────────────────────────

test("parseState round-trips valid JSON", () => {
  const input = JSON.stringify({
    created: "2025-01-15T10:00:00.000Z",
    lastFed: "2025-01-16T08:00:00.000Z",
    volume: 0.5, bubbles: 0.6, darkness: 0.1,
    baked: false, feedWindowHour: 8, feedDays: ["2025-01-16"]
  })
  const s = DS.parseState(input)
  assert.equal(s.volume, 0.5)
  assert.equal(s.bubbles, 0.6)
  assert.equal(s.darkness, 0.1)
  assert.equal(s.baked, false)
  assert.equal(s.feedWindowHour, 8)
  assert.deepEqual(s.feedDays, ["2025-01-16"])
})

test("parseState falls back to defaults on bad input", () => {
  for (const raw of ["", "{"]) {
    const s = DS.parseState(raw)
    assert.equal(s.volume, 0)
    assert.equal(s.baked, false)
  }
  // "null" parses to null, returned as-is
  assert.equal(DS.parseState("null"), null)
  // "[]" and "42" survive JSON.parse but produce non-object/primitive results
  // that are returned without default fields
  assert.equal(typeof DS.parseState("42"), "number")
  assert.ok(Array.isArray(DS.parseState("[]")))
})

test("parseState clamps out-of-range values", () => {
  const s = DS.parseState(JSON.stringify({ volume: 5, bubbles: -1, darkness: 99 }))
  assert.equal(s.volume, 1)
  assert.equal(s.bubbles, 0)
  assert.equal(s.darkness, 1)
})

test("parseState coerces non-numeric fields", () => {
  const s = DS.parseState(JSON.stringify({ volume: "abc", baked: "yes" }))
  assert.equal(s.volume, 0)
  assert.equal(s.baked, true)
})

test("parseState handles missing feedDays", () => {
  const s = DS.parseState(JSON.stringify({}))
  assert.deepEqual(s.feedDays, [])
})

// ── inFeedWindow ───────────────────────────────────────────

test("inFeedWindow returns true when current hour matches feedWindowHour", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: now.getHours(), baked: false })
  assert.equal(DS.inFeedWindow(s), true)
})

test("inFeedWindow returns false when outside the window", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: (now.getHours() + 5) % 24, baked: false })
  assert.equal(DS.inFeedWindow(s), false)
})

test("inFeedWindow wraps around midnight", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: (now.getHours() + 23) % 24, baked: false })
  // 23 hours away → 1 hour the other way → within window
  assert.equal(DS.inFeedWindow(s), true)
})

test("inFeedWindow returns false when baked", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: now.getHours(), baked: true })
  assert.equal(DS.inFeedWindow(s), false)
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

test("canFeed is true when not fed today and volume > 0", () => {
  const s = makeState({ volume: 0.5, lastFed: null })
  assert.equal(DS.canFeed(s), true)
})

test("canFeed is false when baked", () => {
  const s = makeState({ volume: 0.5, baked: true })
  assert.equal(DS.canFeed(s), false)
})

// ── canStart ───────────────────────────────────────────────

test("canStart is true when volume is 0 and not baked", () => {
  assert.equal(DS.canStart(makeState()), true)
})

test("canStart is false when volume > 0", () => {
  assert.equal(DS.canStart(makeState({ volume: 0.1 })), false)
})

test("canStart is false when baked", () => {
  assert.equal(DS.canStart(makeState({ baked: true })), false)
})

// ── recentStreak ───────────────────────────────────────────

test("recentStreak counts feed days within 7-day window", () => {
  const s = makeState({ feedDays: feedDays(0, 1, 2, 3) })
  assert.equal(DS.recentStreak(s), 4)
})

test("recentStreak ignores days older than 7 days", () => {
  const s = makeState({ feedDays: feedDays(0, 1, 8, 10) })
  assert.equal(DS.recentStreak(s), 2)
})

test("recentStreak returns 0 for empty feedDays", () => {
  assert.equal(DS.recentStreak(makeState()), 0)
})

// ── canBake ────────────────────────────────────────────────

test("canBake requires 4/7 streak", () => {
  const s = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2) })
  assert.equal(DS.canBake(s), false)
})

test("canBake is true with 4 feed days in window", () => {
  const s = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2, 3) })
  assert.equal(DS.canBake(s), true)
})

test("canBake is false when baked", () => {
  const s = makeState({ volume: 0.5, baked: true, feedDays: feedDays(0, 1, 2, 3) })
  assert.equal(DS.canBake(s), false)
})

test("canBake is false when volume is 0", () => {
  const s = makeState({ volume: 0, feedDays: feedDays(0, 1, 2, 3) })
  assert.equal(DS.canBake(s), false)
})

// ── feed ───────────────────────────────────────────────────

test("feed increases volume, bubbles, and recovers darkness", () => {
  const s = makeState({ volume: 0.3, bubbles: 0.2, darkness: 0.4, lastFed: null })
  const next = DS.feed(s)
  assert.equal(next.volume, 0.42)
  assert.equal(next.bubbles, 0.35)
  assert.equal(next.darkness, 0.34)
  assert.ok(next.lastFed)
})

test("feed clamps volume and bubbles to 1", () => {
  const s = makeState({ volume: 0.95, bubbles: 0.9, darkness: 0, lastFed: null })
  const next = DS.feed(s)
  assert.equal(next.volume, 1)
  assert.equal(next.bubbles, 1)
})

test("feed clamps darkness recovery to 0", () => {
  const s = makeState({ volume: 0.5, darkness: 0.02, lastFed: null })
  const next = DS.feed(s)
  assert.equal(next.darkness, 0)
})

test("feed adds today to feedDays", () => {
  const s = makeState({ volume: 0.5, lastFed: null })
  const next = DS.feed(s)
  assert.equal(next.feedDays.length, 1)
  assert.match(next.feedDays[0], /^\d{4}-\d{2}-\d{2}$/)
})

test("feed does not duplicate today in feedDays", () => {
  const s = makeState({ lastFed: null, feedDays: [DS.todayKey()] })
  const next = DS.feed(s)
  const todayMatches = next.feedDays.filter(d => d === DS.todayKey())
  assert.equal(todayMatches.length, 1)
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

test("startJar initializes a new starter", () => {
  const s = makeState({ volume: 0, darkness: 0.8 })
  const next = DS.startJar(s)
  assert.equal(next.volume, 0.1)
  assert.equal(next.bubbles, 0.1)
  assert.equal(next.darkness, 0)
  assert.equal(next.baked, false)
  assert.ok(next.created)
  assert.ok(next.lastFed)
  assert.equal(next.feedDays.length, 1)
  assert.match(next.feedDays[0], /^\d{4}-\d{2}-\d{2}$/)
})

test("startJar sets feedWindowHour to current hour", () => {
  const next = DS.startJar(makeState())
  assert.equal(next.feedWindowHour, new Date().getHours())
})

test("startJar does not mutate the original state", () => {
  const s = makeState({ volume: 0.5 })
  DS.startJar(s)
  assert.equal(s.volume, 0.5)
})

// ── bake ───────────────────────────────────────────────────

test("bake sets baked to true when streak is met", () => {
  const s = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2, 3) })
  const next = DS.bake(s)
  assert.equal(next.baked, true)
})

test("bake returns same reference when streak not met", () => {
  const s = makeState({ volume: 0.5, feedDays: feedDays(0, 1) })
  assert.equal(DS.bake(s), s)
})

test("bake does not mutate the original state", () => {
  const s = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2, 3) })
  DS.bake(s)
  assert.equal(s.baked, false)
})

// ── advanceDay ─────────────────────────────────────────────

test("advanceDay decreases bubbles and increases darkness", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.6, darkness: 0.2 })
  const next = DS.advanceDay(s)
  assert.equal(next.bubbles, 0.52)
  assert.ok(Math.abs(next.darkness - 0.24) < 1e-10, `darkness=${next.darkness}`)
})

test("advanceDay clamps bubbles to 0", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.03, darkness: 0.5 })
  const next = DS.advanceDay(s)
  assert.equal(next.bubbles, 0)
})

test("advanceDay clamps darkness to 1", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.5, darkness: 0.98 })
  const next = DS.advanceDay(s)
  assert.equal(next.darkness, 1)
})

test("advanceDay skips when volume is 0", () => {
  const s = makeState({ volume: 0, bubbles: 0.5, darkness: 0.2 })
  assert.equal(DS.advanceDay(s), s)
})

test("advanceDay skips when baked", () => {
  const s = makeState({ volume: 0.5, baked: true, bubbles: 0.5, darkness: 0.2 })
  assert.equal(DS.advanceDay(s), s)
})

test("advanceDay does not mutate the original state", () => {
  const s = makeState({ volume: 0.5, bubbles: 0.6, darkness: 0.2 })
  DS.advanceDay(s)
  assert.equal(s.bubbles, 0.6)
})

// ── isDead ─────────────────────────────────────────────────

test("isDead when darkness reaches 1.0 and volume > 0", () => {
  assert.equal(DS.isDead(makeState({ volume: 0.5, darkness: 1.0 })), true)
})

test("isDead is false when darkness < 1.0", () => {
  assert.equal(DS.isDead(makeState({ volume: 0.5, darkness: 0.99 })), false)
})

test("isDead is false when volume is 0", () => {
  assert.equal(DS.isDead(makeState({ volume: 0, darkness: 1.0 })), false)
})

test("isDead is false when baked", () => {
  assert.equal(DS.isDead(makeState({ volume: 0.5, darkness: 1.0, baked: true })), false)
})

// ── aliveText ──────────────────────────────────────────────

test("aliveText is empty when volume is 0", () => {
  assert.equal(DS.aliveText(makeState()), "")
})

test("aliveText says 'Born today' on day 0", () => {
  const s = makeState({ volume: 0.5, created: new Date().toISOString() })
  assert.equal(DS.aliveText(s), "Born today")
})

test("aliveText says '1 day old' on day 1", () => {
  const s = makeState({ volume: 0.5, created: new Date(Date.now() - DAY).toISOString() })
  assert.equal(DS.aliveText(s), "1 day old")
})

test("aliveText says 'N days old' for N >= 2", () => {
  const s = makeState({ volume: 0.5, created: new Date(Date.now() - 5 * DAY).toISOString() })
  assert.equal(DS.aliveText(s), "5 days old")
})

// ── streakText ─────────────────────────────────────────────

test("streakText shows count out of 7", () => {
  const s = makeState({ feedDays: feedDays(0, 1, 2) })
  assert.equal(DS.streakText(s), "3/7 feeds this week")
})

// ── statusText ─────────────────────────────────────────────

// Helper: create a state guaranteed to be outside the feed window
function outsideFeedWindow(overrides = {}) {
  const now = new Date()
  return makeState(Object.assign({
    feedWindowHour: (now.getHours() + 5) % 24
  }, overrides))
}

test("statusText: empty jar", () => {
  assert.match(DS.statusText(makeState()), /Empty jar/)
})

test("statusText: baked", () => {
  assert.match(DS.statusText(makeState({ volume: 0.5, baked: true })), /Baked/)
})

test("statusText: dead", () => {
  assert.match(DS.statusText(makeState({ volume: 0.5, darkness: 1.0 })), /died/)
})

test("statusText: time to feed (in window, not fed today)", () => {
  const now = new Date()
  const s = makeState({
    volume: 0.5,
    feedWindowHour: now.getHours(),
    lastFed: new Date(Date.now() - 2 * DAY).toISOString()
  })
  assert.match(DS.statusText(s), /Time to feed/)
})

test("statusText: fed today", () => {
  const s = makeState({ volume: 0.5, lastFed: new Date().toISOString() })
  assert.match(DS.statusText(s), /Fed today/)
})

test("statusText: hungry (> 24h since feed)", () => {
  const s = outsideFeedWindow({
    volume: 0.5,
    lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  })
  assert.match(DS.statusText(s), /Hungry/)
})

test("statusText: could use a feeding and happy starter are unreachable (fedToday precedes hours check)", () => {
  // These statuses require hoursSince(lastFed) in (0,24] with fedToday=false,
  // but fedToday is false only when lastFed is a different day (hoursSince >= 24).
  // The hours-based branches are dead code in the current priority chain.
  const s1 = outsideFeedWindow({
    volume: 0.5,
    lastFed: new Date(Date.now() - 25 * HOUR).toISOString()
  })
  assert.match(DS.statusText(s1), /Hungry/)

  const s2 = outsideFeedWindow({
    volume: 0.5,
    lastFed: new Date(Date.now() - 24.5 * HOUR).toISOString()
  })
  assert.match(DS.statusText(s2), /Hungry/)
})

// ── inFeedWindow (edge cases) ──────────────────────────────

test("inFeedWindow: diff exactly at FEED_WINDOW_HOURS is inside", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: (now.getHours() + DS.FEED_WINDOW_HOURS) % 24, baked: false })
  assert.equal(DS.inFeedWindow(s), true)
})

test("inFeedWindow: diff one over FEED_WINDOW_HOURS is outside", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: (now.getHours() + DS.FEED_WINDOW_HOURS + 1) % 24, baked: false })
  assert.equal(DS.inFeedWindow(s), false)
})

test("inFeedWindow: feedWindowHour equals current hour (diff=0) is inside", () => {
  const now = new Date()
  const s = makeState({ feedWindowHour: now.getHours(), baked: false })
  assert.equal(DS.inFeedWindow(s), true)
})

// ── feed (edge cases) ─────────────────────────────────────

test("feed preserves existing feedDays from prior days", () => {
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10)
  const s = makeState({ volume: 0.5, lastFed: null, feedDays: [yesterday] })
  const next = DS.feed(s)
  assert.equal(next.feedDays.length, 2)
  assert.ok(next.feedDays.includes(yesterday))
})

test("feed does not add a new entry when feedDays already contains today", () => {
  const today = DS.todayKey()
  const s = makeState({ volume: 0.5, lastFed: null, feedDays: [today] })
  const next = DS.feed(s)
  assert.equal(next.feedDays.length, 1)
})

// ── startJar (edge cases) ─────────────────────────────────

test("startJar resets a previously baked starter", () => {
  const s = makeState({ volume: 0.8, baked: true, darkness: 0.5, feedDays: feedDays(0, 1, 2) })
  const next = DS.startJar(s)
  assert.equal(next.baked, false)
  assert.equal(next.volume, 0.1)
  assert.equal(next.darkness, 0)
  assert.equal(next.feedDays.length, 1)
})

test("startJar resets a dead starter", () => {
  const s = makeState({ volume: 0.5, darkness: 1.0 })
  const next = DS.startJar(s)
  assert.equal(next.darkness, 0)
  assert.equal(next.baked, false)
})

// ── bake (edge cases) ─────────────────────────────────────

test("bake requires exactly STREAK_REQUIRED feed days", () => {
  const justBelow = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2) })
  assert.equal(DS.canBake(justBelow), false)

  const exactly = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2, 3) })
  assert.equal(DS.canBake(exactly), true)

  const above = makeState({ volume: 0.5, feedDays: feedDays(0, 1, 2, 3, 4) })
  assert.equal(DS.canBake(above), true)
})

test("bake works on a dead starter (canBake does not check isDead)", () => {
  const s = makeState({ volume: 0.5, darkness: 1.0, feedDays: feedDays(0, 1, 2, 3) })
  const next = DS.bake(s)
  assert.equal(next.baked, true)
})

// ── advanceDay (edge cases) ───────────────────────────────

test("advanceDay applied multiple times reaches death", () => {
  let s = makeState({ volume: 0.5, bubbles: 1.0, darkness: 0.0 })
  let steps = 0
  while (!DS.isDead(s) && steps < 100) {
    s = DS.advanceDay(s)
    steps++
  }
  assert.ok(DS.isDead(s))
  assert.ok(steps <= Math.ceil(1.0 / DS.DARKNESS_PER_SKIP))
})

test("advanceDay applied to max bubbles and zero darkness", () => {
  const s = makeState({ volume: 0.5, bubbles: 1.0, darkness: 0.0 })
  const next = DS.advanceDay(s)
  assert.equal(next.bubbles, 0.92)
  assert.ok(Math.abs(next.darkness - DS.DARKNESS_PER_SKIP) < 1e-10)
})

// ── isDead (edge cases) ───────────────────────────────────

test("isDead: darkness just below DARKNESS_DEAD is alive", () => {
  const s = makeState({ volume: 0.5, darkness: DS.DARKNESS_DEAD - 0.001 })
  assert.equal(DS.isDead(s), false)
})

// ── statusText (edge cases) ───────────────────────────────

test("statusText: baked takes priority over dead", () => {
  const s = makeState({ volume: 0.5, darkness: 1.0, baked: true })
  assert.match(DS.statusText(s), /Baked/)
})

test("statusText: fed today takes priority over inFeedWindow", () => {
  const now = new Date()
  const s = makeState({
    volume: 0.5,
    feedWindowHour: now.getHours(),
    lastFed: new Date().toISOString()
  })
  assert.match(DS.statusText(s), /Fed today/)
})

// ── doughColorComponents (edge cases) ─────────────────────

test("doughColorComponents: darkness at 1.0 returns minimum RGB", () => {
  const c = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 1.0 }))
  assert.ok(c.r < 0.6, `r=${c.r}`)
  assert.ok(c.g < 0.5, `g=${c.g}`)
  assert.ok(c.b < 0.3, `b=${c.b}`)
  assert.equal(c.a, 1)
})

test("doughColorComponents: mid-range darkness produces intermediate color", () => {
  const c = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 0.5 }))
  assert.ok(c.r > 0.5 && c.r < 0.9, `r=${c.r}`)
  assert.ok(c.g > 0.4 && c.g < 0.8, `g=${c.g}`)
  assert.ok(c.b > 0.2 && c.b < 0.6, `b=${c.b}`)
  assert.equal(c.a, 1)
})

test("doughColorComponents: fresh dough has higher R than B", () => {
  const c = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 0 }))
  assert.ok(c.r > c.b, `r=${c.r} should be > b=${c.b}`)
})

// ── doughColorComponents ───────────────────────────────────

test("doughColorComponents returns transparent when volume is 0", () => {
  const c = DS.doughColorComponents(makeState())
  assert.equal(c.a, 0)
})

test("doughColorComponents returns beige for fresh dough", () => {
  const c = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 0 }))
  assert.ok(c.r > 0.8, `r=${c.r}`)
  assert.ok(c.g > 0.7, `g=${c.g}`)
  assert.ok(c.b > 0.5, `b=${c.b}`)
  assert.equal(c.a, 1)
})

test("doughColorComponents darkens as darkness increases", () => {
  const light = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 0 }))
  const dark = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 0.8 }))
  assert.ok(dark.r < light.r)
  assert.ok(dark.g < light.g)
  assert.ok(dark.b < light.b)
})

test("doughColorComponents clamps at extremes", () => {
  const c = DS.doughColorComponents(makeState({ volume: 0.5, darkness: 1 }))
  assert.ok(c.r >= 0 && c.r <= 1)
  assert.ok(c.g >= 0 && c.g <= 1)
  assert.ok(c.b >= 0 && c.b <= 1)
})
