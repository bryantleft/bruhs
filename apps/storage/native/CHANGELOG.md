# Pith releases

The newest version comes first, and its number is the version the build stamps into Pith. Pith's update window shows each version's notes, so they follow its writing rules: sentences in paragraphs, with no bullets or dashes. `scripts/pith-release.mjs` refuses notes that don't.

## 0.2.0

Disk keeps itself current. Pith maps your startup disk once, the first time you open Disk, and from then on follows what changes, so the map is up to date whenever you look, with no scans.

Pith keeps the map between launches and catches up on what changed while it was closed in a few seconds. Once a day, on power, it checks every folder for changes macOS didn't report.

Choose Folder shows a folder on your startup disk at once, from the same map, and still scans a folder on another disk. The map shows what grew since the day before.

## 0.1.0

The first public release. Pith shows CPU, memory and disk in the menu bar, every app's activity live and over the last ten minutes, and a map of what takes up space on your disk.

Pith updates itself from here on. It asks before it checks for updates, and you can change that in Settings.
