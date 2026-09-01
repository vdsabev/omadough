.pragma library

var FEED_WINDOW_HOURS = 2
var FEED_WINDOW_MINUTES = 120
var FEED_PERFECT_MINUTES = 30
var FEED_MODERATE_MINUTES = 60
var VOLUME_PER_FEED = 0.12
var BUBBLES_PER_FEED = 0.15
var DECAY_PER_HOUR = 0.005
var DARKNESS_DEAD = 1.0
var BAKE_MIN_BUBBLES = 0.3
var DEVELOPMENT_DAYS = 7
var HEALTH_HAPPY = 0.7
var HEALTH_SLUGGISH = 0.4
var HEALTH_TIRED = 0.2
// Hooch is a real substance, not a picture of health: it accrues on the same
// clock as the decay and takes up room in the jar.
var HOOCH_PER_HOUR = 0.01
var HOOCH_MAX = 0.4

function defaultState() {
  var now = new Date()
  return {
    created: now.toISOString(),
    lastFed: null,
    volume: 0,
    bubbles: 0,
    feedWindowHour: now.getHours(),
    feedWindowMinutes: now.getHours() * 60 + now.getMinutes(),
    pouredAt: null,
    loaves: []
  }
}

function persistFields(state) {
  return {
    created: state.created,
    lastFed: state.lastFed,
    volume: state.volume,
    bubbles: state.bubbles,
    feedWindowHour: state.feedWindowHour,
    feedWindowMinutes: state.feedWindowMinutes,
    pouredAt: state.pouredAt || null,
    loaves: state.loaves || []
  }
}

