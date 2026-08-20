# dock-files

[中文](README.md)

File-explorer plugin of the dock family: mounts a side-bar files panel that browses the active conversation's working directory (through its own `/wb-files` host route) and hands clicked files to the registered file viewer (e.g. dock-editor).

## Features

- **Directory tree browsing**: lazy recursive expansion, directory-first case-insensitive ordering (VSCode explorer order).
- **Session scoping**: every operation is bounded by the session working directory; paths are canonicalized with realpath and must stay inside the workspace, otherwise 403.
- **File opening**: clicking a file dispatches through `ctx.files.open` to the matching file viewer (floating window).
- **File-manager operations**: the context menu carries the usual actions — new file / new folder (auto-deduped names, dropping straight into inline rename), rename (inline editing, Enter commits / Esc cancels), copy / cut / paste (copy pastes repeatedly; cut items are dimmed and the clipboard clears on paste), delete (confirmed, recursive, never overwrites), copy path, refresh; right-clicking empty space offers root-level new / paste / refresh.
- **Context menu**: per-kind items for files, directories and the empty area; the menu pulls back inside the viewport when it would overflow.
- **File-domain service**: provides `ctx.files` (`open` / `registerFileViewer` / `registerFileIcon`); other plugins can register their own viewers (`exts` extension match or `default` fallback) and per-extension icons (`registerFileIcon`, one plugin may register several groups) with an `icon` (tint color + optional custom SVG glyph) that the explorer renders per extension, falling back to the built-in palette for unregistered types.

## Install

Requires the `dock` base plugin:

```sh
dsh plugin add github:AKS1st/dock
dsh plugin add github:AKS1st/dock-files
```

Pair it with viewer plugins: `dock-editor` (text), `dock-images` (images), `dock-markdown` (Markdown).

## Security

The host route only accepts POSTs from trusted origins (loopback / configured trustedHosts plus same-origin check), and every directory access is canonicalized with realpath and prefix-compared against the session workspace — `..` escapes, symlinks pointing outside the workspace and unrelated absolute paths are all rejected (403).

## License

MIT
