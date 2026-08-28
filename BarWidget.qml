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
  property bool popupOpen: false
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
  // one of our own writes and see stale bytes.
  function startRead() {
    if (readProc.running || writeProc.running)
      return
    readProc.exec(["bash", root.stateHelper, "read", root.statePath])
  }

  function writeState(state) {
    writeProc.payload = JSON.stringify(DoughState.persistFields(state), null, 2) + "\n"
    writeProc.stdinEnabled = true
    writeProc.exec(["bash", root.stateHelper, "write", root.statePath])
  }

  function fail(msg) {
    root.pendingMutations = []
    root.errorMsg = msg
    root.statusMsg = msg
  }

  function refreshStatus() {
    root.statusMsg = root.errorMsg || DoughState.statusText(root.dough)
  }

  Timer {
    interval: 60000
    running: true
    repeat: true
    onTriggered: {
      root.clock++
      root.startRead()
      root.refreshStatus()
    }
  }

  Timer {
    id: dayCheckTimer
    interval: 300000
    running: true
    repeat: true
    property string lastDay: ""
    onTriggered: {
      var today = DoughState.todayKey()
      if (lastDay !== "" && lastDay !== today)
        root.mutate(DoughState.advanceDay)
      lastDay = today
      root.refreshStatus()
    }
  }

  Process {
    id: readProc
    stdout: StdioCollector { waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(exitCode, exitStatus) {
      if (exitStatus !== 0 || (exitCode !== 0 && exitCode !== root.stateMissing)) {
        root.fail(stderr.text.trim() || "Omadough: cannot read state file")
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
        root.fail(stderr.text.trim() || "Omadough: cannot write state file")
      if (root.pendingMutations.length > 0)
        root.startRead()
    }
  }

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
        darkness: { root.clock; return DoughState.displayDarkness(root.dough) }
        baked: root.dough.baked
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
    startable: DoughState.canStart(root.dough)
    dead: DoughState.isDead(root.dough)
    onCloseRequested: root.close()
    onFeedRequested: root.mutate(DoughState.feed)
    onBakeRequested: root.mutate(DoughState.bake)
    // startJar has no guard of its own, so re-check against the state on disk.
    onStartRequested: root.mutate(function(state) {
      return DoughState.canStart(state) || DoughState.isDead(state)
        ? DoughState.startJar(state)
        : state
    })
  }
}
