# MFA Tool 构建与发布文档

> 本次重命名后，仓库名、桌面应用名和构建产物统一为 `MFA Tool`。应用启动时会自动尝试迁移旧 `2fa-web-tool` 标识符目录下的本地数据。

## 开发环境搭建

### 前置要求

- **Node.js** >= 18（推荐 20 LTS）
- **Rust**（通过 [rustup](https://rustup.rs/) 安装）
- **npm**（随 Node.js 一起安装）

### 安装 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

安装完成后重启终端，确认安装：

```bash
rustc --version
cargo --version
```

### 各平台 Tauri 构建前置依赖

#### Windows

- **WebView2**：Windows 10 (1803+) 和 Windows 11 已预装。旧版本需从 [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 下载安装。
- **Visual Studio Build Tools**：安装 [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选"使用 C++ 的桌面开发"工作负载。

#### macOS

- **Xcode Command Line Tools**：

```bash
xcode-select --install
```

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libxdo-dev
```

> 其他发行版请参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)。

## 开发模式

```bash
# 安装前端依赖
npm install

# 启动 Tauri 开发模式（同时启动前端 dev server 和 Tauri 窗口）
npm run tauri -- dev
```

开发模式下前端运行在 `http://localhost:19872`，支持热更新。

## 本地验证与构建

建议在发版前按下面顺序执行：

```bash
npm test
npm run build
npm run tauri -- build
```

> 当前项目已启用 Tauri updater。只要客户端版本中已经包含该能力，后续 GitHub Release 发布完成后，应用启动时或点击“检查更新”时就会读取 Release 附带的 `latest.json` 来发现新版本。

### 桌面端构建命令

```bash
npm run tauri -- build
```

此命令会先执行 `npm run build` 构建前端，然后编译 Rust 后端并打包为桌面安装包。

如果是在 CI、SSH 会话或无 Finder/无图形桌面的 macOS 环境中构建 DMG，建议改用：

```bash
CI=true npm run tauri -- build
```

这样 Tauri bundler 会走更适合无头环境的 DMG 打包路径。

### 构建产物位置

构建产物位于 `src-tauri/target/release/bundle/` 目录下：

| 平台    | 格式          | 路径                                        |
| ------- | ------------- | ------------------------------------------- |
| Windows | `.msi`        | `src-tauri/target/release/bundle/msi/`      |
| Windows | `.exe` (NSIS) | `src-tauri/target/release/bundle/nsis/`     |
| macOS   | `.dmg`        | `src-tauri/target/release/bundle/dmg/`      |
| macOS   | `.app`        | `src-tauri/target/release/bundle/macos/`    |
| Linux   | `.AppImage`   | `src-tauri/target/release/bundle/appimage/` |
| Linux   | `.deb`        | `src-tauri/target/release/bundle/deb/`      |

> 注意：只能构建当前操作系统对应的安装包。跨平台构建需使用 CI/CD（如 GitHub Actions）。

## 测试

```bash
# 运行所有测试（unit tests + property-based tests）
npm test

# 监听模式
npm run test:watch
```

## GitHub 发布流程

### 1. 更新版本号

需要同步以下文件中的版本：

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `CHANGELOG.md`

### 2. 确认 updater 签名密钥

GitHub Actions 在构建 release 时会为 updater 产物签名。发布前需要在仓库 Secrets 中准备：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果私钥无密码，可以不设置）

当前仓库使用的 updater 公钥已经写入 `src-tauri/tauri.conf.json`，对应私钥需由维护者安全保存。若私钥丢失，后续版本将无法继续被旧客户端信任。

### 3. 推送主分支

```bash
git push origin main
```

### 4. 创建并推送发布标签

```bash
git tag v0.3.0
git push origin v0.3.0
```

### 5. 等待 GitHub Actions 构建

仓库中的工作流会在推送 `v*` 标签后自动执行，目标平台包括：

- Windows
- macOS Apple Silicon
- macOS Intel
- Linux

构建成功后，产物会自动附加到对应 GitHub Release，并额外上传：

- `latest.json`
- `latest.json.sig`
- 各平台安装包对应的签名文件

其中 GitHub Release 的描述文案会作为客户端弹窗里的“更新说明”来源，建议发版时认真填写。

## 仅构建前端

如果只需构建前端（不打包 Tauri）：

```bash
npm run build
```

产物位于 `dist/` 目录。
