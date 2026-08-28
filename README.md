# Omadough

A time-realistic sourdough starter that lives in your [Omarchy](https://github.com/basecamp/omarchy) bar.

Feed it every day around the same time, watch the jar fill up and bubble when it's healthy. How much bread can you bake?

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
- Neglect your sourdough for too long and it may die!
- Bake once the dough ripens and is in good health. Baking takes out some of the volume.
- If you use up all the dough or it dies you have to start a new one!

You can also feed your jar from the terminal. After installing the plugin:

```bash
ln -sfn ~/.config/omarchy/plugins/vdsabev.omadough/bin/omadough ~/.local/bin/omadough
```

```bash
omadough           # status (volume, bubbles, health, loaf count)
omadough start     # when empty or dead
omadough feed
omadough bake
omadough help
```

State lives in `~/.config/omadough/state.json`. The bar re-reads it when you open the popup, hourly, and before every action it takes, so CLI and widget share one culture.

## Remove

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
- `node` — required for `omadough` on the console / SSH

## Tests

```bash
node --test DoughState.test.mjs
```

# TODO

## Feeding Reminder

- Reminds you at the perfect time to feed your sourdough
- Can be turned off from within the popup

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
