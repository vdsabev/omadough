import QtQuick

Item {
  id: root

  property real volume: 0
  property real bubbles: 0
  property real darkness: 0
  property bool baked: false
  property color doughColor: Qt.rgba(0.85, 0.78, 0.55, 1)
  property color rimColor: "#ffe14d"

  implicitWidth: 36
  implicitHeight: 20

  readonly property real jarW: Math.min(width * 0.6, height * 1.2)
  readonly property real jarH: height * 0.85
  readonly property real rimH: height * 0.12
  readonly property real doughH: jarH * 0.85 * volume

  Item {
    anchors.centerIn: parent
    width: root.jarW
    height: root.jarH

    // Jar body
    Rectangle {
      id: jarBody
      anchors.bottom: parent.bottom
      width: parent.width
      height: parent.height - root.rimH
      color: "transparent"
      border.color: Qt.rgba(root.rimColor.r, root.rimColor.g, root.rimColor.b, 0.5)
      border.width: 1.5
      radius: 3
    }

    // Dough fill
    Rectangle {
      id: dough
      anchors.left: jarBody.left
      anchors.right: jarBody.right
      anchors.bottom: jarBody.bottom
      anchors.margins: 2
      height: root.doughH
      visible: root.volume > 0
      color: root.baked ? Qt.rgba(0.65, 0.45, 0.2, 1) : root.doughColor
      radius: 2
    }

    // Bubbles
    Repeater {
      model: root.volume > 0 ? Math.floor(root.bubbles * 12) : 0

      Rectangle {
        required property int index
        property real seed: index * 7 + 3

        x: jarBody.x + 3 + (seed * 13 % 20) / 20 * (jarBody.width - 8)
        y: jarBody.y + jarBody.height - root.doughH + 2
          + (seed * 17 % 20) / 20 * Math.max(0, root.doughH - 6)
        width: 2 + (seed % 3)
        height: width
        radius: width / 2
        color: Qt.rgba(1, 1, 1, 0.35)
      }
    }

    // Rim / lid
    Rectangle {
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.bottom: jarBody.top
      width: parent.width + 4
      height: root.rimH
      color: root.rimColor
      radius: 2
    }
  }
}
