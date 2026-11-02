# DevToolkit

一个面向开发者的可插拔多工具桌面应用，基于 Electron + React + TypeScript 构建。内置 SSH 隧道管理器、Markdown 记事本，以及一批常用小工具——全部通过左侧导航一键切换。

[English](./README.md) | **简体中文**

![platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)
![electron](https://img.shields.io/badge/electron-44-47848F?logo=electron&logoColor=white)
![react](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)
![typescript](https://img.shields.io/badge/typescript-7-3178C6?logo=typescript&logoColor=white)

---

## 功能特性

### Shell 壳层

- 左侧导航栏，一键切换各个工具
- 弹窗支持 Escape 关闭与焦点恢复；工具标签支持方向键、Home / End，布局适配较小窗口
- 加密和时间工具在内部标签间切换时保留输入；离开该工具后清除临时状态，不写入磁盘
- 复制操作提供成功 / 失败反馈，增强浅色主题对比度，并尊重系统减少动画的偏好
- 亮色 / 暗色主题，偏好自动持久化
- 侧栏底部可随时切换 Modern（现代宽松）/ Compact（紧凑）界面；与明暗主题独立组合，重启后保留选择
- 系统托盘集成——关闭主窗口只是隐藏到托盘，后台任务（SSH 隧道等）继续运行，只有从托盘菜单"退出"才真正退出
- 单实例锁，第二次启动时会把已有窗口拉到前台
- 每个插件使用独立的加密 SQLite 数据库（字段级 AES-256-CBC + 内置密钥，仅为"防君子"级别保护，不是高强度安全）

### 内置工具

新建隧道时自动发现 Windows 用户 / 系统 SSH config 以及运行中 WSL 发行版的明确 `Host` 别名；选择后预览并填入连接字段。未运行的发行版需点击 **Start and read** 才会启动读取。支持 Include、Host 通配符 / 排除项、先出现的值优先、多密钥选择和常用密钥路径占位符。WSL 密钥路径转换为 `\\wsl.localhost\<发行版>\...`，网络连接仍从 Windows 发起。

导入只复制当前连接字段，不修改 SSH config、不读取私钥内容、不自动连接；保存前需设置转发端口和认证信息。条件 Match、动态 Include、跳板机 / 命令代理、Agent / 证书及不支持的连接策略会明确报告，当前 ssh2 引擎不能导入这些配置。配置中的转发 / 会话选项会提示未导入，不会静默套用。配置变更后可手动刷新。

| 工具 | 说明 |
|------|------|
| **SSH Connections** | 软件连接库与 Windows / WSL SSH config 来源分别维护；支持分组、标签、收藏、最近打开、搜索、网格 / 列表、快速连接、软件内多标签终端及外部终端。有 WSL 时新建连接默认选择 WSL。 |
| **SSH Tunnel** | 管理 local / remote / dynamic (SOCKS5) SSH 隧道，实时流量统计、指数退避自动重连、启动时自动开启、SSH 命令行导入导出、一键打开系统终端连接、公钥自动检测和部署 |
| **Notebook** | 层级结构的 Markdown 文档，支持实时预览、文档锁定、独立密码加密（PBKDF2 + AES-GCM，用户自定密码） |
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

- **Electron 44** + **electron-vite** 构建体系
- **React 19** + **TypeScript 7**
- **TailwindCSS 4**（通过 CSS 变量实现运行时主题切换）
- **Lucide React** 图标库
- **ssh2** 处理所有 SSH 流量（纯 JS 实现，可以做到字节级精确流量统计）
- **better-sqlite3** 做插件级持久化，使用版本 13 自带的稳定 N-API 二进制
- **electron-store** 用于 app 级小型配置文件（窗口位置、主题、当前插件）

---

## 开发

需要 Node.js 24 或更高版本，CI 使用 Node.js 24 LTS。

直接依赖已更新到 2026-10-08 的最新稳定版本，Vite 除外：electron-vite 5 仅支持到 Vite 7，因此使用 Vite 7.3.7 和兼容的 React SWC 插件。Tailwind 改用 Vite 插件和 CSS 主题配置。已移除未使用的 Recharts、Electron Toolkit、旧 PostCSS 插件和 UUID 类型占位包。

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

### 验证与原生模块

新增 `npm run test:ssh`，覆盖 SSH 连接库、分组 / 收藏、配置维护和真实 PTY 终端输入输出。测试使用临时应用数据与配置夹具，不连接真实服务器、不修改系统 SSH 配置。

内置终端使用 xterm.js + node-pty，并调用相应环境的原生 OpenSSH；外部终端也可选。有 WSL 时，新建连接默认选择 WSL，系统别名固定使用它所属的环境。配置中的跳板机、Agent、Include 和 Match 由原生客户端处理。软件连接库使用 `ssh -F none`，独立保存，不会被系统配置覆盖；密码和私钥口令在终端输入，不保存到连接库。

系统配置编辑器维护各环境的用户 `~/.ssh/config`；Include 引用文件和系统级配置继续在外部编辑。保存前在 `<配置目录>/ssh-config-backups/` 备份，并检测外部修改冲突。软件连接库存放于 `databases/ssh-connections.db`，编辑、复制、删除都不修改系统配置。切换工具不会断开内置会话，关闭活动标签会要求确认；状态显示 SSH 进程状态，不把“进程已启动”误报为“登录成功”。

Windows / macOS 使用 node-pty 自带预编译模块；Linux 在构建的 `prepare:native` 步骤编译此模块，需要 Python、make 和 C++ 编译器。Windows 和选用的 WSL 发行版需安装 OpenSSH 客户端。界面交互参考 [Termix](https://github.com/Termix-SSH/Termix)、[Tabby](https://github.com/Eugeny/tabby) 和 [electerm](https://github.com/electerm/electerm)。

`npm run build` 会先检查主进程和渲染进程类型，再执行构建。`npm test` 运行回归测试；`npm run test:smoke` 使用临时配置目录、隐藏窗口运行 Electron 冒烟测试，截图保存在 `out/test-artifacts/`。无显示环境的 Linux 可使用 `xvfb-run -a npm run test:smoke`。

`better-sqlite3` 13 自带 Windows、macOS、Linux 的 N-API 二进制，在当前打包目标上无需针对 Electron 重新编译；打包时这些文件保持在 ASAR 外。

项目 `.npmrc` 禁用了依赖安装脚本，避免 npm 隐式重编译 SQLite。当前目标使用随包发布的 SQLite、SWC 和 esbuild 二进制，SSH 的可选加速模块使用 JavaScript 回退实现。Electron 在首次使用时下载。`npm run build` 等显式命令仍正常执行。

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
2. 每个 runner 都执行 `npm ci`、类型检查、构建、回归测试和 `electron-builder` 打包
3. `better-sqlite3` 使用随包发布的 N-API 二进制
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

## 桌面设置、窗口速切与悬浮组件

侧栏下方的设置区有四个页面，所有开关默认关闭，修改后自动保存，关闭主窗口后仍随托盘运行，退出应用会卸载快捷键与鼠标钩子。

- **桌面设置**：选择 `Alt` 或 `Alt + Shift`；按住修饰键配合左键拖动移动窗口，配合右键拖动调整大小。支持普通窗口，最大化、全屏和不可调整大小的窗口保留原生操作；高权限窗口受 Windows 权限限制。
- **窗口速切**：`Win + Space` 呼出鼠标所在屏幕中央的窗口搜索。按标题或应用名过滤，方向键选择、回车或点击激活，`Shift + 回车/点击` 将目标窗口移到当前虚拟桌面再激活。只列出已打开窗口。开启期间会接管 Windows 原有的 `Win + Space` 输入法切换，关闭后恢复；设置页也可立即试用。
- **悬浮组件**（边缘停靠面板）：记事本、时钟、剪贴板独立开关。可选「独立停靠」或「联动停靠」：独立模式分别移动和缩放，自动隐藏面板互斥展开；联动模式将已开启组件（包括订阅组件）连续放入同一侧栏，整体移动、缩放、展开、收起与固定。两种模式分别记住位置和固定状态，切换不清空内容。靠工作区边缘 24 像素自动停靠；移开等待 80ms，再用 110ms 收起，展开动画 150ms；重新悬停可反向中断收起，遵循系统减少动态效果设置。收起手柄使用中性边框和文字，图标保留组件色，展开样式不变。移到中间或 Pin 后保持展开。
- 悬浮记事本自动写入 `desktop.db`，沿用项目内置字段加密，不提供独立密码保护。剪贴板仅在开启后监测文本，最多 30 条、每条 2 万字，仅存内存；关闭组件或退出应用清空历史。跳过常见密码管理器保密标记，但普通文本无法可靠判断是否敏感。

系统窗口控制当前面向 Windows x64。多桌面使用 MIT 授权的 [VirtualDesktopAccessor](https://github.com/Ciantic/VirtualDesktopAccessor/releases/tag/2024-12-16-windows11)，随包附带许可证并在构建时核验 SHA-256；兼容性在启动时检测，接口不可用会显示状态。界面交互参考 [Alfred](https://www.alfredapp.com/)，窗口列表与桌面服务为本项目实现。

**快捷启动**使用 `Alt + Space` 呼出，支持工具跳转、桌面操作、日期时间与 UUID 复制、计算和网页搜索。在对应设置页开启并选择功能分类，主题跟随主界面。

所有停靠组件共用一块显示器，在「悬浮组件 → 停靠显示器」选择，默认主屏。独立和联动模式下的拖动、缩放均限制在所选屏幕内；断开时临时回到主屏，重连后恢复所选屏幕。

`npm run build` / `npm run dev` 会用 Windows 自带的 .NET Framework 编译器构建独立的 `DesktopHost.exe`，不需要安装常驻脚本工具。Windows 打包自动带上 `build/desktop`；其他平台跳过此辅助程序。可运行 `npm run test:desktop` 检查独立窗口 UI，`node tests/desktop-native-smoke.mjs` 在兼容的 Windows 11 上验证真实窗口枚举和跨桌面移动（仅操作测试窗口）。

## AI 订阅（本地与 SSH 环境）

“AI 订阅”默认置顶一个不可修改、不可删除的**本地环境**，启动时自动读取当前系统用户的 Codex / Claude 登录、额度和会话索引，支持刷新与桌面悬浮。直接调用本机 CLI，无需 SSH 或 Python；遵循当前 `CODEX_HOME` / `CLAUDE_CONFIG_DIR` 和默认目录。Windows 与 WSL 是独立环境，不混用账号数据。

远端环境复用 **SSH Connections** 中已保存的软件配置或 Windows／WSL 系统 config 别名。先添加 SSH 连接，再在此页添加环境；可指定远端 `CODEX_HOME` / `CLAUDE_CONFIG_DIR`，留空遵循远端环境变量和默认目录。

- 每个环境展示 Codex／Claude 的账号、套餐、额度窗口、重置时间、余额、服务实际提供的额度重置券与到期明细。缺失数据标为“未提供”，不当作零。Codex 的券库存数量以服务返回的总数为准，可能多于明细行。
- 使用压力根据额度比例和窗口进度估算；不推算精确费用或完整使用历史。详情包含服务端可提供的 token 统计，以及本应用最近 7 天的额度采样，最多保存 2000 个采样。
- 对话页只读取最近 100 条 Codex 会话，以及 Claude 的历史／项目会话索引（每个客户端最多 100 条）。不启动或恢复对话，不下载完整正文；历史属于环境，未必属于当前登录账号。
- 在「AI 订阅 → 停靠设置」或「悬浮组件 → AI 额度组件」开启一个汇总组件。Windows 和本机 WSL 默认进入缩略网格；远端环境可勾选“收起时显示”。1–3 项一行，4–6 项两行，7–9 项三行，每格显示环境及 Codex／Claude 套餐、剩余额度。展开后横向显示全部环境和厂商详情，高度固定为 360 DIP（小屏幕自动适配），左右边缘可调整宽度，最多占满当前工作区，超出部分横向滚动。支持 Pin、快速展开收起及联动停靠。
- Windows 自动发现本机 WSL 发行版，作为不可编辑或删除的本地环境单独读取，不需要 SSH 配置。读取可能启动发行版；发行版内需要 Python 3 和对应 CLI。凭据留在该环境，只返回经过字段过滤的展示数据。
- 窗口速切即时跟随主界面明暗主题。联动组件组支持四边及四角缩放，靠右可从左边向内拖宽，宽度增加后组件自动分列。
- 窗口速切、常规组件和订阅组件保持置顶，并在展开、收起和跨桌面定位后恢复顶层；Windows 系统安全桌面不在应用可覆盖范围内。
- 远端当前支持安装 Python 3 的 Linux／WSL／macOS，Codex 需要可用的 `codex app-server`，Claude 使用 `claude auth status` 和兼容额度接口。后台 SSH 使用密钥或 agent，严格核验已知主机指纹；先在 SSH Connections 中完成首次连接。密码交互认证和远端 Windows 原生 shell 暂不支持后台读取。
- 采集脚本通过 SSH 标准输入临时执行，不安装远端常驻服务。认证凭据只在远端使用，不传回本机；本机保存经过字段白名单筛选的展示快照、会话标题与采样，沿用现有数据库字段加密。不会执行登录、退出、账号切换、券兑换或充值。
- Codex 与 Claude 独立调度，默认正常刷新周期为 5 分钟。Codex 按环境配置，失败后 5→10→20→40→60 分钟重试。Claude 连续失败默认按 5→20→60→1440 分钟重试，此后每 24 小时重试；未登录、凭据不可读或订阅查询不支持时默认暂停自动读取，不会被 Codex 的刷新带动。页面右上角「刷新设置」可设置 Claude 的正常周期、重试阶段及暂停开关。间隔范围 2–10080 分钟，重试不会短于正常周期；成功后清零连续失败计数。重试时间、失败次数和暂停状态持久化，重启不会提前查询。全局串行执行；手动刷新至少间隔 2 分钟，可以重新检测登录或提前重试。离线／鉴权失败保留上次读数并标记，移除记录不会删除远端数据或 SSH 配置。

Codex 使用官方 [app-server](https://learn.chatgpt.com/docs/app-server) 的账号、额度、用量和会话列表接口；不同 CLI 版本与套餐可能缺少部分能力。Claude 兼容额度接口并非稳定公开 API，API key／自定义服务不按订阅查询，部分系统凭据库暂不能读取，重置券不作可用性承诺。

验证：`npm test`、`npm run test:subscriptions`、`npm run test:desktop`。Python 采集器测试可在 WSL 中执行 `python3 tests/fixtures/test-collector.py src/main/plugins/subscriptions/collector.py`，仅使用隔离的模拟凭据和 CLI。

本地完整打包使用 `npm run package:dir`，固定复用 `dist/win-unpacked`，不按修改内容新建输出目录。

数据库已改存到用户数据目录的 `devtoolkit-data/databases`。旧 `databases` 目录与 Chromium 的废弃 WebSQL 目录冲突；升级首次启动会在创建窗口前通过 SQLite backup 迁移现有数据库（含已提交的 WAL），并校验副本，不覆盖已迁移的新数据。

## License

MIT——自由使用。