function parseState(raw) {
  var s
  try {
    s = JSON.parse(raw)
  } catch (e) {
    s = null
  }
  // Every consumer dereferences the result at once, so anything that is not a
  // state object resets the jar rather than being handed on.
  if (!s || typeof s !== "object" || Array.isArray(s))
    return defaultState()
  if (s.created) s.created = String(s.created)
  if (s.lastFed) s.lastFed = String(s.lastFed)
  s.pouredAt = s.pouredAt ? String(s.pouredAt) : null
  s.volume = clamp(Number(s.volume) || 0, 0, 1)
  s.bubbles = clamp(Number(s.bubbles) || 0, 0, 1)
  // Saves written before health lived in `bubbles` alone recorded death as a full
  // darkness bar or a `baked` flag. Both are read here and never written again.
  if (Number(s.darkness) >= DARKNESS_DEAD || s.baked === true)
    writeHealth(s, 0)
  delete s.darkness
  delete s.baked
  s.feedWindowHour = Number(s.feedWindowHour) || 0
  s.feedWindowMinutes = Number(s.feedWindowMinutes)
  if (isNaN(s.feedWindowMinutes))
    s.feedWindowMinutes = s.feedWindowHour * 60
  s.loaves = Array.isArray(s.loaves) ? s.loaves : []
  delete s.feedDays
  return s
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function developmentFactor(state) {
  var d = daysSince(state.created)
  if (d >= DEVELOPMENT_DAYS) return 1
  return (d + 1) / DEVELOPMENT_DAYS
}

function hoursOverdue(state) {
  if (!state.lastFed) return 0
  return Math.max(0, hoursSince(state.lastFed) - 24 - FEED_WINDOW_HOURS)
}

// Pouring restarts the hooch clock without counting as a feed, so the jar stops
// filling but the starter goes on starving.
function hoochClock(state) {
  var fed = state.lastFed ? new Date(state.lastFed).getTime() : 0
  var poured = state.pouredAt ? new Date(state.pouredAt).getTime() : 0
  return Math.max(fed, poured)
}

function hooch(state) {
  if (state.volume === 0) return 0
  var start = hoochClock(state)
  if (!start) return 0
  var hours = (nowMs() - start) / 3600000 - 24 - FEED_WINDOW_HOURS
  return clamp(hours * HOOCH_PER_HOUR, 0, HOOCH_MAX)
}

// A jar with room left can always take a feed; only hooch closes it off, so a
// jar filled to the brim with dough alone stays feedable.
function jarFull(state) {
  var h = hooch(state)
  return h > 0 && state.volume + h >= 1
}

function health(state) {
  return clamp(state.bubbles - hoursOverdue(state) * DECAY_PER_HOUR, 0, 1)
}

function displayBubbles(state) {
  return health(state) * developmentFactor(state)
}

function displayDarkness(state) {
  return (1 - health(state)) * developmentFactor(state)
}

function writeHealth(state, value) {
  state.bubbles = clamp(value, 0, 1)
}

function setFeedWindowNow(state, now) {
  state.feedWindowHour = now.getHours()
  state.feedWindowMinutes = now.getHours() * 60 + now.getMinutes()
}

function windowMinutes(state) {
  if (typeof state.feedWindowMinutes === "number" && !isNaN(state.feedWindowMinutes))
    return state.feedWindowMinutes
  return (Number(state.feedWindowHour) || 0) * 60
}

function minutesFromMidnight(d) {
  return d.getHours() * 60 + d.getMinutes()
}

function circularMinuteDiff(a, b) {
  var diff = Math.abs(a - b) % 1440
  if (diff > 720) diff = 1440 - diff
  return diff
}

function feedOffsetMinutes(state) {
  return circularMinuteDiff(minutesFromMidnight(new Date()), windowMinutes(state))
}

function feedQuality(state) {
  var m = feedOffsetMinutes(state)
  if (m <= FEED_PERFECT_MINUTES) return 1
  if (m <= FEED_MODERATE_MINUTES) return 0.5
  if (m <= FEED_WINDOW_MINUTES) return 0.25
  return 0
}

function nowMs() {
  return Date.now()
}

function todayKey() {
  var d = new Date()
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n
}

function daysSince(isoStr) {
  if (!isoStr) return 0
  var diff = nowMs() - new Date(isoStr).getTime()
  return Math.floor(diff / 86400000)
}

function hoursSince(isoStr) {
  if (!isoStr) return 999
  var diff = nowMs() - new Date(isoStr).getTime()
  return diff / 3600000
}

function inFeedWindow(state) {
  return feedOffsetMinutes(state) <= FEED_WINDOW_MINUTES
}

function fedToday(state) {
  if (!state.lastFed) return false
  var last = new Date(state.lastFed)
  var now = new Date()
  return last.getFullYear() === now.getFullYear()
    && last.getMonth() === now.getMonth()
    && last.getDate() === now.getDate()
}

// ── Feed cycle ────────────────────────────────────────────────────────────────
// Runs only while Alive. Feeding returns it to Fed; the clock carries it through
// Rested and Due, and past Due into Late.

function healthBand(state) {
  var h = health(state)
  if (h >= HEALTH_HAPPY) return "Happy"
  if (h >= HEALTH_SLUGGISH) return "Sluggish"
  if (h >= HEALTH_TIRED) return "Tired"
  return "Failing"
}

function feedCycle(state) {
  if (lifecycle(state) !== "Alive") return "None"
  if (fedToday(state)) return "Fed"
  if (jarFull(state)) return "Blocked"
  if (inFeedWindow(state)) return "Due"
  return hoursSince(state.lastFed) > 24 ? "Late" : "Rested"
}

function canFeed(state) {
  return lifecycle(state) === "Alive" && !fedToday(state) && !jarFull(state)
}

function canStart(state) {
  return state.volume === 0
}

function canBake(state) {
  if (state.volume < VOLUME_PER_FEED) return false
  if (isDead(state)) return false
  return displayBubbles(state) >= BAKE_MIN_BUBBLES
}

function feedButtonText(state) {
  if (!canFeed(state)) return "already fed"
  if (inFeedWindow(state)) return "feed now"
  return "feed"
}

function formatFeedClock(state) {
  var m = ((windowMinutes(state) % 1440) + 1440) % 1440
  return Math.floor(m / 60) + ":" + pad(m % 60)
}

function nextFeedHint(state) {
  if (lifecycle(state) !== "Alive") return ""
  var cycle = feedCycle(state)
  // A blocked feed is waiting on room, not on the clock, so naming a time reads
  // as though the jar were merely early.
  if (cycle === "Blocked") return ""
  var t = formatFeedClock(state)
  if (cycle === "Fed") return "feed again tomorrow around " + t
  return "around " + t
}

function feed(state) {
  if (!canFeed(state)) return state
  var quality = feedQuality(state)
  var h = health(state)
  var now = new Date()
  state = JSON.parse(JSON.stringify(state))
  state.lastFed = now.toISOString()
  state.volume = clamp(state.volume + VOLUME_PER_FEED, 0, 1)
  writeHealth(state, h + BUBBLES_PER_FEED * quality)
  setFeedWindowNow(state, now)
  return state
}

function startJar(state) {
  var now = new Date()
  state = JSON.parse(JSON.stringify(state))
  state.created = now.toISOString()
  state.lastFed = now.toISOString()
  state.volume = 0.1
  writeHealth(state, 1)
  setFeedWindowNow(state, now)
  state.pouredAt = null
  state.loaves = []
  return state
}

function bake(state) {
  if (!canBake(state)) return state
  var quality = health(state)
  state = JSON.parse(JSON.stringify(state))
  state.volume = clamp(state.volume - VOLUME_PER_FEED, 0, 1)
  if (!Array.isArray(state.loaves)) state.loaves = []
  state.loaves.push({
    bakedAt: new Date().toISOString(),
    quality: quality
  })
  return state
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
// Empty → Alive on startJar; Alive → Dead when health reaches zero. Dead is
// terminal: only startJar leaves it.

function lifecycle(state) {
  if (state.volume === 0) return "Empty"
  return health(state) <= 0 ? "Dead" : "Alive"
}

function canPour(state) {
  return lifecycle(state) === "Alive" && hooch(state) > 0
}

function pour(state) {
  if (!canPour(state)) return state
  state = JSON.parse(JSON.stringify(state))
  state.pouredAt = new Date().toISOString()
  return state
}

// Loaves from before quality was recorded still count, but an unrated loaf is
// left out of the average rather than dragged in as a zero.
function loafSummary(state) {
  var loaves = Array.isArray(state.loaves) ? state.loaves : []
  if (loaves.length === 0) return "none yet"
  var total = 0
  var rated = 0
  for (var i = 0; i < loaves.length; i++) {
    var q = Number(loaves[i].quality)
    if (q > 0) {
      total += q
      rated++
    }
  }
  var count = loaves.length + (loaves.length === 1 ? " loaf" : " loaves")
  if (rated === 0) return count
  return count + ", avg quality " + Math.round(total / rated * 100) + "%"
}

function isDead(state) {
  return lifecycle(state) === "Dead"
}

function aliveText(state) {
  if (state.volume === 0) return ""
  var days = daysSince(state.created)
  if (days === 0) return "today"
  if (days === 1) return "1 day ago"
  return days + " days ago"
}

function ripenessLabel(state) {
  if (state.volume === 0) return ""
  var d = daysSince(state.created)
  if (d >= DEVELOPMENT_DAYS) return ""
  return (d + 1) + "/" + DEVELOPMENT_DAYS
}

var BAND_TEXT = {
  Happy: "😊 happy sourdough!",
  Sluggish: "😐 a little sluggish…",
  Tired: "😩 looking tired…",
  Failing: "😫 hanging on by a thread…"
}

// Lifecycle first, then the feed cycle, then the health band: an urgent machine
// hides the calmer one below it.
function statusText(state) {
  var life = lifecycle(state)
  if (life === "Empty") return "🫙 empty jar - start your sourdough!"
  if (life === "Dead") return "💀 your sourdough has died - start over?"

  var cycle = feedCycle(state)
  var band = healthBand(state)
  if (cycle === "Blocked") return "🫗 jar full of hooch - remove it!"
  if (cycle === "Due") return "⏰ feeding time!"
  if (cycle === "Late" && band === "Happy") return "🍽 hungry - feed soon!"
  return BAND_TEXT[band]
}

function doughColorComponents(state) {
  if (state.volume === 0) return { r: 0, g: 0, b: 0, a: 0 }
  var d = displayDarkness(state)
  var r = 1 - d * 0.45
  var g = 1 - d * 0.55
  var b = 1 - d * 0.7
  return { r: clamp(r, 0, 1), g: clamp(g, 0, 1), b: clamp(b, 0, 1), a: 1 }
}
