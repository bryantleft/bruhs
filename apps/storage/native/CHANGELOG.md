# Pith releases

The newest version comes first, and its number is the version the build stamps into Pith. Pith's update window shows each version's notes, so they follow its writing rules: sentences in paragraphs, with no bullets or dashes. `scripts/pith-release.mjs` refuses notes that don't.

## 0.3.0

Connect an assistant in Settings to ask what is worth cleaning up. Pith shares names, sizes and cleanup reasons within the folder you choose. The connection is read only, and proposed cleanup can be reviewed in Disk before anything moves.

CPU and memory readings refresh smoothly between app-list updates. Memory details expand when you need them, and the desktop interface fits larger text. Activity keeps its memory use steady during long sessions, and the network sampler releases each completed query.

Disk offers local cleanup and investigation tools, with clear estimates, coverage gaps and confirmation before changes. Administrator scans and APFS maintenance remain explicit actions.

Disk shows the icons macOS draws for what's on your disk, in the map, its lists and the path bar. Files show their kind's icon, and folders, apps and disks their own, as Finder shows them. A folder macOS protects shows a plain folder until Pith may read it.

One path bar over the map names the disk and each folder down to the one you're in. Its menu lists every disk with its free space, and Back, Forward and Enclosing Folder take you through the folders you've opened, from the Go menu too.

The map holds still as your disk changes. Blocks keep their places until a change would show, and a newer map waits while you click or read a block's card. An app, a Photos library or another package is one block, as Finder shows it as one item, and a double-click looks inside.

Places names where the space usually goes, such as the Photos library, Mail, Developer and the Trash, with how much each one holds. A map of a whole disk shows the space Pith couldn't measure as one block, and Where the space is says what's in it. While macOS asks whether Pith may read some folders, Disk says which, and that answering is enough.

You can select several items with Command-click, or with Shift and an arrow key, and move them to the Trash together. One Undo puts them all back.

## 0.2.0

Disk keeps itself current. Pith maps your startup disk once, the first time you open Disk, and from then on follows what changes, so the map is up to date whenever you look, with no scans.

Pith keeps the map between launches and catches up on what changed while it was closed in a few seconds. Once a day, on power, it checks every folder for changes macOS didn't report.

Choose Folder shows a folder on your startup disk at once, from the same map, and still scans a folder on another disk. The map shows what grew since the day before.

Without Full Disk Access, macOS asks about some folders as Pith maps the disk, such as Documents and other apps' data. The map shows the rest meanwhile and adds each folder once you answer.

## 0.1.0

The first public release. Pith shows CPU, memory and disk in the menu bar, every app's activity live and over the last ten minutes, and a map of what takes up space on your disk.

Pith updates itself from here on. It asks before it checks for updates, and you can change that in Settings.
