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

  function persistState() {
    stateFile.setText(JSON.stringify(DoughState.persistFields(root.dough), null, 2))
  }

  function refreshStatus() {
    root.statusMsg = DoughState.statusText(root.dough)
  }

  Timer {
    interval: 60000
    running: true
    repeat: true
    onTriggered: {
      root.clock++
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
      if (lastDay !== "" && lastDay !== today) {
        var next = DoughState.advanceDay(root.dough)
        if (next !== root.dough) {
          root.dough = next
          root.persistState()
        }
      }
      lastDay = today
      root.refreshStatus()
    }
  }

  FileView {
    id: stateFile
    path: StandardPaths.writableLocation(StandardPaths.HomeLocation) + "/.config/omadough/state.json"
    blockLoading: true
    watchChanges: true
    onFileChanged: reload()
    onLoaded: {
      var s = DoughState.parseState(typeof text === "function" ? text() : text)
      root.dough = s
      root.refreshStatus()
    }
  }

  Process {
    id: ensureDir
    command: ["mkdir", "-p", StandardPaths.writableLocation(StandardPaths.HomeLocation) + "/.config/omadough"]
    running: true
    onExited: {
      if (!stateFile.loaded)
        stateFile.setText(JSON.stringify(DoughState.defaultState(), null, 2))
    }
  }

  BarIconButton {
    id: hit
    anchors.fill: parent
    bar: root.bar
    tooltipText: root.statusMsg || "OmàDough"

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
          root.bar.showTooltip(hit, root.statusMsg || "OmàDough")
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
    onFeedRequested: {
      root.dough = DoughState.feed(root.dough)
      root.persistState()
      root.refreshStatus()
    }
    onStartRequested: {
      root.dough = DoughState.startJar(root.dough)
      root.persistState()
      root.refreshStatus()
    }
    onBakeRequested: {
      root.dough = DoughState.bake(root.dough)
      root.persistState()
      root.refreshStatus()
    }
  }
}
