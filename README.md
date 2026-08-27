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

You can also feed your jar from the terminal. `node` must be on `PATH`. After installing the plugin:

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

State lives in `~/.config/omadough/state.json`. The bar watches that file, so CLI and widget share one culture. Old saves that used darkness/baked load as dead.

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
- `node` — required for `omadough` on the console / SSH

## Tests

```bash
node --test DoughState.test.mjs
```
