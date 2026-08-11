# macOS 高星开源项目精选

> 搜罗 GitHub 上高星、高热度且**支持 macOS 安装**的开源项目，覆盖开发工具、AI 工具、效率应用、系统工具。
> 
> 数据采集于 **2026-08-10**，星数为近似值（取整到千位），请以仓库实时数据为准。

---

## 一、开发工具

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Homebrew** | 42k | [github.com/Homebrew/brew](https://github.com/Homebrew/brew) | macOS 包管理器，92% Mac 开发者使用，装一切 | `brew install` |
| **iTerm2** | 16k | [github.com/gnachman/iterm2](https://github.com/gnachman/iterm2) | 终端模拟器，分屏/GPU 加速/即时回放，比默认 Terminal 快 35% | `brew install --cask iterm2` |
| **VS Code** | 160k+ | [github.com/microsoft/vscode](https://github.com/microsoft/vscode) | 微软开源编辑器，插件生态无敌，跨平台 | `brew install --cask visual-studio-code` |
| **OrbStack** | - | [orbstack.dev](https://orbstack.dev) | Docker Desktop 替代品，轻量快速，原生 Apple Silicon 支持 | 官网下载 DMG |
| **Postman** | - | [github.com/postmanlabs](https://github.com/postmanlabs) | API 开发与测试平台 | `brew install --cask postman` |
| **Insomnia** | 33k | [github.com/Kong/insomnia](https://github.com/Kong/insomnia) | 开源 API 客户端，REST/GraphQL/gRPC | `brew install --cask insomnia` |
| **TablePlus** | - | [tableplus.com](https://tableplus.com) | 现代数据库客户端，支持 MySQL/Redis/PostgreSQL | `brew install --cask tableplus` |
| **Sequel Ace** | 6k | [github.com/Sequel-Ace/Sequel-Ace](https://github.com/Sequel-Ace/Sequel-Ace) | MySQL/MariaDB 管理，轻量原生 | `brew install --cask sequel-ace` |
| **RedisInsight** | - | [github.com/RedisInsight/RedisInsight](https://github.com/RedisInsight/RedisInsight) | Redis 可视化管理，GUI 操作 | `brew install --cask redisinsight` |
| **DevToys** | - | [github.com/veler/DevToys](https://github.com/veler/DevToys) | 开发者工具箱（JSON 格式化/编码/哈希），跨平台 | `brew install --cask devtoys` |

## 二、AI 与本地大模型

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Ollama** | 178k | [github.com/ollama/ollama](https://github.com/ollama/ollama) | 本地 LLM 运行引擎，一行命令跑 Llama/Qwen/DeepSeek，OpenAI 兼容 API | `brew install ollama` |
| **Open WebUI** | 148k | [github.com/open-webui/open-webui](https://github.com/open-webui/open-webui) | 自托管 AI Web 界面，多用户/RAG/插件，ChatGPT 替代品 | Docker / `brew install open-webui` |
| **Jan** | 44k | [github.com/janhq/jan](https://github.com/janhq/jan) | 完全离线的 ChatGPT 替代品，支持多模型，隐私优先 | `brew install --cask jan` |
| **GPT4All** | 77k | [github.com/nomic-ai/gpt4all](https://github.com/nomic-ai/gpt4all) | 消费级硬件跑本地 LLM，开源可商用，CPU/GPU | `brew install --cask gpt4all` |
| **llama.cpp** | 123k | [github.com/ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp) | C/C++ LLM 推理引擎，纯 CPU/GPU 混合，Apple Metal 加速 | `brew install llama.cpp` |
| **MLX-LM** | 7k | [github.com/ml-explore/mlx-lm](https://github.com/ml-explore/mlx-lm) | Apple 原生 MLX 框架，Apple Silicon 专用 Python LLM 推理/微调 | `pip install mlx-lm` |
| **LM Studio** | - | [lmstudio.ai](https://lmstudio.ai) | 桌面 GUI 浏览/下载/运行本地 LLM，HuggingFace 集成 | 官网下载 DMG |
| **Anything LLM** | 65k | [github.com/Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | 本地优先 Agent 体验，多模型+RAG+Agent，完全自托管 | Docker / `brew install --cask anything-llm` |
| **LocalAI** | 48k | [github.com/mudler/LocalAI](https://github.com/mudler/LocalAI) | 开源 AI 引擎，无需 GPU 跑任何模型（LLM/视觉/语音/图像） | Docker / `brew install local-ai` |
| **Dify** | 152k | [github.com/langgenius/dify](https://github.com/langgenius/dify) | 可视化 AI 应用构建，Agent 工作流+RAG+多模型 | Docker |
| **Langfuse** | 33k | [github.com/langfuse/langfuse](https://github.com/langfuse/langfuse) | 开源 AI 工程平台：LLM 评估/可观测/指标/提示管理 | Docker |
| **Firecrawl** | 164k | [github.com/mendableai/firecrawl](https://github.com/mendableai/firecrawl) | 为 LLM 优化的网页爬取/搜索 API，大规模内容提取 | `brew install firecrawl` |

## 三、窗口与桌面管理

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Rectangle** | 25k | [github.com/rxhanson/Rectangle](https://github.com/rxhanson/Rectangle) | 窗口管理，快捷键/拖拽分屏，Magnet 免费替代品 | `brew install --cask rectangle` |
| **AeroSpace** | 10k+ | [github.com/nikitabobko/AeroSpace](https://github.com/nikitabobko/AeroSpace) | 平铺窗口管理器，i3 风格，无需禁用 SIP | `brew install --cask nikitabobko/tap/aerospace` |
| **AltTab** | 10k+ | [github.com/lwouis/alt-tab-macos](https://github.com/lwouis/alt-tab-macos) | Windows 风格 Alt-Tab，显示窗口缩略图，多显示器感知 | `brew install --cask alt-tab` |
| **Loop** | 7k | [github.com/MrKai77/Loop](https://github.com/MrKai77/Loop) | 优雅窗口管理，美观动画，快捷键+鼠标 | `brew install --cask loop` |
| **Yabai** | 22k+ | [github.com/koekeishiya/yabai](https://github.com/koekeishiya/yabai) | BSP 树平铺窗口管理器，i3 风格，需禁用 SIP | `brew install koekeishiya/formulae/yabai` |
| **Amethyst** | 14k | [github.com/ianyh/Amethyst](https://github.com/ianyh/Amethyst) | 自动平铺窗口管理器，Xcode 风格布局 | `brew install --cask amethyst` |
| **Magnet** | - | [magnet.crowdcafe.com](https://magnet.crowdcafe.com) | 经典窗口管理，拖拽分屏+快捷键（付费） | App Store |

## 四、菜单栏与系统工具

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Hidden Bar** | 10k+ | [github.com/dwarvesf/hidden](https://github.com/dwarvesf/hidden) | 隐藏菜单栏图标，轻量 MIT，Bartender 替代品 | `brew install --cask hiddenbar` |
| **Ice** | 15k+ | [github.com/jordanbaird/Ice](https://github.com/jordanbaird/Ice) | 菜单栏管理，Bartender 替代品，功能最全 | `brew install --cask ice` |
| **SketchyBar** | 6k | [github.com/FelixKratz/SketchyBar](https://github.com/FelixKratz/SketchyBar) | 完全自定义菜单栏替换，Lua 脚本，极客最爱 | `brew install felixkratz/formulae/sketchybar` |
| **OnlySwitch** | 4k | [github.com/jacklandrin/OnlySwitch](https://github.com/jacklandrin/OnlySwitch) | 菜单栏一键切换：暗色模式/隐藏文件/AirPods/专注模式 | `brew install --cask onlyswitch` |
| **Amphetamine** | - | [apps.apple.com/app/amphetamine/id937984704](https://apps.apple.com/app/amphetamine/id937984704) | 防止 Mac 休眠，定时/触发条件，App Store 免费 | App Store |
| **BetterDisplay** | 20k+ | [github.com/waydabber/BetterDisplay](https://github.com/waydabber/BetterDisplay) | HiDPI 控制/外接显示器亮度/虚拟屏幕，Apple Silicon 必备 | `brew install --cask betterdisplay` |
| **MonitorControl** | 29k | [github.com/MonitorControl/MonitorControl](https://github.com/MonitorControl/MonitorControl) | 外接显示器亮度/音量控制，键盘调节 | `brew install --cask monitorcontrol` |
| **Mac Mouse Fix** | 6k | [github.com/noah-nuebling/mac-mouse-fix](https://github.com/noah-nuebling/mac-mouse-fix) | 鼠标优化，让 $10 鼠标超越 Apple Trackpad | `brew install --cask mac-mouse-fix` |
| **Karabiner-Elements** | 18k | [github.com/pqrs-org/Karabiner-Elements](https://github.com/pqrs-org/Karabiner-Elements) | 键盘改键，Caps Lock→Hyper/Escape，几乎每个 Mac 用户首选 | `brew install --cask karabiner-elements` |
| **Hammerspoon** | 12k | [github.com/Hammerspoon/Hammersoon](https://github.com/Hammersoon/Hammerspoon) | macOS 自动化终极工具，Lua 脚本控制系统/窗口/热键 | `brew install --cask hammerspoon` |
| **Keyboard Cowboy** | 5k | [github.com/zenangst/KeyboardCowboy](https://github.com/zenangst/KeyboardCowboy) | 键盘快捷键工具，应用启动/窗口管理/宏 | `brew install --cask keyboardcowboy` |
| **Homerow** | 4k | [homerow.app](https://www.homerow.app) | Vimium 风格键盘导航，用键盘点击任何 UI 元素 | 官网下载 |

## 五、剪贴板与文本工具

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Maccy** | 12k | [github.com/p0deje/Maccy](https://github.com/p0deje/Maccy) | 轻量剪贴板历史，MIT，搜索+置顶，50-80MB 内存 | `brew install --cask maccy` |
| **Numi** | 8k | [github.com/nikolaeu/numi](https://github.com/nikolaeu/numi) | 文本计算器，自然语言计算（"10% of $200"），支持单位转换 | `brew install --cask numi` |
| **Soulver** | - | [soulver.app](https://soulver.app) | 文本计算器，变量/日期/货币计算（付费） | App Store |
| **Espanso** | 9k | [github.com/espanso/espanso](https://github.com/espanso/espanso) | 文本扩展器，快捷输入常用文本/日期/邮箱，跨平台 | `brew install espanso` |
| **aText** | - | [www.trankynam.com/atext/](https://www.trankynam.com/atext/) | 文本扩展，快捷替换（付费） | App Store |

## 六、截图与录屏

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Shottr** | 8k | [github.com/0x00A/Shottr](https://github.com/0x00A/Shottr) | 免费截图工具，滚动截图/OCR/标注/贴图，轻量强大 | `brew install --cask shottr` |
| **Kap** | 6k | [github.com/wulkano/Kap](https://github.com/wulkano/Kap) | 开源录屏工具，GIF/MP4/WebM 导出，插件扩展 | `brew install --cask kap` |
| **OBS Studio** | 60k | [github.com/obsproject/obs-studio](https://github.com/obsproject/obs-studio) | 专业录屏/直播，多场景/滤镜/插件，跨平台 | `brew install --cask obs` |
| **CleanShot X** | - | [cleanshot.com](https://cleanshot.com) | 截图+录屏+标注，Mac 截图付费标准（$29） | 官网下载 |

## 七、浏览器与网络

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Arc** | - | [arc.net](https://arc.net) | 革新浏览器，空间/画架/AI 集成（部分开源） | 官网下载 |
| **Zen Browser** | 15k+ | [github.com/zen-browser/desktop](https://github.com/zen-browser/desktop) | Firefox 分支，垂直标签/工作区/隐私优先 | `brew install --cask zen-browser` |
| **Bruno** | 25k | [github.com/usebruno/bruno](https://github.com/usebruno/bruno) | 开源 API 客户端，离线/ Git 存储，Postman 替代品 | `brew install --cask bruno` |
| **Proxyman** | - | [proxyman.io](https://proxyman.io) | 原生 HTTP 调试代理，Charles/mitmproxy 替代品 | `brew install --cask proxyman` |
| **Charles Proxy** | - | [charlesproxy.com](https://www.charlesproxy.com) | HTTP 代理/抓包/断点调试（付费） | 官网下载 |

## 八、媒体与文件

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **IINA** | 38k | [github.com/iina/iina](https://github.com/iina/iina) | 现代视频播放器，mpv 内核，暗色模式/PiP/网络流 | `brew install --cask iina` |
| **HandBrake** | 17k | [github.com/HandBrake/HandBrake](https://github.com/HandBrake/HandBrake) | 开源视频转码，几乎所有格式互转，批量处理 | `brew install --cask handbrake` |
| **ImageOptim** | 9k | [github.com/ImageOptim/ImageOptim](https://github.com/ImageOptim/ImageOptim) | 图片压缩优化，无损减小 PNG/JPG/GIF 体积 | `brew install --cask imageoptim` |
| **Keka** | - | [github.com/aonez/Keka](https://github.com/aonez/Keka) | 压缩/解压工具，7z/RAR/ZIP，加密分卷 | `brew install --cask keka` |
| **Transmission** | 11k | [github.com/transmission/transmission](https://github.com/transmission/transmission) | 轻量 BT 客户端，远程 Web 界面，低资源占用 | `brew install --cask transmission` |
| **qBittorrent** | 25k | [github.com/qbittorrent/qBittorrent](https://github.com/qbittorrent/qBittorrent) | 开源 BT 客户端，无广告，RSS 订阅，IP 过滤 | `brew install --cask qbittorrent` |

## 九、日历与提醒

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **Itsycal** | 5k | [github.com/sfsam/Itsycal](https://github.com/sfsam/Itsycal) | 菜单栏日历，轻量，显示月历+事件 | `brew install --cask itsycal` |
| **Calendr** | 3k | [github.com/pakerwreah/Calendr](https://github.com/pakerwreah/Calendr) | 菜单栏日历，暗色模式，简洁 | `brew install --cask calendr` |
| **MeetingBar** | 5k | [github.com/leits/MeetingBar](https://github.com/leits/MeetingBar) | 菜单栏会议提醒，一键加入 Zoom/Meet/Teams | `brew install --cask meetingbar` |
| **Pika** | 3k | [github.com/superhighfives/pika](https://github.com/superhighfives/pika) | 开源取色器，颜色格式转换，设计必备 | `brew install --cask pika` |

## 十、系统维护与增强

| 项目 | 约 Star | GitHub 地址 | 功能概要 | 安装方式 |
|------|--------:|-------------|----------|----------|
| **OnyX** | - | [www.titanium-software.fr/en/onyx.html](https://www.titanium-software.fr/en/onyx.html) | 系统维护工具，缓存清理/重建数据库/验证系统文件 | 官网下载 |
| **AppCleaner** | - | [freemacsoft.net/appcleaner/](https://freemacsoft.net/appcleaner/) | 应用彻底卸载，清理残留文件 | 官网下载 |
| **SwiftQuit** | 3k | [github.com/onebadidea/swiftquit](https://github.com/onebadidea/swiftquit) | 关闭窗口时自动退出应用（类似 Windows 行为） | `brew install --cask swiftquit` |
| **Scroll Reverser** | 2k | [github.com/pilotmoon/Scroll Reverser](https://github.com/pilotmoon/ScrollReverser) | 独立控制触控板/鼠标滚动方向 | `brew install --cask scroll-reverser` |
| **Linear Mouse** | 5k | [github.com/linearmouse/linearmouse](https://github.com/linearmouse/linearmouse) | 鼠标加速/滚动方向/按钮自定义 | `brew install --cask linearmouse` |
| **Stats** | 22k | [github.com/exelban/stats](https://github.com/exelban/stats) | 菜单栏系统监控（CPU/内存/网络/磁盘/温度/风扇） | `brew install --cask stats` |
| **eul** | 9k | [github.com/gao-sun/eul](https://github.com/gao-sun/eul) | SwiftUI 系统监控，暗色模式，简洁美观 | `brew install --cask eul` |

---

## 十一、按场景快速选型

### 开发者必备（零成本）

```bash
brew install --cask iterm2 visual-studio-code rectangle maccy shottr stats
brew install --cask hiddenbar karabiner-elements betterdisplay monitorcontrol
brew install --cask iina imageoptim keka itsycal meetingbar
```

### AI 开发者必备

```bash
brew install ollama                    # 本地 LLM 引擎
brew install --cask open-webui         # Web 界面
brew install --cask jan                # 离线 ChatGPT
brew install --cask anything-llm       # 本地 Agent
brew install firecrawl                 # 网页爬取供 LLM
```

### 效率提升（零成本）

```bash
brew install --cask rectangle alt-tab maccy hiddenbar ice
brew install --cask onlyswitch amphetamine betterdisplay
brew install --cask shottr kap numi itsycal
```

### 键盘极客

```bash
brew install --cask karabiner-elements hammerspoon aerospace sketchybar
brew install --cask keyboardcowboy homerow
```

---

## 参考来源

- [GitHub Topic: macos-apps](https://github.com/topics/macos-apps)
- [Open Source Mac Apps](https://github.com/serhii-londar/open-source-mac-os-apps)
- [Awesome Open Source Mac Apps](https://indiegoodies.com/awesome-open-source-mac-apps)
- [OpenSetApp](https://opensetapp.com)
- [macOS Power User Apps 206](https://www.youngju.dev/blog/culture/2026-05-16-macos-power-user-apps-2026)
- [Ollama vs LM Studio 2026](https://www.dottie.ai/blog/ollama-vs-lm-studio/)
- [Local LLMs on macOS](https://slavadubrov.github.io/blog/2025/05/10/local-llms-on-macos/)

> 配套：大模型概念与原理 →「[大模型/训练与部署](训练与部署/)」；Agent 实战 →「[大模型/智能体](智能体/)」；RAG 实战 →「[大模型/RAG](RAG/)」；前沿项目 →「[大模型/前沿开源项目精选](前沿开源项目精选.md)」。
