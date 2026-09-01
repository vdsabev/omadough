# Omadough

A time-realistic sourdough starter that lives in your [Omarchy](https://github.com/basecamp/omarchy) bar.

Feed it every day around the same time, watch the jar fill up and bubble when it's healthy. How much bread can you bake?

Algorithm devised by my wife.

## Install

```bash
omarchy plugin add git@github.com:vdsabev/omadough.git --enable --yes
omarchy plugin enable vdsabev.omadough --section right
```

Or clone the repo at `~/.config/omarchy/plugins/vdsabev.omadough/` and run:

```bash
omarchy-shell shell rescanPlugins
omarchy plugin enable vdsabev.omadough
```

## Care and feeding

- Start your sourdough.
- Feed once per day around the same time to maintain optimal health.
- A starved starter produces **hooch**, a dark liquid that settles on top of the dough.
- A reminder 30 minutes before feeding time, when the window for a perfect feed opens. Switch it off in the popup.
- Neglect your sourdough for too long and it may die!
- Bake bread once the dough ripens and is in good health. Baking takes out some of the volume.
- If you use up all the dough or it dies you have to start a new one!

You can also feed your jar from the terminal. After installing the plugin:

```bash
ln -sfn ~/.config/omarchy/plugins/vdsabev.omadough/bin/omadough ~/.local/bin/omadough
```

```bash
omadough           # status (volume, hooch, bubbles, health, loaves)
omadough start     # when empty or dead
omadough feed
omadough remove    # remove the hooch to make room
omadough bake
omadough help
```

State lives in `~/.config/omadough/state.json`. The bar re-reads it when you open the popup, hourly, and before every action it takes, so CLI and widget share one culture. Culture - get it? 🤓

## Simulator

Travel in time to simulate different states of the starter. `sim.mjs` draws the same sprite the widget does in a console, animated, in half-block colour, on a throwaway jar of its own — it never touches your actual starter.

```bash
node sim.mjs            # interactive
node sim.mjs grid       # every volume against every health, side by side
node sim.mjs ascii      # one frame, no colour
```

```
s start   f feed   b bake   p remove hooch   m reminder   r reset
n/N day ±   t/T hour ±
h/H health ±   v/V volume ±
```

## Uninstall

```bash
omarchy plugin disable vdsabev.omadough
omarchy plugin remove vdsabev.omadough
```

Unlink the CLI if you installed it:

```bash
rm ~/.local/bin/omadough
```

## Dependencies

- Omarchy Quattro (`omarchy-shell` / Quickshell)
- `python3` — the widget and the CLI both read and write the state file through `bin/omadough-state`
- `node` — required for `omadough` on the console
- `notify-send` (libnotify) — required for the feeding reminder

## Tests

```bash
node --test
```

# TODO

## Vacation Mode

Put the starter in the fridge to keep it alive while you're away for a longer stretch of time.

- Only once your sourdough is ripe
- Toggle fridge on/off from the popup
- While refrigerated, health reduces much more slowly when neglected
- Cannot refeed while in the fridge — you must take it out first, and can't put it back in the fridge for a week
- Visual indicator on the jar:
	- no gas
	- no bubble movement
	- ice particles
	- blue tint
