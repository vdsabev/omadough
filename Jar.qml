import QtQuick

// Mason jar: 12×18. Body walls on the outer columns; fill is 10×14.
Item {
  id: root

  property real volume: 0
  property real bubbles: 0
  property real darkness: 0
  property bool baked: false
  property color doughColor: Qt.rgba(1, 1, 1, 1)
  property color rimColor: "#ffe14d"

  implicitWidth: 40
  implicitHeight: 22

  readonly property int cols: 12
  readonly property int rows: 18
  readonly property int bodyTop: 3
  readonly property int bodyBottom: 16
  readonly property int fillMax: 14
  readonly property int fillUnits: 7
  readonly property int rowsPerUnit: 2
  readonly property int fillLeft: 1
  readonly property int fillWidth: 10

  readonly property real px: Math.max(1, Math.floor(Math.min(width / cols, height / rows)))

  readonly property var sprite: [
    "..LLLLLLLL..",
    ".LLLLLLLLLL.",
    ".G.LLLLLL.G.",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    "G..........G",
    ".GGGGGGGGGG."
  ]

  readonly property int fillRows: Math.round(Math.max(0, Math.min(1, volume)) * fillUnits) * rowsPerUnit
  readonly property int fillTop: bodyBottom + 1 - fillRows
  readonly property color glassColor: Qt.rgba(rimColor.r * 0.75, rimColor.g * 0.75, rimColor.b * 0.75, 1)
  readonly property color fillColor: baked ? Qt.rgba(0.65, 0.45, 0.2, 1) : doughColor
  readonly property color crustColor: Qt.rgba(0.28, 0.16, 0.08, 0.55 + darkness * 0.4)
  readonly property int crustRows: !baked && volume > 0 && darkness > 0
    ? Math.max(1, Math.round(darkness * 2))
    : 0
  readonly property int bubbleCount: volume > 0 ? Math.floor(bubbles * fillWidth) : 0

  function isInterior(col, row) {
    return sprite[row].charAt(col) === "." && row >= bodyTop && row <= bodyBottom && col >= fillLeft && col < fillLeft + fillWidth
  }

  function isBubble(col, row) {
    if (bubbleCount <= 0)
      return false
    var i
    for (i = 0; i < bubbleCount; i++) {
      var seed = i * 7 + 3
      var bc = fillLeft + (seed * 13 % fillWidth)
      var br = fillTop + (seed * 17 % Math.max(1, fillRows))
      if (br > bodyBottom)
        br = bodyBottom
      if (col === bc && row === br)
        return true
    }
    return false
  }

  function paint(col, row) {
    var code = sprite[row].charAt(col)
    if (code === "L")
      return rimColor
    if (code === "G")
      return glassColor
    if (fillRows > 0 && isInterior(col, row) && row >= fillTop && row <= bodyBottom) {
      if (isBubble(col, row))
        return Qt.rgba(1, 1, 1, 0.45)
      if (crustRows > 0 && row < fillTop + crustRows)
        return crustColor
      return fillColor
    }
    return "transparent"
  }

  Item {
    anchors.centerIn: parent
    width: root.px * root.cols
    height: root.px * root.rows

    Repeater {
      model: root.cols * root.rows

      Rectangle {
        required property int index
        readonly property int col: index % root.cols
        readonly property int row: Math.floor(index / root.cols)

        x: root.px * col
        y: root.px * row
        width: root.px
        height: root.px
        color: {
          root.volume; root.bubbles; root.darkness; root.baked
          root.doughColor; root.rimColor
          return root.paint(col, row)
        }
      }
    }
  }
}
