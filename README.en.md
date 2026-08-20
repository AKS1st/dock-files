# dock-files

[中文](README.md)

File-explorer plugin of the dock family: mounts a side-bar files panel that browses the active conversation's working directory (through its own `/wb-files` host route) and hands clicked files to the registered file viewer (e.g. dock-editor).

## Features

- **Directory tree browsing**: lazy recursive expansion, directory-first case-insensitive ordering (VSCode explorer order).
- **Session scoping**: every operation is bounded by the session working directory; paths are canonicalized with realpath and must stay inside the workspace, otherwise 403.
- **File opening**: clicking a file dispatches through `ctx.files.open` to the matching file viewer (floating window).
- **File-manager operations**: the context menu carries the usual actions — new file / new folder (auto-deduped names, dropping straight into inline rename), rename (inline editing, Enter commits / Esc cancels), copy / cut / paste (copy pastes repeatedly; cut items are dimmed and the clipboard clears on paste), paste image (saves an image from the system clipboard as a file, e.g. `image.png`, auto-named and deduped by mime type; the menu item probes the clipboard and only shows when it actually holds an image), delete (confirmed, recursive, never overwrites), copy path, refresh; right-clicking empty space offers root-level new / paste / paste image / refresh.
- **Drag & drop**: drop OS files into the explorer to import copies into the target directory (original names, auto-deduped, never overwrites); drag entries inside the tree onto another directory (or the empty area = root) to move them — moving a directory onto itself or a descendant is rejected.
- **Paste local files**: after copying files in the OS, click the panel to focus it and press Ctrl+V to import them (the browser only exposes local file content through the paste event); the paste target is the last clicked/right-clicked directory, else the root.
- **Upload progress & serialization**: every transfer (drag-in, Ctrl+V paste, paste image) shows a 1px progress bar pinned to the panel's bottom edge; only one upload runs at a time — further upload attempts while one is in flight prompt "请等上一个上传任务完成" (please wait for the previous upload to finish).
- **Context menu**: per-kind items for files, directories and the empty area; the menu pulls back inside the viewport when it would overflow; confirmations and notices use a theme-matching in-app dialog.
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
