# AGENTS.md

## 文件目标
- 这份文件既是协作约定，也是项目速查手册。
- 后续只要任务改变了核心流程、目录职责、关键命令、存储方式或重要行为，就同步更新本文件，避免后来的 agent 再从头读一遍仓库。
- 纯文案、纯样式微调、注释修改，可不更新本文件。
- 只要在任何 `git worktree` 中修改了 `AGENTS.md`，都必须实时同步到项目根目录下这份 `AGENTS.md`，保持两边内容一致。

## 沟通与工作方式
- 默认使用中文，回复简洁直接。
- 优先在本地仓库内直接分析和实现，不依赖 Gemini CLI 或其他外部前端 CLI。
- 只做用户明确要求的改动，避免顺手重构、扩功能或改无关代码。
- 修改代码前先阅读相关文件，理解现有实现后再动手。
- 未经用户明确要求，不要自动 push、建 PR、上传 GitHub。
- `git commit`、合并、打 tag、删除 worktree 这类仓库写操作，按本文件里的发布/合并流程执行。

## 调试与实现原则
- 先找根因，再修复；不要凭感觉试错式乱改。
- 新功能、行为变更、bug 修复，优先补针对性的回归测试。
- 尽量做最小改动，优先复用现有工具函数、hooks 和组件模式。
- 若一个任务包含多个小改动，可以在该任务全部完成后统一做一次最终验证；不要每改一行就触发完整桌面端构建。

## 完成开发/修复后的强制验证流程
当完成一个功能开发、行为变更或 bug 修复后，在向用户声明完成前，按以下顺序执行：

1. 运行与本次改动直接相关的测试
   - 优先使用精确到文件的 Vitest 命令
   - 例如：`npm test -- --run <相关测试文件>`

2. 运行前端生产构建
   - `npm run build`

3. 自动构建 macOS 桌面端
   - `npm run tauri -- build`
   - 若当前是无 GUI / 无 Finder / SSH / CI 环境，macOS DMG 打包可能卡在 Finder 美化脚本，此时改用：`CI=true npm run tauri -- build`

4. 只有以上验证通过后，才能告诉用户任务完成
   - 若失败，必须如实说明失败命令和错误原因
   - 不要在未完成桌面端构建时声称“已完成”

## 桌面端构建约定
- 本项目默认桌面端验证目标是 macOS Tauri release build。
- 已验证结论：在无 GUI / 无 Finder 的 macOS 环境里，普通 `npm run tauri -- build` 可能在 DMG 美化阶段失败；此时应优先使用 `CI=true npm run tauri -- build`。
- 已验证结论：只要 `src-tauri/tauri.conf.json` 仍启用 updater 公钥，本地执行 `npm run tauri -- build` 时如果没有注入 `TAURI_SIGNING_PRIVATE_KEY`，命令会在 updater 签名阶段报错退出；但 `.app`、`.dmg` 和 `.app.tar.gz` 可能已经产出。
- 成功构建后，优先向用户报告以下产物路径：
  - `src-tauri/target/release/bundle/macos/MFA Tool.app`
  - `src-tauri/target/release/bundle/dmg/MFA Tool_0.3.3_aarch64.dmg`

## 测试与验证约定
- 如果只是文案、注释或纯文档改动，可不强制运行桌面端构建，除非用户要求。
- 如果改动影响运行时行为、UI、状态管理、导入导出、Tauri 交互、应用内更新或构建链路，必须执行完整桌面端构建。
- 若新增测试，需要先看到失败，再实现修复，再重新跑到通过。

## 风险控制
- 不做破坏性 git 操作（如 reset --hard、force push、删除分支）除非用户明确要求。
- 遇到仓库内已有大量未提交改动时，只修改本次任务相关文件，不顺带清理其他改动。
- 任何会影响共享状态或远程服务的操作，都先征求用户确认。

