import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui

PanelWindow {
  id: root

  required property Item anchorItem
  required property QtObject bar
  property bool open: false
  property int contentWidth: Style.space(280)
  property int contentHeight: contentCol.implicitHeight + Style.space(40)
  property int padding: Style.spacing.popupPadding
  property int gap: Style.gapsOut

  // State passed in from BarWidget
  property var doughState: ({})
  property string statusMsg: ""
  property string aliveMsg: ""
  property string streakMsg: ""
  property bool feedable: false
  property bool bakeable: false
  property bool startable: false
  property bool dead: false
  property bool inWindow: false

  signal closeRequested()
  signal feedRequested()
  signal startRequested()
  signal bakeRequested()

  readonly property real titleBarHeight: closeButton.y + closeButton.height / 2 + Style.space(8)

  property int rounding: 0

  Process {
    command: ["hyprctl", "getoption", "decoration:rounding"]
    running: true
    stdout: StdioCollector {
      onStreamFinished: {
        var m = text.match(/int:\s*(\d+)/)
        if (m)
          root.rounding = parseInt(m[1], 10)
      }
    }
  }

  readonly property var anchorWindow: anchorItem ? anchorItem.QsWindow.window : null
  readonly property string barPos: bar ? bar.position : "top"
  readonly property bool barVertical: barPos === "left" || barPos === "right"
  readonly property real barThickness: anchorWindow
    ? (barVertical ? anchorWindow.width : anchorWindow.height)
    : 0
  readonly property point anchorPos: {
    anchorWatcher.transform
    if (!anchorItem || !anchorWindow)
      return Qt.point(0, 0)
    return anchorItem.mapToItem(anchorWindow.contentItem, 0, 0)
  }

  readonly property real barW: anchorWindow ? anchorWindow.width : screenW
  readonly property real barH: anchorWindow ? anchorWindow.height : 0
  readonly property real screenW: screen ? screen.width : 0
  readonly property real screenH: screen ? screen.height : 0
  readonly property real anchorW: anchorItem ? anchorItem.width : 0
  readonly property real anchorH: anchorItem ? anchorItem.height : 0

  function alignedStart(anchorStart, anchorLen, cardLen, screenLen) {
    var center = anchorStart + anchorLen / 2
    if (center < screenLen / 3)
      return anchorStart
    if (center > screenLen * 2 / 3)
      return anchorStart + anchorLen - cardLen
    return center - cardLen / 2
  }

  readonly property point cardOrigin: {
    if (!anchorItem || !bar) return Qt.point(gap, gap)
    var x = 0, y = 0
    if (barVertical) {
      x = barPos === "left" ? barW + gap : screenW - barW - contentWidth - gap
      y = alignedStart(anchorPos.y, anchorH, contentHeight, screenH)
    } else {
      x = alignedStart(anchorPos.x, anchorW, contentWidth, screenW)
      y = barPos === "top" ? barH + gap : screenH - barH - contentHeight - gap
    }
    x = Math.max(gap, Math.min(x, screenW - contentWidth - gap))
    y = Math.max(gap, Math.min(y, screenH - contentHeight - gap))
    return Qt.point(Math.round(x), Math.round(y))
  }

  screen: anchorWindow ? anchorWindow.screen : null
  visible: open
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore

  WlrLayershell.namespace: "omadough-panel"
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: open ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None

  anchors {
    top: true
    bottom: true
    left: true
    right: true
  }

  mask: Region {
    item: card
  }

  onVisibleChanged: {
    if (visible && keyCatcher)
      Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
  }

  TransformWatcher {
    id: anchorWatcher
    a: anchorWindow ? anchorWindow.contentItem : null
    b: anchorItem
  }

  BorderSurface {
    id: card
    x: root.cardOrigin.x
    y: root.cardOrigin.y
    width: root.contentWidth
    height: root.contentHeight + Math.max(card.contentTopInset, root.titleBarHeight)
    color: Color.popups.background
    borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))
    padding: root.padding
    radius: Style.cornerRadius

    Text {
      id: closeButton
      anchors.top: parent.top
      anchors.right: parent.right
      anchors.topMargin: Style.space(4)
      anchors.rightMargin: Style.space(4) + root.rounding * 0.5
      text: "\u00d7"
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.displayLarge
      opacity: closeMouse.containsMouse ? 1 : 0.5

      MouseArea {
        id: closeMouse
        anchors.fill: parent
        anchors.margins: -Style.space(6)
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.closeRequested()
      }
    }

    Text {
      anchors.verticalCenter: closeButton.verticalCenter
      anchors.left: parent.left
      anchors.leftMargin: Style.space(8) + root.rounding * 0.5
      text: "\ud83c\udf5e"
      font.pixelSize: Style.font.iconLarge
      color: Color.foreground
    }

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.closeRequested()
      onActivateRequested: root.closeRequested()

      Column {
        id: contentCol
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: Math.max(card.contentTopInset, root.titleBarHeight)
        width: parent.width - Style.space(16)
        spacing: Style.space(12)

        Jar {
          anchors.horizontalCenter: parent.horizontalCenter
          width: 64
          height: 80
          volume: root.doughState.volume || 0
          bubbles: root.doughState.bubbles || 0
          darkness: root.doughState.darkness || 0
          baked: root.doughState.baked || false
          doughColor: Color.accent
        }

        Text {
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          text: root.statusMsg
          color: root.feedable ? Color.accent : Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          text: root.aliveMsg
          visible: root.aliveMsg.length > 0
          color: Qt.darker(Color.foreground, 1.5)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          text: root.streakMsg
          visible: root.streakMsg.length > 0
          color: Qt.darker(Color.foreground, 1.5)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        // Volume bar
        Row {
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(6)
          visible: root.doughState.volume > 0

          Text {
            text: "Vol"
            color: Qt.darker(Color.foreground, 1.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            anchors.verticalCenter: parent.verticalCenter
          }

          Rectangle {
            width: 100
            height: 8
            radius: 4
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
            anchors.verticalCenter: parent.verticalCenter

            Rectangle {
              width: parent.width * (root.doughState.volume || 0)
              height: parent.height
              radius: parent.radius
              color: Color.accent
            }
          }
        }

        // Bubble bar
        Row {
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(6)
          visible: root.doughState.volume > 0

          Text {
            text: "Bub"
            color: Qt.darker(Color.foreground, 1.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            anchors.verticalCenter: parent.verticalCenter
          }

          Rectangle {
            width: 100
            height: 8
            radius: 4
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
            anchors.verticalCenter: parent.verticalCenter

            Rectangle {
              width: parent.width * (root.doughState.bubbles || 0)
              height: parent.height
              radius: parent.radius
              color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.7)
            }
          }
        }

        // Darkness bar
        Row {
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(6)
          visible: root.doughState.volume > 0 && !root.doughState.baked

          Text {
            text: "Drk"
            color: Qt.darker(Color.foreground, 1.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            anchors.verticalCenter: parent.verticalCenter
          }

          Rectangle {
            width: 100
            height: 8
            radius: 4
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
            anchors.verticalCenter: parent.verticalCenter

            Rectangle {
              width: parent.width * (root.doughState.darkness || 0)
              height: parent.height
              radius: parent.radius
              color: Qt.rgba(0.6, 0.3, 0.1, 1)
            }
          }
        }

        // Action buttons
        Rectangle {
          anchors.horizontalCenter: parent.horizontalCenter
          width: buttonRow.implicitWidth + Style.space(24)
          height: 36
          radius: Style.cornerRadius
          color: Color.accent
          visible: root.startable
          opacity: startMouse.containsMouse ? 0.85 : 1

          Text {
            id: buttonRow
            anchors.centerIn: parent
            text: "Start Jar"
            color: Color.background
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            font.weight: Font.DemiBold
          }

          MouseArea {
            id: startMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.startRequested()
          }
        }

        Rectangle {
          anchors.horizontalCenter: parent.horizontalCenter
          width: feedRow.implicitWidth + Style.space(24)
          height: 36
          radius: Style.cornerRadius
          color: root.feedable ? Color.accent : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
          visible: !root.startable && !root.bakeable && !root.dead && !root.doughState.baked
          opacity: root.feedable ? (feedMouse.containsMouse ? 0.85 : 1) : 0.5

          Text {
            id: feedRow
            anchors.centerIn: parent
            text: root.inWindow ? (root.feedable ? "Feed Now" : "Already fed") : "Not in feed window"
            color: root.feedable ? Color.background : Qt.darker(Color.foreground, 1.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            font.weight: Font.DemiBold
          }

          MouseArea {
            id: feedMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: root.feedable ? Qt.PointingHandCursor : Qt.ArrowCursor
            enabled: root.feedable
            onClicked: root.feedRequested()
          }
        }

        Rectangle {
          anchors.horizontalCenter: parent.horizontalCenter
          width: bakeRow.implicitWidth + Style.space(24)
          height: 36
          radius: Style.cornerRadius
          color: Color.accent
          visible: root.bakeable
          opacity: bakeMouse.containsMouse ? 0.85 : 1

          Text {
            id: bakeRow
            anchors.centerIn: parent
            text: "Bake Bread!"
            color: Color.background
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            font.weight: Font.DemiBold
          }

          MouseArea {
            id: bakeMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.bakeRequested()
          }
        }

        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          text: "Your starter died. Click to restart."
          visible: root.dead
          color: Color.accent
          font.family: Style.font.family
          font.pixelSize: Style.font.body

          MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.startRequested()
          }
        }
      }
    }
  }
}
