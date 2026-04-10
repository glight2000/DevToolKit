# DevToolkit

一个面向开发者的可插拔多工具桌面应用，基于 Electron + React + TypeScript 构建。内置 SSH 隧道管理器、Markdown 记事本、图片编辑器，以及一批常用小工具——全部通过左侧导航一键切换。

[English](./README.md) | **简体中文**

![platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)
![electron](https://img.shields.io/badge/electron-33-47848F?logo=electron&logoColor=white)
![react](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)
![typescript](https://img.shields.io/badge/typescript-5-3178C6?logo=typescript&logoColor=white)

---

## 功能特性

### Shell 壳层
- 左侧导航栏，一键切换各个工具
- 亮色 / 暗色主题，偏好自动持久化
- 系统托盘集成——关闭主窗口只是隐藏到托盘，后台任务（SSH 隧道等）继续运行，只有从托盘菜单"退出"才真正退出
- 单实例锁，第二次启动时会把已有窗口拉到前台
- 每个插件使用独立的加密 SQLite 数据库（字段级 AES-256-CBC + 内置密钥，仅为"防君子"级别保护，不是高强度安全）

### 内置工具

| 工具 | 说明 |
|------|------|
| **SSH Tunnel** | 管理 local / remote / dynamic (SOCKS5) SSH 隧道，实时流量统计、指数退避自动重连、启动时自动开启、SSH 命令行导入导出、一键打开系统终端连接、公钥自动检测和部署 |
| **Notebook** | 层级结构的 Markdown 文档，支持实时预览、文档锁定、独立密码加密（PBKDF2 + AES-GCM，用户自定密码） |
| **Image Editor** | 基于 Konva 的图层画布编辑器——粘贴/打开图片、添加文字和形状、拖拽/变换/旋转、吸附对齐参考线、图层面板、撤销重做、导出 PNG 或复制到剪贴板 |
| **Crypto Tools** | 密码生成器、编码转换 (HTML / URL / Base64 / Unicode)、哈希计算 (MD5 / SHA-1/256/512)、AES 对称加密、RSA 非对称加密（密钥生成、加解密、签名验签） |
| **Time Tools** | 多格式实时时钟、时间戳 ↔ 日期互转、时区转换、日期差值计算 |
| **Translation** | 中英文等多语言互译，基于免费的 MyMemory API，主进程代理请求规避 CORS |

---

## 截图

> （可选：把截图放到 `docs/screenshots/*.png`，然后在这里用 `![ssh](docs/screenshots/ssh.png)` 引用。）

---

## 工程目录

```
src/
  shared/                 # 主进程和渲染进程共享的插件接口定义
  main/                   # Electron 主进程
    index.ts              # 应用生命周期、窗口、托盘、单实例锁
    plugin-host.ts        # 插件注册 + 生命周期管理
    lib/                  # db、crypto、store、constants
    plugins/
      ssh-tunnel/         # SSH 隧道管理器 (ssh2 + SQLite)
      notebook/           # Markdown 记事本 (SQLite)
      image-editor/       # 画布导入导出 IPC
      crypto-tools/       # MD5 哈希 IPC
      time-tools/         # (stub——全部逻辑在渲染进程)
      translation/        # MyMemory API 代理
  preload/                # 通用 invoke/on IPC 桥
  renderer/
    src/
      App.tsx             # Shell：sidebar + 内容区
      components/
        shell/            # Sidebar
        common/           # TabBar、Modal、CopyButton
      hooks/              # useTheme
      plugins/
        registry.ts       # 渲染进程插件静态注册表
        ssh-tunnel/       # SSH 隧道界面
        notebook/         # 记事本界面（文档树、编辑器、加密流程）
        image-editor/     # 画布 Stage、图层面板、属性面板
        crypto-tools/     # 加密工具（多页签）
        time-tools/       # 时间工具（多页签）
        translation/      # 翻译工具（左右分栏）
resources/
  icon.png                # 应用图标 (256×256)
  tray-icon.png           # 托盘图标 (32×32)
```

---

## 插件架构

每个工具由两部分组成：

1. **主进程模块** (`src/main/plugins/<id>/index.ts`)，实现如下接口：
   ```ts
   interface PluginMainModule {
     id: string
     name: string
     initialize(ctx: PluginContext): void | Promise<void>
     dispose(): Promise<void>
   }
   ```
   `PluginContext` 为每个插件提供一个专属的 `better-sqlite3` 数据库句柄、`encrypt` / `decrypt` 辅助函数，以及向渲染进程推送消息的 `sendToRenderer`。

2. **渲染进程清单** (`src/renderer/src/plugins/<id>/index.tsx`，通过 `registry.ts` 导出)：
   ```ts
   interface PluginRendererManifest {
     id: string
     name: string
     icon: string                 // lucide-react 图标名称
     component: React.ComponentType
   }
   ```
   页面使用 `React.lazy` 懒加载，保持首屏包体积最小。

**IPC 命名空间**：每个插件的 IPC 通道统一以其 id 为前缀（例如 `tunnel:list`、`notebook:get-tree`）。Preload 层暴露通用的 `window.api.invoke(channel, ...args)` / `window.api.on(channel, cb)`，新增插件完全不需要改 preload。

---

## 技术栈

- **Electron 33** + **electron-vite** 构建体系
- **React 19** + **TypeScript 5**
- **TailwindCSS 3**（通过 CSS 变量实现运行时主题切换）
- **Lucide React** 图标库
- **ssh2** 处理所有 SSH 流量（纯 JS 实现，可以做到字节级精确流量统计）
- **better-sqlite3** 做插件级持久化，通过 `@electron/rebuild` 为 Electron 重新编译
- **Konva** / **react-konva** 作为图片编辑器画布引擎
- **electron-store** 用于 app 级小型配置文件（窗口位置、主题、当前插件）

---

## 开发

```bash
# 安装依赖
npm install

# Electron 二进制下载慢可以用国内镜像：
#   export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

# 启动开发模式（渲染进程热更新 + 主进程改动自动重启）
npm run dev

# 生产构建（输出到 ./out）
npm run build

# 打包发布产物（输出到 ./dist）
npm run package
```

开发模式会自动打开 DevTools；运行时数据（SQLite 数据库、窗口位置、主题设置）保存在用户配置目录：

- **Windows** — `%APPDATA%/DevToolkit/`
- **macOS** — `~/Library/Application Support/DevToolkit/`
- **Linux** — `~/.config/DevToolkit/`

各插件的数据库文件位于 `<configDir>/databases/<pluginId>.db`。

### 原生模块重新编译

`better-sqlite3` 是原生模块，必须和 Electron 的 Node ABI 匹配。`npm run package` 会通过 `electron-builder` 自动处理，但如果 `npm run dev` 时报 ABI 不匹配错误，可以手动执行：

```bash
npx electron-rebuild -f -w better-sqlite3
```

---

## 打包与分发

`npm run package` 会针对当前操作系统产出一个可分发的安装包：

- **Windows** — `dist/DevToolkit Setup <version>.exe`（NSIS，约 80 MB）
- **macOS** — `dist/DevToolkit-<version>.dmg`
- **Linux** — `dist/DevToolkit-<version>.AppImage`

`electron-builder` 只能针对当前运行的操作系统打包；要同时产出三平台的包，需要 CI 矩阵构建（见下方 [云构建](#云构建) 章节）。

### 代码签名

仓库里是**未签名**的版本。Windows 用户首次运行会看到 SmartScreen 警告（点"更多信息" → "仍要运行"）。如果要签名发布，可在 [electron-builder.yml](electron-builder.yml) 的 `win` / `mac` 下配置证书信息。

---

## 云构建

仓库内置了 GitHub Actions 工作流 [.github/workflows/release.yml](.github/workflows/release.yml)，可以在 GitHub 云端为 Windows、macOS、Linux **三平台并行打包**，无需本地准备所有系统。

### 触发方式

**方式 1：推送 tag 自动触发（推荐）**

```bash
# 更新版本号
npm version 1.0.1

# 推送 tag，自动触发云构建
git push origin main --tags
```

**方式 2：手动触发**

到仓库页面 → **Actions** → 选择 **Release** 工作流 → 点击 **Run workflow**，选择分支即可。

### 工作流会做什么

1. 在 `ubuntu-latest`、`macos-latest`、`windows-latest` 三个 runner 并行运行
2. 每个 runner 都执行 `npm ci` + `npm run build` + `electron-builder` 打包
3. `better-sqlite3` 会自动为对应平台的 Electron 重新编译
4. 构建完成后：
   - 如果是 tag 触发，自动创建一个 GitHub Release 草稿，上传所有平台的安装包到 Release Assets
   - 如果是手动触发，产物会上传为 workflow artifacts（在 Actions 运行页面下载）

### 跑完后在哪里看结果

- **Releases** 页面 (`https://github.com/glight2000/DevToolKit/releases`) 可以看到新生成的 release，里面有 `.exe` / `.dmg` / `.AppImage` 等文件
- **Actions** 页面可以看到构建日志

---

## 手动创建 Release（不走 CI）

如果你已经在本地用 `npm run package` 打好了包，也可以手动创建 Release：

### 方式 1：GitHub 网页

1. 打开 `https://github.com/glight2000/DevToolKit/releases`
2. 点击右上角 **Draft a new release**
3. **Choose a tag** → 输入 `v1.0.0`（不存在就会现场创建）
4. **Release title**: 例如 `DevToolkit 1.0.0`
5. **Describe this release**: 写更新内容
6. 把本地 `dist/DevToolkit Setup 1.0.0.exe` 直接拖进 **Attach binaries** 区域
7. 点击 **Publish release**

### 方式 2：gh CLI（如果装了 [GitHub CLI](https://cli.github.com/)）

```bash
# 先创建一个 tag
git tag v1.0.0
git push origin v1.0.0

# 一条命令创建 release 并上传产物
gh release create v1.0.0 \
  "dist/DevToolkit Setup 1.0.0.exe" \
  --title "DevToolkit 1.0.0" \
  --notes "首个发布版本"
```

---

## 安全说明

- [src/main/lib/constants.ts](src/main/lib/constants.ts) 里的 `APP_ENCRYPTION_KEY` 是**故意硬编码的**——它只是为了让偶然拿到 SQLite 文件的人读不懂内容，仅此而已。**不要把它当成真正的安全措施**。
- Notebook 插件的"独立文档密码"则完全不同：它使用用户设置的密码通过 PBKDF2 (10 万次迭代 + SHA-256) 派生出密钥，用 AES-GCM 加密文档内容。密码本身不会存储，只存 SHA-256 hash 用于解锁时的校验。
- SSH 密码、私钥路径、passphrase 存在 SSH Tunnel 插件的 SQLite 文件中，用内置密钥做字段级加密。如果你的场景无法接受这种强度，请使用密钥认证并留空密码字段。
- "一键部署公钥"功能通过 `ssh2` 连接远程机器，读取本机 `~/.ssh/*.pub`，用安全转义后的 shell 命令追加到远程 `~/.ssh/authorized_keys`。

---

## License

MIT——自由使用。