## Git Worktree 开发流程
- 以后每次开发“新功能”或修 bug，默认都先新建独立 `git worktree`，在该 `worktree` 中完成开发、测试和验证。
- `worktree` 目录默认放在项目根目录下的 `worktrees/`，路径格式优先使用 `MFA-Tool/worktrees/<任务名>`。
- 新功能或修复分支应与 `worktree` 一一对应，避免直接在主工作区堆叠开发。
- 如果当前环境或上层规则对分支命名有前缀要求，创建分支时必须遵守该前缀要求。
- `git worktree` 本质上是基于当前 `main` 的内容检出一个独立工作目录，不是手工复制一份仓库；后续开发默认从 `main` 当前内容起步。
- 合并前流程固定为：我先完成实现和本地验证，你再亲自测试，你明确回复“OK”之后，才可以执行合并。
- 在你明确说“OK”之前，只能保持在功能分支 / `worktree` 状态，不能提前合并到主分支。
- 合并完成后，必须先检查 `main` 已包含该 `worktree` 分支内容、确认无冲突且相关 bug 已验证修复，再安全销毁对应 `worktree` 和分支，并确认不误删仍在使用的目录。

## 提交与合并约定
- 合并到主分支后，要及时执行 `git commit`，提交信息使用中文，内容准确概括本次变更。
- 没有你的合并确认时，不擅自替你做主分支合并。
- 如果任务只完成开发和验证、尚未进入合并阶段，可以先不提交到主分支，等待你测试确认。
- 合并完成后，如果本次更新影响客户端行为、构建结果或发版内容，要继续执行构建命令验证客户端可产出。
- 只有 `main` 分支上的内容可以执行本地提交、远程 `git push` 和发版构建；`worktree` 功能分支上的内容一律不允许直接推送。
- 即使用户口头要求直接推送，也必须先检查当前分支；如果不在 `main`，先提醒并停止，只有确认该分支内容已经安全合并到 `main` 且核对无误后，才能继续推送或构建。

## 项目速览
- 项目是一个本地优先的 2FA / TOTP 管理工具，前端基于 React 19 + TypeScript + Vite 8 + Tailwind CSS 4，桌面壳使用 Tauri 2。
- 主要能力：二维码导入、`otpauth://` URL 导入、Google Authenticator migration 导入、手动录入、分组管理、批量操作、重复检测、拖拽排序、备份导入导出、WebDAV 云同步、临时验证码查看、GitHub Release 驱动的应用内更新。
- 业务数据主要保存在 Tauri 应用数据目录下的 `data/accounts.json` 和 `data/groups.json`。
- WebDAV 的文件 URL 与用户名保存在浏览器 `localStorage`；WebDAV 密码保存在系统钥匙串，不写入 `localStorage`。
- 主题、语言、排序偏好以及“稍后提醒某个更新版本”的偏好保存在浏览器 `localStorage`，不走 Tauri 文件存储。

## 先看哪些文件
- 应用入口：`src/main.tsx`
- 全局编排与页面切换：`src/App.tsx`
- 账户状态与持久化：`src/hooks/useAccounts.ts`、`src/lib/account-manager.ts`
- 分组状态与持久化：`src/hooks/useGroups.ts`、`src/lib/group-manager.ts`
- WebDAV 云同步：`src/components/WebDavSyncPanel.tsx`、`src/lib/webdav-sync.ts`、`src/lib/webdav-client.ts`、`src/lib/webdav-store.ts`
- 扫码与导入解析：`src/components/ImageUploader.tsx`、`src/lib/qr-decoder.ts`、`src/lib/migration-parser.ts`
- 手动添加：`src/components/ManualAddForm.tsx`、`src/lib/validators.ts`
- 备份导入导出：`src/components/BackupPanel.tsx`、`src/lib/backup.ts`
- 应用内更新：`src/components/AppUpdateManager.tsx`、`src/components/UpdateDialog.tsx`、`src/hooks/useAppUpdater.ts`
- Tauri 后端读写与插件注册：`src-tauri/src/lib.rs`
- GitHub 发布工作流：`.github/workflows/build.yml`

## 目录职责
- `src/components`
  页面和 UI 组件。重点页面组件是 `HomePage`、`AccountPage`、`GroupPage`、`TempPanel`、`BackupPanel`、`WebDavSyncPanel`、`AppUpdateManager`、`UpdateDialog`。
- `src/hooks`
  页面无关的状态逻辑。当前主要是 `useAccounts`、`useGroups`、`useTOTP`、`useAppUpdater`。
- `src/lib`
  纯逻辑和工具函数。包括解析、校验、排序、去重、备份、WebDAV 同步合并、偏好存储、仪表盘统计等。
- `src/contexts`
  当前主要是 `I18nContext`。
- `src/types`
  领域类型和错误类型定义。
