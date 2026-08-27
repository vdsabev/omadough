import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "DoughState.js" as DoughState

PanelWindow {
  id: root

  required property Item anchorItem
  required property QtObject bar
  property bool open: false
  property int contentWidth: contentRow.implicitWidth + Style.space(32)
  property int contentHeight: contentRow.implicitHeight + Style.space(40)
  property int padding: Style.spacing.popupPadding
  property int gap: Style.gapsOut

  // State passed in from BarWidget
  property var doughState: ({})
  property int clock: 0
  property string statusMsg: ""
  property string aliveMsg: ""
  property bool feedable: false
  property bool bakeable: false
  property bool startable: false
  property bool dead: false

  signal closeRequested()
  signal feedRequested()
  signal startRequested()
  signal bakeRequested()

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

  readonly property real cardW: contentWidth
  readonly property real cardH: contentHeight + (card ? card.contentTopInset : 0)

  readonly property point cardOrigin: {
    if (!anchorItem || !bar) return Qt.point(gap, gap)
    var x = 0, y = 0
    if (barVertical) {
      x = barPos === "left" ? barW + gap : screenW - barW - cardW - gap
      y = anchorPos.y + anchorH / 2 - cardH / 2
    } else if (barPos === "bottom") {
      x = anchorPos.x + anchorW / 2 - cardW / 2
      y = screenH - barH - cardH - gap
    } else {
      x = anchorPos.x + anchorW / 2 - cardW / 2
      y = barH + gap
    }
    x = Math.max(gap, Math.min(x, screenW - cardW - gap))
    y = Math.max(gap, Math.min(y, screenH - cardH - gap))
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

  HyprlandFocusGrab {
    active: root.open
    windows: root.anchorWindow ? [root, root.anchorWindow] : [root]
    onCleared: root.closeRequested()
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
    height: root.contentHeight + card.contentTopInset
    color: Color.popups.background
    borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))
    padding: root.padding
    radius: Style.cornerRadius

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.closeRequested()
      onActivateRequested: root.closeRequested()

      Row {
        id: contentRow
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: card.contentTopInset
        spacing: Style.space(16)
        layoutDirection: Qt.RightToLeft

        Jar {
          width: 96
          height: 144
          anchors.verticalCenter: parent.verticalCenter
          volume: root.doughState.volume || 0
          bubbles: { root.clock; return DoughState.displayBubbles(root.doughState) }
          darkness: { root.clock; return DoughState.displayDarkness(root.doughState) }
          baked: root.doughState.baked || false
          doughColor: {
            root.clock
            var c = DoughState.doughColorComponents(root.doughState)
            return Qt.rgba(c.r, c.g, c.b, c.a)
          }
        }

        Column {
          id: sideCol
          width: Style.space(200)
          spacing: Style.space(10)
          anchors.verticalCenter: parent.verticalCenter

          Text {
            width: parent.width
            text: root.statusMsg
            color: root.feedable ? Color.accent : Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            wrapMode: Text.WordWrap
          }

          GridLayout {
            width: parent.width
            columns: 2
            columnSpacing: Style.space(8)
            rowSpacing: Style.space(6)
            visible: root.doughState.volume > 0

            Text {
              Layout.row: 0
              Layout.column: 0
              visible: ripeText.text.length > 0
              text: "ripeness:"
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
            Text {
              id: ripeText
              Layout.row: 0
              Layout.column: 1
              Layout.fillWidth: true
              visible: text.length > 0
              text: {
                root.clock
                return DoughState.ripenessLabel(root.doughState)
              }
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }

            Text {
              Layout.row: 1
              Layout.column: 0
              text: "started:"
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
            Text {
              Layout.row: 1
              Layout.column: 1
              Layout.fillWidth: true
              text: {
                root.clock
                var days = DoughState.daysSince(root.doughState.created)
                if (days === 0) return "today"
                if (days === 1) return "1 day ago"
                return days + " days ago"
              }
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }

            Text {
              Layout.row: 2
              Layout.column: 0
              text: "health:"
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
              Layout.alignment: Qt.AlignVCenter
            }
            Rectangle {
              Layout.row: 2
              Layout.column: 1
              Layout.fillWidth: true
              Layout.preferredHeight: 8
              Layout.alignment: Qt.AlignVCenter
              color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)

              Rectangle {
                width: { root.clock; return Math.round(parent.width * DoughState.health(root.doughState) / 4) * 4 }
                height: parent.height
                color: Color.accent
              }
            }

            Text {
              Layout.row: 3
              Layout.column: 0
              text: "baked:"
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
            Text {
              Layout.row: 3
              Layout.column: 1
              Layout.fillWidth: true
              text: {
                var n = (root.doughState.loaves && root.doughState.loaves.length) || 0
                if (n === 1) return "1 loaf"
                return n + " loaves"
              }
              color: Qt.darker(Color.foreground, 1.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
          }

          Flow {
            width: parent.width
            spacing: Style.space(8)

            Rectangle {
              width: startLabel.implicitWidth + Style.space(24)
              height: 36
              radius: Style.cornerRadius
              color: Color.accent
              visible: root.startable
              opacity: startMouse.containsMouse ? 0.85 : 1

              Text {
                id: startLabel
                anchors.centerIn: parent
                text: "start jar"
                color: Color.background
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              MouseArea {
                id: startMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.startRequested()
              }
            }

            Column {
              spacing: Style.space(4)
              visible: DoughState.showFeed(root.doughState)

              Rectangle {
                width: feedLabel.implicitWidth + Style.space(24)
                height: 36
                radius: Style.cornerRadius
                visible: root.feedable
                color: Color.accent
                opacity: feedMouse.containsMouse ? 0.85 : 1

                Text {
                  id: feedLabel
                  anchors.centerIn: parent
                  text: DoughState.feedButtonText(root.doughState)
                  color: Color.background
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }

                MouseArea {
                  id: feedMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.feedRequested()
                }
              }

              Text {
                width: Math.min(sideCol.width, implicitWidth)
                wrapMode: Text.WordWrap
                text: DoughState.nextFeedHint(root.doughState)
                visible: text.length > 0
                color: Qt.darker(Color.foreground, 1.5)
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
              }
            }

            Rectangle {
              width: bakeLabel.implicitWidth + Style.space(24)
              height: 36
              radius: Style.cornerRadius
              color: Color.accent
              visible: root.bakeable
              opacity: bakeMouse.containsMouse ? 0.85 : 1

              Text {
                id: bakeLabel
                anchors.centerIn: parent
                text: "bake bread"
                color: Color.background
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              MouseArea {
                id: bakeMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.bakeRequested()
              }
            }
          }

          Text {
            width: parent.width
            text: "your starter died. click to restart."
            visible: root.dead
            wrapMode: Text.WordWrap
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
}
