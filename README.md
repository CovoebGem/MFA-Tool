# MFA Tool

一个基于 Tauri 2 + React 19 + TypeScript 构建的本地优先桌面验证器，用来管理 TOTP 两步验证账户、导入二维码并生成实时验证码。

## 核心功能

- 扫描二维码图片、粘贴截图或拖拽图片导入 OTP 账户
- 支持 `otpauth://` URL 和 Google Authenticator migration 数据解析
- 手动录入 Base32 密钥，快速补录账号
- 账户分组、批量移动、重复账户检测
- 自动排序与拖拽自定义排序
- 临时验证码面板，适合一次性查看和复制
- 本地 JSON 备份导入导出，导入时默认合并现有数据
- GitHub Release 驱动的应用内检查更新与一键升级
- 所有账号数据默认只保存在本机应用数据目录

## 支持平台

- Windows：`.msi` / `.exe`
- macOS：`.app` / `.dmg`（Apple Silicon、Intel）
- Linux：`.AppImage` / `.deb`

下载入口：
[GitHub Releases](https://github.com/CovoebGem/MFA-Tool/releases)

## 快速开始

```bash
# 安装依赖
npm install

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

- 可以按名称、服务商、创建时间自动排序
- 也可以切换到拖拽模式手动排序
- 支持账户编辑、删除、批量移动分组
- 导入时会自动检测重复账户

### 备份与恢复

- 支持导出全部账户
- 在账户页勾选后支持仅导出选中账户
- 备份文件为 JSON，可重新导入恢复
- 导入备份时默认保留当前账户和分组，仅把备份中的唯一账户合并进来
- 命中相同 `id`、`secret` 或 `name + issuer` 的账户会跳过，不覆盖现有数据

### 应用更新

- 桌面端启动后会自动检查 GitHub Releases 中是否有新版本
- 顶栏提供“检查更新”入口，可手动重新检测
- 发现新版本后会弹出更新说明，支持下载、安装并重启进入新版本
- 更新说明来自 GitHub Release body；如果你希望客户端展示更详细的更新日志，请在发版时写清楚 Release 描述

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
- 当前版本不依赖远程同步服务
- 备份文件是明文 JSON，请自行妥善保存

## License

[MIT](./LICENSE)