- `src/components/__tests__`、`src/lib/**/*.test.*`
  组件测试、单元测试、property tests。
- `src-tauri/src`
  桌面端 Rust 后端，目前职责较薄，主要暴露读写命令并注册插件。
- `dist`、`src-tauri/target`
  构建产物，不是源码排查入口。

## 核心数据模型
- `OTPAccount`
  定义在 `src/types/index.ts`。关键字段：`secret`、`type`、`counter`、`digits`、`period`、`groupId`、`order`、`updatedAt`。
- `Group`
  定义在 `src/types/index.ts`。默认分组固定 ID 是 `default`，由 `src/lib/group-manager.ts` 维护；分组也带 `updatedAt` 供 WebDAV 合并使用。
- 默认分组
  缺失分组数据时会自动补出默认分组；历史账户如果缺 `groupId`，`useAccounts` 会迁移成 `default` 并立即持久化。
- 时间戳迁移
  历史账户或分组如果缺少 `updatedAt`，加载时会回填为 `createdAt` 并立即持久化。

## 页面与状态流
- `src/App.tsx`
  负责页面切换、侧边栏状态、全局 toast、重复账户弹窗、临时密钥列表、备份与 WebDAV 同步入口、应用内更新入口，以及把账户/分组 hooks 串起来。
- `home`
  首页由 `HomePage` 承担，包含 Dashboard、二维码导入、手动添加、最近添加账户。
- `accounts`
  账户页由 `AccountPage` 承担，负责排序模式切换、批量选择、批量移动、拖拽排序。
- `groups`
  分组页由 `GroupPage` 承担，负责按分组查看账户、打开分组管理面板。
- `temp`
  临时验证页由 `TempPanel` 承担，数据只存在 `App` 内存状态里，关闭应用即丢失。

## 关键业务流
- 二维码导入
  `ImageUploader` 处理点击上传、拖拽、粘贴。
  `qr-decoder.ts` 负责从图片拿到二维码文本。
  `migration-parser.ts` 负责把二维码文本解析成普通 `otpauth://` 或 Google migration 账户数据。
  `HomePage` 会按 `issuer` 自动建组，再做重复检测。
  如果有重复，交给 `App` 打开 `DedupDialog`；没有重复则直接持久化。
- 手动添加
  `ManualAddForm` 支持 base32 手输和 `otpauth://` URL 两种模式。
  base32 校验在 `validators.ts`，URL 解析走 `parseOtpauthUrl()`。
  当前首页没有把 `groups` 传给 `ManualAddForm`，所以手动添加默认进 `default` 分组。
- Google Authenticator migration 导入
  `migration-parser.ts` 内联了 protobuf 描述，不依赖运行时读取 `.proto` 文件。
  导入结果统一转换成 `OTPAccount[]`，默认算法只落到 `SHA1`。
- 重复检测
  `dedup-checker.ts` 先按 `secret` 判重，再按 `name + issuer` 判重。
  跳过重复时仅新增唯一项；覆盖重复时用导入项替换原项，再追加唯一项。
- 备份导出 / 导入
  `BackupPanel` 优先使用 Tauri 的 dialog/fs 插件。
  导出选中账户时会过滤账户，但当前仍带上全部 `groups`。
  导入备份会保留当前 `accounts` 和 `groups`，把备份内容按分组映射后合并进来；命中相同 `id`、`secret` 或 `name + issuer` 的账户会跳过，不覆盖现有数据。
- WebDAV 云同步
  `WebDavSyncPanel` 使用单个远端 `sync.json` 文件做同步介质，格式与现有备份 JSON 兼容。
  Rust 侧负责读取系统钥匙串里的 WebDAV 密码，并发起 GET/PUT 请求；前端不直接持久化密码。
  “立即同步”当前策略是：先从云端读取并按 `updatedAt` 合并，再把合并结果回写本地并上传回云端。
  当前版本不会传播删除 tombstone；跨端删除后，如果另一端仍保留该账号，下次同步可能把它带回来。
- 排序与拖拽
  自动排序用 `src/lib/sorter.ts` + `SortConfig`。
  自定义排序依赖 `OTPAccount.order`，拖拽后会重写 `order` 并更新账户 `updatedAt` 后持久化。
