# 大文件传输、全局任务中心与文件下载实施计划

## Goal

修复 dock-files 大文件上传在中途卡住的问题，并建立跨工作区共享的内存传输任务中心，随后支持文件右键下载。任务在页面重启后消失；清理历史任务只清理记录，不删除文件。

## Architecture

- Host `src/index.ts`：保留 `/wb-files` 信任边界和工作区路径校验；新增分块上传生命周期接口与流式下载接口。
- Client `src/client/transferStore.ts`：唯一的全局内存任务状态源，管理上传/下载任务、订阅、暂停、继续、取消、历史清除和总进度。
- Client `src/client/TransferView.tsx`：独立浮动任务窗口。
- Client `src/client/ExplorerView.tsx`：调用任务仓库，右键触发下载，底部显示全局总进度，保留现有文件树。
- Client `src/client/index.ts`：注册任务浮窗和状态栏传输入口，并向 Explorer 注入共享入口。
- Client `src/client/styles.ts` / `i18n.ts`：新增任务中心、传输按钮和状态文案。

## Tech Stack

TypeScript、React 18、浏览器 Fetch/XHR、Node.js `fs/promises`、现有 Cordis workbench contract。TDD Route 为 off；采用实现后 focused regression 和 TypeScript/build 验证，不要求严格 RED/GREEN。

## Baseline/Authority Refs

- `src/index.ts:41-65`：当前 64 MiB JSON 请求体限制和整体读入逻辑。
- `src/index.ts:413-433`：当前 Base64 上传写文件逻辑。
- `src/client/ExplorerView.tsx:146-175,476-523`：当前 XHR + 完整 Base64 上传管线。
- `src/client/contract.ts:215-290`：workbench 浮窗、状态栏和视图注册契约。
- `src/client/index.ts:271-288`：现有 panel/activity 注册模式。
- `README.md:17-27`：现有功能和兼容描述。

## Compatibility Boundary

- 现有列表、文件管理、路径越界保护、唯一命名和图片粘贴行为不改变。
- 普通小文件上传仍成功；分块协议只替换上传传输路径。
- 上传临时文件只有完成并校验后才重命名为最终文件，不覆盖已有文件。
- 软链接下载自动跳过；本阶段不下载文件夹。
- 任务状态只存浏览器内存，不写 localStorage、磁盘或服务端持久化。
- 不实现 Windows 资源管理器直接粘贴、复制文件内容、复制下载链接。

## Requirement Ready Check

- Requirement source refs：本轮用户确认“大文件上传是第一步”，并确认先支持下载、不做复制相关功能。
- Acceptance：大文件分块上传成功；上传可暂停/继续/取消；任务中心跨工作区共享；文件右键下载；软链接跳过；清除历史不删除文件。
- Decision：ready。

## Change Necessity

- User-visible need：大文件当前因整体 Base64/JSON 请求体限制中途失败，且缺少全局传输可视性。
- No-change option：仅提高请求体上限不能消除 Base64 内存峰值，也无法提供暂停/取消和下载进度。
- Minimum boundary：Host 分块上传/流式下载协议 + Client 共享任务仓库、任务视图和 Explorer 接入。
- Decision：code-change。

## Existence Check

- Proposed new surface：全局内存传输任务仓库和任务浮窗。
- Existing reuse candidate：ExplorerView 内部上传状态只能覆盖单个工作区实例，无法跨视图/工作区共享。
- Creation proof：模块级 store 是唯一共享 owner；浮窗只是展示和操作，不复制任务状态。
- Decision：add-with-proof。

## Architecture Integrity Lens

- Invariant：任务状态必须只有一个全局 owner，文件写入必须由 Host 工作区边界 owner 负责。
- Canonical owners：`transferStore.ts` 管理 Client 任务状态；`src/index.ts` 管理 Host 文件流和临时文件。
- Overlap prevention：移除 ExplorerView 原有局部上传状态，Explorer 仅发起操作和读取 store。
- Verdict：按 Host/Client 双 owner 分层，避免在 UI 层堆叠传输逻辑。

## Plan-Time Complexity Check

- `ExplorerView.tsx` 已超过千行，继续加入任务列表会增加压力。
- 推荐新增 `transferStore.ts`、`TransferView.tsx`，Explorer 只保留调用和底部摘要 wiring。
- Host 路由仍集中在 `src/index.ts`，但抽取上传 session 临时文件 helpers，避免继续扩大单个 handler 分支。
- Budget：within-budget with new focused owners。

## Execution Readiness View

- Intent Lock：大文件上传修复优先；下载建立在同一任务基础设施上。
- Scope Fence：上传、任务中心、文件右键下载；明确排除复制/文件夹下载。
- Baseline Lock：沿用现有 `/wb-files` trust fence、session cwd 和 workbench registration。
- Owner/Contract：Host 负责路径与文件流；Client store 是任务状态唯一来源。
- Retirement Boundary：旧完整 Base64 上传路径在普通文件上传中退出；图片 `saveImage` 保留，因为其有独立图片校验契约。
- Test Obligations：`pnpm run check`、`pnpm run build`；手动验证大文件、取消、软链接跳过、跨工作区任务可见性。
- Review Gates：先检查协议/需求符合性，再检查类型、清理和生命周期。
- Drift Rule：若出现持久化、文件夹下载或 Windows 原生剪贴板需求，暂停并回到设计。

