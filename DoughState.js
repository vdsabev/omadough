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

function defaultState() {
  var now = new Date()
  return {
    created: now.toISOString(),
    lastFed: null,
    volume: 0,
    bubbles: 0,
    darkness: 0,
    baked: false,
    feedWindowHour: now.getHours(),
    feedWindowMinutes: now.getHours() * 60 + now.getMinutes(),
    loaves: []
  }
}

function persistFields(state) {
  return {
    created: state.created,
    lastFed: state.lastFed,
    volume: state.volume,
    bubbles: state.bubbles,
    darkness: state.darkness,
    feedWindowHour: state.feedWindowHour,
    feedWindowMinutes: state.feedWindowMinutes,
    loaves: state.loaves || []
  }
}

function parseState(raw) {
  var s = defaultState()
  try {
    s = JSON.parse(raw)
  } catch (e) {
    return s
  }
  if (!s || typeof s !== "object")
    return s
  if (s.created) s.created = String(s.created)
  if (s.lastFed) s.lastFed = String(s.lastFed)
  s.volume = clamp(Number(s.volume) || 0, 0, 1)
  s.bubbles = clamp(Number(s.bubbles) || 0, 0, 1)
  var legacyDead = Number(s.darkness) >= DARKNESS_DEAD || s.baked === true
  if (legacyDead)
    writeHealth(s, 0)
  else
    s.darkness = 1 - s.bubbles
  s.baked = false
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
  state.darkness = 1 - state.bubbles
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

function canFeed(state) {
  return !fedToday(state) && state.volume > 0
}

function canStart(state) {
  return state.volume === 0
}

function canBake(state) {
  if (state.volume < VOLUME_PER_FEED) return false
  if (isDead(state)) return false
  return displayBubbles(state) >= BAKE_MIN_BUBBLES
}

function showFeed(state) {
  return !canStart(state) && !isDead(state)
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
  if (state.volume === 0 || isDead(state)) return ""
  var t = formatFeedClock(state)
  if (fedToday(state)) return "feed again tomorrow around " + t
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
  state.baked = false
  setFeedWindowNow(state, now)
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

function advanceDay(state) {
  return state
}

function isDead(state) {
  return state.volume > 0 && health(state) <= 0
}

function aliveText(state) {
  if (state.volume === 0) return ""
  var days = daysSince(state.created)
  if (days === 0) return "started: today"
  if (days === 1) return "1 day old"
  return days + " days old"
}

function ripenessLabel(state) {
  if (state.volume === 0) return ""
  var d = daysSince(state.created)
  if (d >= DEVELOPMENT_DAYS) return ""
  return (d + 1) + "/" + DEVELOPMENT_DAYS
}

function statusText(state) {
  if (state.volume === 0) {
    return "🫙 empty jar - start your sourdough!"
  }

  if (isDead(state)) {
    return "💀 your sourdough has died - start over?"
  }

  if (inFeedWindow(state) && !fedToday(state)) {
    return "⏰ feeding time!"
  }

  var hours = hoursSince(state.lastFed)
  if (hours > 24) {
    return "🍽 hungry - feed soon!"
  }

  if (hours > 12) {
    return "🫧 could use a feeding…"
  }

  return "🫧 happy sourdough!"
}

function doughColorComponents(state) {
  if (state.volume === 0) return { r: 0, g: 0, b: 0, a: 0 }
  var d = displayDarkness(state)
  var r = 1 - d * 0.45
  var g = 1 - d * 0.55
  var b = 1 - d * 0.7
  return { r: clamp(r, 0, 1), g: clamp(g, 0, 1), b: clamp(b, 0, 1), a: 1 }
}
