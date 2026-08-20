# dock-files

[English](README.en.md)

dock 系列的文件浏览插件：在侧边栏挂载文件面板，浏览当前会话工作目录（通过自己的 `/wb-files` 主机路由），点击文件交给已注册的文件查看器打开（如 dock-editor）。

## 功能

- **目录树浏览**：惰性递归展开，目录优先、大小写不敏感排序（VSCode 资源管理器顺序）。
- **会话隔离**：所有操作以会话工作目录为边界，路径经 realpath 规范化后必须位于会话工作区内，越界路径一律 403。
- **文件打开**：点击文件通过 `ctx.files.open` 分发给匹配的文件查看器（浮窗打开）。
- **上下文菜单**：刷新目录 / 复制路径。
- **文件域服务**：提供 `ctx.files`（`open` / `registerFileViewer`），其他插件可注册自己的查看器（`exts` 扩展名匹配或 `default` 兜底）。

## 安装

需要 `dock` 基础插件：

```sh
dsh plugin add github:AKS1st/dock
dsh plugin add github:AKS1st/dock-files
```

配合查看器插件使用：`dock-editor`（文本）、`dock-images`（图片）、`dock-markdown`（Markdown）。

## 安全

主机路由只接受来自受信任来源（回环地址 / 配置的 trustedHosts + 同源检查）的 POST 请求，且任何目录访问都会先做 realpath 规范化再与会话工作区做前缀比较——`..` 逃逸、指向工作区外的符号链接、无关绝对路径都会被拒绝（403）。

## License

MIT