## Tasks

### Task 1：Host 分块上传协议

Files：`src/index.ts`，必要时新增 `src/uploadSession.ts`。

- 新增 start/chunk/complete/cancel 四阶段接口；分块 body 使用原始二进制。
- upload start 校验 session、parent、basename，创建工作区内随机临时文件并返回 uploadId、目标大小信息。
- chunk 校验 uploadId 所属 session、offset 严格连续，流式写入临时文件，返回累计字节数。
- complete 校验累计大小，使用唯一命名后原子 rename；失败清理临时文件。
- cancel 清理临时文件；插件停止时清理内存 session 和临时文件。
- 保留 `saveImage` 原 JSON/Base64 路径。

Verification：`pnpm run check`；用本地 HTTP 请求发送多个 chunk，确认最终文件内容、越界拒绝、offset 拒绝和取消清理。

Repair Track：修复 canonical owner 为 Host 请求体/文件写入边界；不通过提高 `MAX_BODY_BYTES` 掩盖问题。
Retirement Track：普通文件上传退出完整 Base64 JSON 路径；图片上传保留，直到独立图片流协议有明确需求。

### Task 2：全局内存传输仓库

Files：新增 `src/client/transferStore.ts`。

- 定义 upload/download、queued/running/paused/completed/failed/cancelled 状态。
- 提供 `subscribe/getSnapshot/create/update/pause/resume/cancel/clearCompleted`。
- 维护模块级单例和总进度计算；所有副作用由任务控制器可取消地持有。
- 上传控制器按切片发送 start/chunk/complete，并以 AbortController 实现暂停/取消。
- 只保留最小 JSON 状态，不持有 Blob 或 Host live object。

Verification：`pnpm run check`；在浏览器单元级运行控制器模拟，验证状态转换、总进度、暂停/恢复和清理规则。

### Task 3：任务中心浮窗与状态栏入口

Files：新增 `src/client/TransferView.tsx`、修改 `src/client/index.ts`、`src/client/styles.ts`、`src/client/i18n.ts`、必要时 `src/client/icons.ts`。

- 注册 `transfers` editor view；打开时使用 `floating: true`。
- 注册 status bar item，显示活动任务数量/总进度并可打开浮窗。
- 任务列表展示类型、名称、源/目标路径、进度、状态、暂停/继续/取消按钮。
- 已完成历史提供“清除已完成”；不触碰实际文件。
- 使用 `useSyncExternalStore` 订阅全局 store，窗口关闭不停止任务。

Verification：`pnpm run check`、`pnpm run build`；手动打开/关闭浮窗、切换工作区后确认同一任务快照。

### Task 4：Explorer 接入上传和下载

Files：修改 `src/client/ExplorerView.tsx`、`src/client/styles.ts`、`src/client/i18n.ts`；修改 `src/index.ts` 增加流式 download 路由。

- 移除局部 `uploading/uploadProgress` owner，上传入口改为创建全局任务。
- 大文件和普通文件统一走分块上传；图片粘贴保留现有 `saveImage`，但纳入任务展示或明确保持独立。
- 文件右键增加下载；Host 先 `lstat`，软链接返回可识别 skipped 状态。
- 普通文件通过流式响应下载；支持 Range/分块控制以服务暂停/继续。
- 底部 1px 条显示全局活动任务总进度，而不是当前面板任务。

Verification：`pnpm run check`、`pnpm run build`；手动验证大文件成功、暂停/继续、取消后无半成品、普通文件下载、软链接跳过、工作区切换和历史清除。

### Task 5：文档与回归验证

Files：`README.md`、`README.en.md`，必要时新增测试文件。

- 更新上传/下载/任务中心行为、内存生命周期和排除项。
- 执行构建并检查生成的 `lib` 与源码一致。
- 复核旧 `/wb-files/upload` 引用、旧局部进度 owner 和错误文案引用。

Verification：`pnpm run check`、`pnpm run build`、`git diff --check`、`git status --short`。

## Risks

- 浏览器文件保存 API 的暂停/继续能力存在兼容差异；先保证 Chrome/Edge，其他浏览器提供可取消的降级下载。
- Host 进程崩溃可能留下临时文件；临时文件使用明确前缀，并在插件启动/停止时清扫可识别临时文件。
- 多工作区同时上传需要 sessionId 绑定 upload session，禁止跨会话复用 uploadId。

## Retirement

- 旧完整 Base64 普通文件上传路径在新协议切换完成后不再由客户端调用；Host 旧入口可短期保留兼容但必须仅供旧客户端，下一版本再移除。
- 现有图片 Base64 保存路径保留，理由是当前图片 magic-byte 和大小校验依赖该契约；当图片也迁移到流式校验后再移除。
