# TODO

## Vacation Mode

Put the starter in the fridge to keep it alive while away.

- Toggle fridge on/off from the popup
- While refrigerated, health reduces much more slowly when neglected
- Cannot refeed while in the fridge — you must take it out first
- Visual indicator on the jar (e.g., cold breath particles, blue tint)

## Baking Affects Volume

Baking bread takes away from the starter's volume.

- Baking reduces `volume` by a configurable amount
- Refeeding flour+water restores volume but reduces `bubbles`
- Darkness is **not** affected by refeeding after baking — you must keep feeding for bubbles to recover
- Minimum bubble threshold required to bake (e.g., `bubbles >= 0.3`)
- If bubbles are too low, the Bake button is disabled with a tooltip explaining why