- 验证码生成
  `useTOTP` 每秒刷新倒计时，到时间窗口切换时重新生成验证码。
  底层实现是 `src/lib/totp-generator.ts`，基于 `otpauth` 库。
- 应用内更新
  `useAppUpdater` 在桌面端启动时自动检查 GitHub Releases，并每小时轮询一次最新版本。
  `AppUpdateManager` 在顶栏提供“检查更新”入口；发现新版本时会高亮按钮并弹出 `UpdateDialog`。
  `UpdateDialog` 展示版本号、发布时间、Release body、下载进度，支持“稍后提醒”和“立即重启”。
  “稍后提醒”的版本号会记在 `localStorage` 的 `mfa-tool:dismissed-update-version`，同一版本不会反复自动打断用户。

## Tauri 与存储
- Tauri 配置在 `src-tauri/tauri.conf.json`。
- 前端开发端口固定 `19872`，`vite.config.ts` 和 `tauri.conf.json` 的 `devUrl` 必须保持一致。
- Rust 后端在 `src-tauri/src/lib.rs` 暴露以下命令：
  - `read_accounts`
  - `write_accounts`
  - `read_groups`
  - `write_groups`
  - `has_webdav_password`
  - `save_webdav_password`
  - `clear_webdav_password`
  - `read_webdav_sync`
  - `write_webdav_sync`
