# Changelog

## v0.3.0 - 2026-03-19

### Changed

- 项目目录、包名、桌面应用名、发布名统一重命名为 `MFA Tool` / `mfa-tool`。
- Tauri bundle identifier 更新为 `com.mfa-tool.desktop`。
- 启动时自动尝试从旧 `com.twofa-web-tool.desktop` 数据目录迁移账户与分组数据。
- 截图资源、README、部署文档和 GitHub Release 文案同步改名。

### Release

- 推荐通过推送 `v0.3.0` 这样的标签触发 GitHub Actions。
- GitHub Actions 会为 Windows、macOS 和 Linux 构建桌面端安装包。

## v0.2.1 - 2026-03-19

### Changed

- 整理开源仓库内容，补齐 README、LICENSE、版本元数据和发版说明。
- 明确本地私有文件的忽略规则，避免协作文档和个人方案误上传到公开仓库。
- 补充更完整的测试文件覆盖，方便后续迭代回归。

### Release

- 推荐通过推送 `v0.2.1` 这样的标签触发 GitHub Actions。
- GitHub Actions 会为 Windows、macOS 和 Linux 构建桌面端安装包。

## v0.2.0 - 2026-02-18

### Added

- 深色模式
- 多语言切换
- 备份导入导出
- 账户拖拽排序
- 更完整的 TOTP、分组和去重逻辑

## v0.1.0 - 2026-02-15

### Added

- Tauri 桌面端基础能力
- OTP 账户管理与二维码导入
- GitHub Releases 基础构建流程
