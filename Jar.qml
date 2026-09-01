import QtQuick
import "JarSprite.js" as JarSprite

// Mason jar. The sprite maths live in JarSprite.js so the console sim draws the
// same jar; this file only turns cells into Rectangles.
Item {
  id: root

  property real volume: 0
  property real bubbles: 0
  property real hooch: 0
  property color doughColor: Qt.rgba(1, 1, 1, 1)
  property color rimColor: "#ffe14d"

  implicitWidth: 40
  implicitHeight: 22

  readonly property int cols: JarSprite.COLS
  readonly property int rows: JarSprite.ROWS
  readonly property real px: Math.max(1, Math.floor(Math.min(width / cols, height / rows)))

  // Two layers on two clocks: the body follows the dough, the fizz follows the
  // tick below. Binding the body to the tick would repaint 216 cells a second.
  readonly property var geom: JarSprite.geometry(volume, bubbles, hooch)
  readonly property var bodyGrid: JarSprite.body(geom, doughColor, rimColor)
  readonly property color fizzColor: {
    var c = JarSprite.fizzColor(doughColor)
    return Qt.rgba(c.r, c.g, c.b, c.a)
  }

  // Assigned once, then mutated in place: a binding would reseat every bubble
  // each time the dough changes.
  property var fizz: null
  property int fizzGen: 0
  readonly property var gas: {
    fizzGen
    return fizz ? JarSprite.gasCells(fizz, geom) : []
  }

  function advanceFizz() {
    if (!fizz)
      fizz = JarSprite.newFizz(geom)
    else
      JarSprite.stepFizz(fizz, geom)
    fizzGen++
  }

  Component.onCompleted: advanceFizz()
  onGeomChanged: advanceFizz()

  Timer {
    interval: 1000
    running: root.geom.bubbleCount > 0
    repeat: true
    onTriggered: root.advanceFizz()
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
        readonly property var cell: root.bodyGrid[row][col]

        x: root.px * col
        y: root.px * row
        width: root.px
        height: root.px
        color: cell ? Qt.rgba(cell.r, cell.g, cell.b, cell.a) : "transparent"
      }
    }

    Repeater {
      model: root.geom.bubbleCount

      Rectangle {
        required property int index
        readonly property var cell: {
          root.fizzGen
          return root.fizz ? root.fizz.bubbles[index] : null
        }

        x: root.px * (cell ? cell[0] : 0)
        y: root.px * (cell ? cell[1] : 0)
        width: root.px
        height: root.px
        color: root.fizzColor
        visible: !!cell
      }
    }

    Repeater {
      model: JarSprite.GAS_MAX_CELLS

      Rectangle {
        required property int index
        readonly property var cell: root.gas[index]

        x: root.px * (cell ? cell[0] : 0)
        y: root.px * (cell ? cell[1] : 0)
        width: root.px
        height: root.px
        color: root.fizzColor
        visible: !!cell
      }
    }
  }
}
