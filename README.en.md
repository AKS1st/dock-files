# dock-files

[中文](README.md)

File-explorer plugin of the dock family: mounts a side-bar files panel that browses the active conversation's working directory (through its own `/wb-files` host route) and hands clicked files to the registered file viewer (e.g. dock-editor).

## Features

- **Directory tree browsing**: lazy recursive expansion, directory-first case-insensitive ordering (VSCode explorer order).
- **Session scoping**: every operation is bounded by the session working directory; paths are canonicalized with realpath and must stay inside the workspace, otherwise 403.
- **File opening**: clicking a file dispatches through `ctx.files.open` to the matching file viewer (floating window).
- **Context menu**: refresh directory / copy path.
- **File-domain service**: provides `ctx.files` (`open` / `registerFileViewer`); other plugins can register their own viewers (`exts` extension match or `default` fallback).

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
