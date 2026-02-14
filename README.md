# 2FA Tool

一个基于 Tauri + React + TypeScript 构建的桌面端 TOTP 两步验证工具。

## 功能

- 管理 TOTP 账户，生成实时验证码
- 支持扫描二维码 / 手动输入密钥 / otpauth:// URL 导入
- 支持 Google Authenticator 迁移数据导入
- 账户分组管理
- 批量操作（移动、删除）
- 重复账户检测
- 排序与搜索
- 数据本地存储，隐私安全

## 技术栈

- 前端：React 19 + TypeScript + Tailwind CSS
- 桌面：Tauri 2
- 构建：Vite
- 测试：Vitest + fast-check

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（Web）
npm run dev

# 启动 Tauri 开发模式
npm run tauri dev

# 运行测试
npm test

# 构建桌面应用
npm run tauri build
```

## 下载

前往 [Releases](https://github.com/CovoebGem/2fa-web-tool/releases) 下载各平台安装包：

- Windows: `.msi` / `.exe`
- macOS: `.dmg`（Intel / Apple Silicon）
- Linux: `.AppImage` / `.deb`

## License

MIT
