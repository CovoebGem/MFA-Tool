# 2FA Web Tool 构建与部署文档

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
npm run tauri dev
```

开发模式下前端运行在 `http://localhost:5173`，支持热更新。

## 构建

### 构建命令

```bash
npm run tauri build
```

此命令会先执行 `npm run build` 构建前端，然后编译 Rust 后端并打包为桌面安装包。

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

## 仅构建前端

如果只需构建前端（不打包 Tauri）：

```bash
npm run build
```

产物位于 `dist/` 目录。
