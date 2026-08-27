# OmàDough

A sourdough starter that lives in your [Omarchy](https://github.com/basecamp/omarchy) bar. Feed it daily, bake bread when it's ready.

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

### CLI

`node` must be on `PATH`. After the plugin is installed:

```bash
ln -sfn ~/.config/omarchy/plugins/vdsabev.omadough/bin/omadough ~/.local/bin/omadough
```

```bash
omadough           # status
omadough feed      # once per day
omadough start     # empty or dead jar
omadough bake
omadough help
```

The wrapper follows the symlink back to `omadough.mjs` in this plugin. Do not copy `bin/omadough` elsewhere without keeping the rest of the plugin next to it.

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
- `node` - required for `omadough` on the console / SSH

## Features

- A jar lives in the status bar. Volume, bubbles, and darkness follow the starter.
- Left click opens a popup: status, feed, start, or bake.
- Feed once per day. Timing relative to the last feed window changes how much health you get back. Off-schedule feeds still add volume.
- Start a jar when it's empty or dead. Bake when volume and bubbles are high enough.
- State: `~/.config/omadough/state.json`. The bar watches that file, so the CLI and the widget share one jar.

## File structure

- `manifest.json` - plugin contract (kind: bar-widget)
- `BarWidget.qml` - bar jar + popup (one Panel-rooted entry point)
- `Jar.qml` - jar drawing
- `JarPopup.qml` - feed / start / bake popup
- `DoughState.js` - feed window, health, persist rules
- `DoughState.test.mjs` - state tests
- `loadLib.mjs` - test helper that loads QML libraries into Node
- `omadough.mjs` - CLI
- `bin/omadough` - PATH wrapper for `omadough.mjs`

Tests run with `node --test DoughState.test.mjs`.
