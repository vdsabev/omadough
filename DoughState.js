.pragma library

var FEED_WINDOW_HOURS = 2
var VOLUME_PER_FEED = 0.12
var BUBBLES_PER_FEED = 0.15
var BUBBLES_PER_SKIP = 0.08
var DARKNESS_PER_SKIP = 0.04
var DARKNESS_RECOVER = 0.06
var DARKNESS_DEAD = 1.0
var STREAK_WINDOW_DAYS = 7
var STREAK_REQUIRED = 4

function defaultState() {
  return {
    created: new Date().toISOString(),
    lastFed: null,
    volume: 0,
    bubbles: 0,
    darkness: 0,
    baked: false,
    feedWindowHour: new Date().getHours(),
    feedDays: []
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
  s.darkness = clamp(Number(s.darkness) || 0, 0, 1)
  s.baked = !!s.baked
  s.feedWindowHour = Number(s.feedWindowHour) || 0
  s.feedDays = Array.isArray(s.feedDays) ? s.feedDays : []
  return s
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
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
  if (state.baked) return false
  var now = new Date()
  var hour = now.getHours()
  var diff = Math.abs(hour - state.feedWindowHour)
  if (diff > 12) diff = 24 - diff
  return diff <= FEED_WINDOW_HOURS
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
  return !state.baked && !fedToday(state) && state.volume > 0
}

function canStart(state) {
  return state.volume === 0 && !state.baked
}

function canBake(state) {
  if (state.baked || state.volume === 0) return false
  return recentStreak(state) >= STREAK_REQUIRED
}

function recentStreak(state) {
  var cutoff = nowMs() - STREAK_WINDOW_DAYS * 86400000
  var count = 0
  for (var i = 0; i < state.feedDays.length; i++) {
    var t = new Date(state.feedDays[i]).getTime()
    if (t >= cutoff) count++
  }
  return count
}

function feed(state) {
  if (!canFeed(state)) return state
  state = JSON.parse(JSON.stringify(state))
  state.lastFed = new Date().toISOString()
  state.volume = clamp(state.volume + VOLUME_PER_FEED, 0, 1)
  state.bubbles = clamp(state.bubbles + BUBBLES_PER_FEED, 0, 1)
  state.darkness = clamp(state.darkness - DARKNESS_RECOVER, 0, 1)
  var key = todayKey()
  if (state.feedDays.indexOf(key) === -1)
    state.feedDays.push(key)
  return state
}

function startJar(state) {
  state = JSON.parse(JSON.stringify(state))
  state.created = new Date().toISOString()
  state.lastFed = new Date().toISOString()
  state.volume = 0.1
  state.bubbles = 0.1
  state.darkness = 0
  state.baked = false
  state.feedWindowHour = new Date().getHours()
  state.feedDays = [todayKey()]
  return state
}

function bake(state) {
  if (!canBake(state)) return state
  state = JSON.parse(JSON.stringify(state))
  state.baked = true
  return state
}

function advanceDay(state) {
  if (state.volume === 0 || state.baked) return state
  state = JSON.parse(JSON.stringify(state))
  state.bubbles = clamp(state.bubbles - BUBBLES_PER_SKIP, 0, 1)
  state.darkness = clamp(state.darkness + DARKNESS_PER_SKIP, 0, 1)
  return state
}

function isDead(state) {
  return state.volume > 0 && !state.baked && state.darkness >= DARKNESS_DEAD
}

function aliveText(state) {
  if (state.volume === 0) return ""
  var days = daysSince(state.created)
  if (days === 0) return "Born today"
  if (days === 1) return "1 day old"
  return days + " days old"
}

function streakText(state) {
  var s = recentStreak(state)
  return s + "/" + STREAK_WINDOW_DAYS + " feeds this week"
}

function statusText(state) {
  if (state.volume === 0) return "Empty jar — start your starter!"
  if (state.baked) return "Baked into bread!"
  if (isDead(state)) return "Your starter has died. Start over."
  if (inFeedWindow(state) && !fedToday(state)) return "Time to feed!"
  if (fedToday(state)) return "Fed today \u2713"
  var hours = hoursSince(state.lastFed)
  if (hours > 24) return "Hungry! Feed soon."
  if (hours > 12) return "Could use a feeding."
  return "Happy starter"
}

function doughColorComponents(state) {
  if (state.volume === 0) return { r: 0, g: 0, b: 0, a: 0 }
  var r = 0.85 - state.darkness * 0.3
  var g = 0.78 - state.darkness * 0.35
  var b = 0.55 - state.darkness * 0.3
  return { r: clamp(r, 0, 1), g: clamp(g, 0, 1), b: clamp(b, 0, 1), a: 1 }
}
