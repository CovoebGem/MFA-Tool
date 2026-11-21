# MFA Tool

一个基于 Tauri 2 + React 19 + TypeScript 构建的本地优先桌面验证器，用来管理 TOTP 两步验证账户、导入二维码并生成实时验证码。

## 核心功能

- 扫描二维码图片、粘贴截图或拖拽图片导入 OTP 账户
- 支持 `otpauth://` URL 和 Google Authenticator migration 数据解析
- 手动录入 Base32 密钥，快速补录账号
- 账户搜索（支持按服务商、账户名称、分组名多词检索及 `Ctrl/Cmd+K` / `Ctrl/Cmd+F` 快捷键）
- 账户分组、批量移动、批量删除、重复账户检测
- 自动排序与拖拽自定义排序
- 临时验证码面板，适合一次性查看和复制
- 支持多格式账户导出与备份导入（Excel `.xlsx` 表格、TXT 文本、JSON 备份），导入备份默认合并现有数据
- WebDAV 云同步，支持测试连接、拉取合并、手动上传和一键同步
- GitHub Release 驱动的应用内检查更新与一键升级（优先通过 `https://github.cbcsec.cc` 加速，异常时自动回退官方源）
- 所有账号数据默认只保存在本机应用数据目录

## 支持平台

- Windows：`.msi` / `.exe`
- macOS：`.app` / `.dmg`（Apple Silicon）
- Linux：`.AppImage` / `.deb`

Release 下载：
[GitHub Releases](https://github.com/CovoebGem/MFA-Tool/releases)

## 开发与构建

```bash
# 安装依赖
npm ci

# 启动前端开发服务器
npm run dev

# 启动 Tauri 开发模式
npm run tauri -- dev

# 运行测试
npm test

# 构建前端
npm run build

# 构建桌面端安装包
npm run tauri -- build
```

开发模式下的前端端口固定为 `http://localhost:19872`，和 Tauri 配置保持一致。

## 使用说明

### 导入账户

- 首页支持点击上传、拖拽图片、`Ctrl+V` 粘贴二维码截图
- 也支持手动输入 Base32 密钥
- 支持直接粘贴 `otpauth://` URL
- 遇到 Google Authenticator 导出的迁移二维码，会自动解析成多个账户

### 管理账户

- 在账户页支持按服务商、账户名称与分组名称实时多词搜索，支持 `Ctrl+K` / `Cmd+K` 全局跳转聚焦与账户页/分组页内 `Ctrl+F` / `Cmd+F` 聚焦
- 在分组页支持当前分组内搜索，无结果时可一键跳转全部账户查看跨组匹配
- 可以按名称、服务商、创建时间自动排序
- 也可以切换到拖拽模式手动排序（搜索过滤期间会自动禁用拖拽以保护顺序）
- 支持账户编辑校验、批量删除、批量移动分组
- 导入时会自动检测重复账户

### 备份与导出

- 支持导出全部账户，或在账户页勾选后仅导出选中账户（针对当前可见选中项）
- 支持三种导出格式：
  - **Excel 表格（`.xlsx`）**：按服务商分段，每段下分两列展示「邮箱/账户」与「2FA密钥」
  - **TXT 文本（`.txt`）**：按服务商分段，每行按 `邮箱——2FA密钥` 格式输出
  - **JSON 备份（`.json`）**：完整结构化备份数据，可用于重新导入恢复
- 导入备份时仅支持 JSON 备份文件，默认保留当前账户和分组，仅把备份中的唯一账户合并进来
- 命中相同 `id`、`secret` 或 `name + issuer` 的账户会跳过，不覆盖现有数据

### WebDAV 云同步

- 从左侧边栏“云同步”入口进入 WebDAV 同步页面
- 使用单个远端 `sync.json` 文件保存同步快照
- 支持测试连接、从云端拉取并合并、把当前本地数据上传到云端、以及“一键同步”
- 当前版本不会传播删除标记；如果一端删除了账号，而另一端仍保留，下次同步可能把该账号重新合并回来

### 应用更新

- 桌面端启动后会自动检查 GitHub Releases 中的可用更新
- 顶栏提供“检查更新”入口，支持随时手动检测新版本
- 检查更新清单与下载安装包均优先通过 `https://github.cbcsec.cc` 加速通道请求；若加速通道异常或断流，会自动回退至 GitHub 官方源重试，下载字节仍使用内置公钥做 minisign 签名校验
- 从旧版（v0.3.8 及更早版本）升级到新版本时仍按旧版官方通道完成，升级至新版后后续检查与下载将自动启用加速与回退策略
- 客户端展示的更新说明来自 GitHub Release 描述，内容通常包括版本重点、主要变更、兼容性影响与注意事项

## 技术栈

- 前端：React 19、TypeScript、Vite 8、Tailwind CSS 4
- 桌面端：Tauri 2
- 测试：Vitest、Testing Library、fast-check
- OTP 生成：`otpauth`
- 二维码解析：`jsqr`

## 项目结构

```text
src/
  components/   页面和 UI 组件
  hooks/        状态逻辑与定时刷新
  lib/          解析、校验、排序、备份、去重等纯逻辑
  contexts/     i18n 上下文
  types/        领域模型与错误类型
src-tauri/
  src/          Rust 后端与 Tauri 命令
  icons/        打包图标资源
```

## 隐私与数据

- 账户数据默认保存在本机 Tauri 应用数据目录
- 如果启用 WebDAV，同步文件会保存到你指定的 WebDAV 服务器
- WebDAV 的 URL 和用户名保存在本地浏览器存储，密码保存在系统钥匙串
- 导出的文件（JSON/TXT/Excel）均包含明文密钥，请自行妥善保存

## License

[MIT](./LICENSE)
