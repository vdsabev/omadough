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
    ".LLLLLLLLLL.",
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
  readonly property color bubbleColor: Qt.rgba(fillColor.r * 0.62, fillColor.g * 0.64, fillColor.b * 0.68, 1)
  readonly property color gasColor: bubbleColor
  readonly property color crustColor: Qt.rgba(0.28, 0.16, 0.08, 0.55 + darkness * 0.4)
  readonly property int crustRows: !baked && volume > 0 && darkness > 0
    ? Math.max(1, Math.round(darkness * 2))
    : 0
  readonly property int bubbleCount: volume > 0 && bubbles > 0
    ? Math.max(2, Math.floor(bubbles * fillWidth))
    : 0
  readonly property var gasFrames: [
    [[1, 3], [1, 4]], // peek out of the dough
    [[2, 2], [1, 3], [3, 3]], // small cap, one row up and one cell right
    [[1, 0], [0, 1], [2, 1], [1, 2]], // diamond
    [[2, 0], [1, 1], [1, 0], [2, 1]], // solid square, one cell up-right
    [[1, -1], [3, -1]], // two specks, one row above
    [[2, -2]], // leftover, one cell up
    [] // gone
  ]
  readonly property int gasMaxCells: 4
  readonly property bool gasOn: volume > 0 && bubbles > 0.05 && fillTop > bodyTop
  property int tick: 0
  readonly property int gasPhase: tick % 7
  readonly property int wobble: tick % 2
  // Frames use col 0..3 relative to origin; row is pinned so peek sits on the dough.
  property int gasRestCol: fillLeft + Math.floor((fillWidth - 5) / 2)
  property int gasRestRow: fillTop - 5

  function pickGasOrigin() {
    var cmin = fillLeft
    var cmax = fillLeft + fillWidth - 4
    if (cmax < cmin)
      cmax = cmin
    gasRestCol = cmin + Math.floor(Math.random() * (cmax - cmin + 1))
    // Peek cells are origin+3 and origin+4; keep the lower one on fillTop-1.
    gasRestRow = fillTop - 5
  }

  Timer {
    interval: 1000
    running: root.volume > 0 && (root.bubbleCount > 0 || root.gasOn)
    repeat: true
    onTriggered: {
      root.tick = (root.tick + 1) % 14
      if (root.gasPhase === 0)
        root.pickGasOrigin()
    }
  }

  onFillTopChanged: pickGasOrigin()
  Component.onCompleted: pickGasOrigin()

  function isInterior(col, row) {
    return sprite[row].charAt(col) === "." && row >= bodyTop && row <= bodyBottom && col >= fillLeft && col < fillLeft + fillWidth
  }

  function inFill(col, row) {
    return col >= fillLeft && col < fillLeft + fillWidth && row >= fillTop && row <= bodyBottom
  }

  function bubbleRestCol(i) {
    return fillLeft + ((i * 7 + 3) * 13 % fillWidth)
  }

  function bubbleRestRow(i) {
    var br = fillTop + ((i * 7 + 3) * 17 % Math.max(1, fillRows))
    if (br > bodyBottom)
      return bodyBottom
    return br
  }

  // Prefer down-right; if that leaves the dough, try the opposite diagonal, then the other two.
  function bubbleDelta(i) {
    if (!wobble)
      return [0, 0]
    var c = bubbleRestCol(i)
    var r = bubbleRestRow(i)
    var dirs = [[1, 1], [-1, -1], [1, -1], [-1, 1]]
    for (var d = 0; d < dirs.length; d++) {
      if (inFill(c + dirs[d][0], r + dirs[d][1]))
        return dirs[d]
    }
    return [0, 0]
  }

  function bubbleCol(i) {
    return bubbleRestCol(i) + bubbleDelta(i)[0]
  }

  function bubbleRow(i) {
    return bubbleRestRow(i) + bubbleDelta(i)[1]
  }

  function paint(col, row) {
    var code = sprite[row].charAt(col)
    if (code === "L")
      return rimColor
    if (code === "G")
      return glassColor
    if (fillRows > 0 && isInterior(col, row) && row >= fillTop && row <= bodyBottom) {
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

    Repeater {
      model: root.bubbleCount

      Rectangle {
        required property int index
        x: { root.wobble; return root.px * root.bubbleCol(index) }
        y: { root.wobble; return root.px * root.bubbleRow(index) }
        width: root.px
        height: root.px
        color: root.bubbleColor
      }
    }

    Repeater {
      model: root.gasOn ? root.gasMaxCells : 0

      Rectangle {
        required property int index
        x: {
          root.gasPhase
          var cells = root.gasFrames[root.gasPhase]
          if (index >= cells.length)
            return 0
          return root.px * (root.gasRestCol + cells[index][0])
        }
        y: {
          root.gasPhase
          var cells = root.gasFrames[root.gasPhase]
          if (index >= cells.length)
            return 0
          return root.px * (root.gasRestRow + cells[index][1])
        }
        width: root.px
        height: root.px
        color: root.gasColor
        visible: {
          root.gasPhase
          var cells = root.gasFrames[root.gasPhase]
          if (index >= cells.length)
            return false
          var ac = root.gasRestCol + cells[index][0]
          var ar = root.gasRestRow + cells[index][1]
          return root.isInterior(ac, ar) && ar < root.fillTop
        }
      }
    }
  }
}