- 数据目录通过 `app.path().app_data_dir()/data` 创建，前端不要假设仓库内存在真实运行数据文件。
- 应用内更新由 Tauri updater 插件驱动：
  - 更新源：`https://github.com/CovoebGem/MFA-Tool/releases/latest/download/latest.json`
  - 公钥：写在 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`
  - GitHub Release 需要同时上传 `latest.json` 与签名文件，客户端才能识别并校验更新

## 开源发布约定
- 如果用户说“上传 GitHub”或明确进入开源发布流程，需要一并检查并完善：
  - `README.md`
  - `.github/workflows/*.yml`
  - release/tag 命名
  - 发布说明或仓库描述文案
- 本仓库已配置本地项目级 GitHub token 文件：`.env.gh.local`（忽略入库）。
- 后续在本仓库执行 `gh`、GitHub API、release、workflow 相关命令时，优先加载该文件中的 `GH_TOKEN` / `GITHUB_TOKEN`。
- GitHub Actions 的 Linux 发版构建当前在 Debian 12 容器中执行；如果调整 Linux runner、container 或系统依赖包，需同步更新本文件。
- 由于 WebDAV 密码改为走系统钥匙串，Linux 构建依赖里需要安装 `libsecret-1-dev`，否则 `keyring` crate 无法完成编译链接。
- README 不是一次性文件。每次重要更新后，都要结合本次改动补齐功能说明、安装方式、开发方式、截图或平台支持信息，确保开源用户能看懂。
- README 对外内容保持精简：默认不要放“界面预览”截图，不要保留一次性的重命名迁移说明，不要在 README 中公开“发布流程”或“文档”区块，除非用户明确要求恢复。
- README 的叙述口吻面向公开读者，使用产品说明或功能说明语气，避免写成在指导仓库维护者或直接对用户发号施令的口吻。
- 以下文件默认只留在本地供维护使用，不再推送到 GitHub：`DEPLOY.md`、`CHANGELOG.md`、`MFA-Tool.png`。如果它们已被 Git 跟踪，应从索引移除但保留本地文件。
- 创建 GitHub tag 时，标签名要与版本号、发布内容保持一致，避免随意命名。
- GitHub Actions 要能构建对应平台可执行文件；若本次改动影响构建链路、目标平台、产物命名或 updater 产物，要同步更新 workflow。
- 触发 GitHub 构建时，默认只允许从 `main` 当前已验证提交创建正式版本 tag 来触发；不要为了“试一下构建”直接从 `main` 执行会生成错误 release/tag 的 workflow。
- 需要发布到 GitHub 时，除了代码本身，还要准备合适的：
  - 仓库简介
  - release 描述
  - 使用说明
  - 平台产物说明
- 未经用户明确要求，不自动上传 GitHub；但一旦用户要求上传，需要把配置文件和描述文案准备完整，而不是只推代码。
- 应用内更新依赖 GitHub Secrets：
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（私钥无密码时可留空）
- GitHub Release 的 body 会作为客户端“更新说明”展示来源；每次发版都必须写清楚 Release 描述，至少包含版本重点、主要行为变更、兼容性影响、数据迁移或用户需要注意的事项。
- 发布说明必须基于这一次实际更新来写，优先写用户能感知到的变化、兼容性影响和注意事项，不要复用“下载对应平台安装包即可使用”这类通用占位文案。
- 发布说明语气保持自然、克制、像正常开发者在写版本说明；不要堆空话，不要写 AI 味很重的总结腔。
- `.github/workflows/build.yml` 不要再写死通用 `releaseBody` 覆盖真实发布说明；workflow 负责上传产物，发布说明由发版时单独准备或更新。

## i18n / 主题 / 偏好
- `I18nProvider` 在 `src/main.tsx` 挂载。
- 翻译字典在 `src/lib/i18n.ts`，当前中英文文案并存，但不是所有页面都完全走 i18n；例如 `App.tsx` 里的页面标题仍是硬编码中文。
- 主题存储在 `src/lib/theme-store.ts`。
- 语言存储在 `src/lib/locale-store.ts`。
- 排序偏好存储在 `src/lib/preference-store.ts`。

## 测试现状
- Vitest 配置在 `vitest.config.ts`，运行环境是 `jsdom`。
- 组件测试集中在 `src/components/__tests__`。
- 逻辑层测试覆盖较多，`src/lib` 下同时有普通单测和 `fast-check` property tests。
- 新增行为、修 bug、改解析逻辑时，优先补对应文件级测试，不要只跑全量不补回归。
- 应用内更新相关测试目前集中在 `src/components/__tests__/AppUpdateManager.test.tsx`，通过 mock Tauri updater/process API 验证自动检查、稍后提醒、下载安装与重启流程。
- WebDAV 同步相关回归目前集中在 `src/lib/webdav-store.test.ts` 与 `src/lib/webdav-sync.test.ts`，覆盖本地配置存储与基于 `updatedAt` 的合并规则。

## 常见改动落点
- 改二维码导入 / 粘贴 / 拖拽：`src/components/ImageUploader.tsx`、`src/lib/qr-decoder.ts`
- 改 `otpauth://` 或 migration 解析：`src/lib/migration-parser.ts`、`src/lib/validators.ts`
- 改账户持久化 / 批量移动 / 编辑删除：`src/hooks/useAccounts.ts`、`src/lib/account-manager.ts`
- 改分组默认行为 / 删除分组迁移：`src/hooks/useGroups.ts`、`src/lib/group-manager.ts`
- 改备份格式 / 导入导出逻辑：`src/components/BackupPanel.tsx`、`src/lib/backup.ts`
- 改 WebDAV 云同步：`src/components/WebDavSyncPanel.tsx`、`src/lib/webdav-sync.ts`、`src/lib/webdav-client.ts`、`src/lib/webdav-store.ts`、`src-tauri/src/lib.rs`
- 改排序 / 拖拽顺序：`src/components/AccountPage.tsx`、`src/lib/sorter.ts`
- 改验证码展示 / 倒计时：`src/hooks/useTOTP.ts`、相关卡片组件
- 改桌面端文件读写：`src-tauri/src/lib.rs`
- 改应用内更新提示 / 轮询逻辑：`src/components/AppUpdateManager.tsx`、`src/components/UpdateDialog.tsx`、`src/hooks/useAppUpdater.ts`
- 改 GitHub Release 更新产物 / 签名链路：`src-tauri/tauri.conf.json`、`.github/workflows/build.yml`

## 后续维护规则
- 每次完成涉及以下内容的任务后，都要顺手检查是否需要更新本文件：
  - 新增或删除页面、核心模块、重要命令
  - 改变导入导出、存储、分组、排序、去重、Tauri 交互、应用内更新流程
  - 修改测试/构建/发布约定
  - 出现新的已知限制、兼容性约束、易踩坑点
- 如果用户调整了协作流程、Git 规范、发版方式，也要第一时间同步到本文件。
- 只要在任何 `git worktree` 中修改了本文件，必须同步更新项目根目录下的 `AGENTS.md`。
- 当用户明确要求某些 README 内容或本地文件“不再推送 GitHub”时，要把这条约束写入本文件，避免后续回退。
- 更新时优先写“事实”和“落点文件”，不要写过期的过程性描述。
- 如果发现本文件与实际代码不一致，应在本次任务内一并修正。
