import QtQuick
import QtCore
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "DoughState.js" as DoughState

Panel {
  id: root
  moduleName: "vdsabev.omadough"
  ipcTarget: "vdsabev.omadough"

  property var dough: DoughState.defaultState()
  property string statusMsg: ""
  property int clock: 0

  readonly property bool verticalBar: bar ? bar.vertical : false
  readonly property color themeFg: bar ? bar.foreground : Color.foreground
  readonly property color themeBg: bar ? bar.background : Qt.rgba(0.05, 0.05, 0.07, 1)
  readonly property color themeAccent: Color.accent
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  implicitWidth: verticalBar ? Style.bar.iconSlot : 40
  implicitHeight: verticalBar ? 28 : (bar ? bar.barSize : 26)

  // StandardPaths and Qt.resolvedUrl both hand back file:// URLs; the helper
  // takes filesystem paths.
  function urlToPath(url) {
    return url.toString().replace(/^file:\/\//, "")
  }

  readonly property string statePath: root.urlToPath(StandardPaths.writableLocation(StandardPaths.HomeLocation)) + "/.config/omadough/state.json"
  readonly property string stateHelper: root.urlToPath(Qt.resolvedUrl("bin/omadough-state"))
  readonly property int stateMissing: 10

  // Queued state transitions, each state -> state. They are applied to whatever
  // the helper just read, never to root.dough, so a stale view cannot overwrite
  // a change made through the CLI in the meantime.
  property var pendingMutations: []
  property string errorMsg: ""

  function mutate(fn) {
    root.pendingMutations.push(fn)
    root.startRead()
  }

  // Writes only ever start from readProc.onExited, so a read can never overlap
  // one of our own writes and see stale bytes. Dropping a refresh while either
  // process runs costs nothing: a read in flight is about to publish the state,
  // and a write publishes what we already hold.
  function startRead() {
    if (readProc.running || writeProc.running)
      return
    readProc.exec(["python3", root.stateHelper, "read", root.statePath])
  }

  function writeState(state) {
    writeProc.payload = JSON.stringify(DoughState.persistFields(state), null, 2) + "\n"
    writeProc.stdinEnabled = true
    writeProc.exec(["python3", root.stateHelper, "write", root.statePath])
  }

  // The queued mutation is dropped rather than replayed: we do not know whether
  // a failed write landed, and re-feeding twice is worse than losing one click.
  function fail(msg) {
    root.pendingMutations = []
    root.errorMsg = msg
    root.statusMsg = msg
    retryTimer.restart()
  }

  function refreshStatus() {
    root.statusMsg = root.errorMsg || DoughState.statusText(root.dough)
  }

  // Only a successful read clears errorMsg, and the poll is hourly, so without
  // this a transient failure would pin the error and a stale jar for an hour.
  // The interval grows so a permanent failure stops costing a process a minute.
  Timer {
    id: retryTimer
    interval: 15000
    repeat: false
    // Backing off before the startRead guard can spend a step without an
    // attempt, which is fine: the process that blocked it is about to publish
    // state and clear the error, and the next failure re-arms the timer.
    onTriggered: {
      retryTimer.interval = Math.min(retryTimer.interval * 2, 900000)
      root.startRead()
    }
  }

  // Time-derived visuals only; no process, so this stays cheap.
  Timer {
    interval: 60000
    running: true
    repeat: true
    onTriggered: {
      root.clock++
      root.refreshStatus()
      root.checkReminder()
    }
  }

  Process {
    id: notifyProc
  }

  // The view can be an hour old, so the notification is posted from inside the
  // mutation, where the state has just been read back from disk.
  function checkReminder() {
    if (!DoughState.reminderDue(root.dough))
      return
    root.mutate(function(state) {
      if (!DoughState.reminderDue(state))
        return state
      notifyProc.exec(["notify-send", "-a", "Omadough", "Omadough", DoughState.reminderText(state)])
      return DoughState.markReminded(state)
    })
  }

  // Catches edits made by the CLI. Volume and health move by fractions of a
  // percent per hour, and every action re-reads first, so an hour is enough.
  // Deliberately not tied to hover: the icon and its tooltip would then spawn a
  // process every time the pointer crosses the bar.
  Timer {
    interval: 3600000
    running: true
    repeat: true
    onTriggered: root.startRead()
  }

  Timer {
    id: refreshTimer
    interval: 300000
    running: true
    repeat: true
    onTriggered: root.refreshStatus()
  }

  Process {
    id: readProc
    stdout: StdioCollector { waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(exitCode, exitStatus) {
      if (exitStatus !== 0 || (exitCode !== 0 && exitCode !== root.stateMissing)) {
        root.fail(stderr.text.trim() || "Omadough: cannot read state file — is python3 installed?")
        return
      }
      var fresh = exitCode === root.stateMissing
        ? DoughState.defaultState()
        : DoughState.parseState(stdout.text)
      var mutations = root.pendingMutations
      root.pendingMutations = []
      for (var i = 0; i < mutations.length; i++)
        fresh = mutations[i](fresh)
      root.errorMsg = ""
      retryTimer.stop()
      retryTimer.interval = 15000
      root.dough = fresh
      root.refreshStatus()
      if (mutations.length > 0 || exitCode === root.stateMissing)
        root.writeState(fresh)
    }
  }

  Process {
    id: writeProc
    property string payload: ""
    stderr: StdioCollector { waitForEnd: true }
    onStarted: {
      write(payload)
      stdinEnabled = false
    }
    onExited: function(exitCode, exitStatus) {
      if (exitStatus !== 0 || exitCode !== 0)
        root.fail(stderr.text.trim() || "Omadough: cannot write state file — is python3 installed?")
      if (root.pendingMutations.length > 0)
        root.startRead()
    }
  }

  // The hourly poll can leave the view an hour stale, so refresh at the moment
  // the user actually looks at the jar. The read is asynchronous, so the first
  // frame can still be stale; a button clicked in that frame is harmless
  // because every mutation re-reads first and the actions self-guard.
  onOpenedChanged: if (root.opened) root.startRead()

  Component.onCompleted: root.startRead()

  BarIconButton {
    id: hit
    anchors.fill: parent
    bar: root.bar
    tooltipText: root.statusMsg || "Omadough"

    iconComponent: Component {
      Jar {
        anchors.fill: parent
        volume: root.dough.volume
        bubbles: { root.clock; return DoughState.displayBubbles(root.dough) }
        hooch: { root.clock; return DoughState.hooch(root.dough) }
        rimColor: root.themeAccent
        doughColor: {
          root.clock
          var c = DoughState.doughColorComponents(root.dough)
          return Qt.rgba(c.r, c.g, c.b, c.a)
        }
      }
    }

    onPressed: function(button) {
      if (button === Qt.RightButton) {
        if (root.bar)
          root.bar.showTooltip(hit, root.statusMsg || "Omadough")
        return
      }
      root.toggle()
    }
  }

  JarPopup {
    id: popup
    anchorItem: hit
    bar: root.bar
    open: root.opened
    doughState: root.dough
    clock: root.clock
    statusMsg: root.statusMsg
    aliveMsg: DoughState.aliveText(root.dough)
    feedable: DoughState.canFeed(root.dough)
    bakeable: DoughState.canBake(root.dough)
    pourable: DoughState.canPour(root.dough)
    startable: DoughState.canStart(root.dough)
    dead: DoughState.isDead(root.dough)
    remindersOn: root.dough.remindersEnabled !== false
    onCloseRequested: root.close()
    onRemindersToggled: root.mutate(function(state) {
      return DoughState.setReminders(state, state.remindersEnabled === false)
    })
    onFeedRequested: root.mutate(DoughState.feed)
    onBakeRequested: root.mutate(DoughState.bake)
    onPourRequested: root.mutate(DoughState.pour)
    // startJar has no guard of its own, so re-check against the state on disk.
    onStartRequested: root.mutate(function(state) {
      return DoughState.canStart(state) || DoughState.isDead(state)
        ? DoughState.startJar(state)
        : state
    })
  }
}
