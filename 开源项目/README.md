# 开源项目精选（GitHub 超高星仓库）

> **口诀：星标是「 bookmark（收藏）」不是「 quality（质量）」——看 stars 找方向，看 commits / downloads / dependents 看真用。**

本板块搜罗 GitHub 上**超高星（ultra-high-star）**的开源项目，按领域分类，列出**仓库地址 + 该要说明**，方便快速建立「开源世界地图」。所有星数均为**近似值，数据采集于 2026-07**，会随时间波动，请以仓库实时数据为准。

---

## 一、为什么做这个板块

GitHub 上有数亿仓库，头部高星项目几乎定义了现代软件开发的工具链与学习路径。但它们散布在各处，新人容易「管中窥豹」。这里把它们**按领域聚类、按星数排序、附一句话定位**，作为：

- 技术选型的「候选清单」
- 学习路线的「地图册」
- 面试与视野的「常识库」

> ⚠️ **星标 ≠ 质量**：GitHub 星标榜前几名多为「清单类 / 教程类」仓库（awesome、freeCodeCamp、public-apis 等），它们不产出可运行二进制，衡量的是「收藏量」。真正在生产跑的库（React、Linux、TensorFlow、Kubernetes、VS Code）同样星量惊人，但要看 **npm downloads / commit cadence / dependents 图** 才是效用信号。

---

## 二、数据来源与口径

- 主排名参考：[EvanLi/Github-Ranking](https://github.com/EvanLi/Github-Ranking)、[hotgit Top Stars](https://www.hotgit.org/en/repos?category=top_stars)、[githublb](http://githublb.vercel.app/)、[ghtrends LLM](https://ghtrends.dev/zh/trends/llm) 等 2026 年公开榜单。
- 星数为「约 Xk / 约 X万」，**非实时**，仅供量级参考；精确值请点进仓库查看。
- 只收录**公开、活跃、影响力大**的仓库；商业化闭源项目不收录。

---

## 三、总榜：百星俱乐部（约 54 个 ≥100k 仓库，按星数降序）

> 说明列末的「分类」可点击跳转对应详解文件。

| 排名 | 仓库 | 约 Star | 主语言 | 分类 | 一句话该要说明 |
|----:|------|--------:|------|------|----------------|
| 1 | [codecrafters-io/build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) | 515k | Markdown | [学习](07-学习资源与Awesome清单.md) | 从零造轮子学编程，2026 全站星标第一 |
| 2 | [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | 478k | 列表 | [学习](07-学习资源与Awesome清单.md) | 各类主题精选清单的鼻祖（Awesome 元清单） |
| 3 | [freeCodeCamp/freeCodeCamp](https://github.com/freeCodeCamp/freeCodeCamp) | 450k | TypeScript | [学习](07-学习资源与Awesome清单.md) | 免费编程学习平台与课程，惠及数百万人 |
| 4 | [public-apis/public-apis](https://github.com/public-apis/public-apis) | 443k | Python | [学习](07-学习资源与Awesome清单.md) | 免费 API 大合集，开发者人手一份 |
| 5 | [EbookFoundation/free-programming-books](https://github.com/EbookFoundation/free-programming-books) | 388k | 文本 | [学习](07-学习资源与Awesome清单.md) | 免费编程书籍资源目录，多语言 |
| 6 | [openclaw/openclaw](https://github.com/openclaw/openclaw) | 378k | TypeScript | [AI](03-人工智能与机器学习.md) | 开源个人 AI 助手，任意 OS 的 Agent 化代表 |
| 7 | [nilbuild/developer-roadmap](https://github.com/nilbuild/developer-roadmap) | 358k | TypeScript | [学习](07-学习资源与Awesome清单.md) | 交互式开发者成长路线图 |
| 8 | [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer) | 354k | Python | [学习](07-学习资源与Awesome清单.md) | 大规模系统设计学习与面试经典 |
| 9 | [jwasham/coding-interview-university](https://github.com/jwasham/coding-interview-university) | 352k | 列表 | [学习](07-学习资源与Awesome清单.md) | 成为软件工程师的完整 CS 学习计划 |
| 10 | [vinta/awesome-python](https://github.com/vinta/awesome-python) | 304k | Python | [学习](07-学习资源与Awesome清单.md) | Python 框架/库/工具精选清单 |
| 11 | [awesome-selfhosted/awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | 290k | 列表 | [学习](07-学习资源与Awesome清单.md) | 可自托管软件服务清单（数据主权必备） |
| 12 | [996icu/996.ICU](https://github.com/996icu/996.ICU) | 276k | 列表 | [学习](07-学习资源与Awesome清单.md) | 「工作 996，生病 ICU」开发者权益现象级 |
| 13 | [practical-tutorials/project-based-learning](https://github.com/practical-tutorials/project-based-learning) | 265k | 列表 | [学习](07-学习资源与Awesome清单.md) | 基于项目学习的教程合集 |
| 14 | [facebook/react](https://github.com/facebook/react) | 246k | JavaScript | [前端](02-前端框架与移动开发.md) | 构建 Web/原生 UI 的库，生态事实标准 |
| 15 | [torvalds/linux](https://github.com/torvalds/linux) | 230k | C | [系统](08-底层系统与知名项目.md) | Linux 内核源码，互联网基础设施底座 |
| 16 | [TheAlgorithms/Python](https://github.com/TheAlgorithms/Python) | 220k | Python | [学习](07-学习资源与Awesome清单.md) | 用 Python 实现全部算法，学习宝库 |
| 17 | [trimstray/the-book-of-secret-knowledge](https://github.com/trimstray/the-book-of-secret-knowledge) | 220k | 列表 | [学习](07-学习资源与Awesome清单.md) | 手册/速查表/CLI 工具大杂烩 |
| 18 | [vuejs/vue](https://github.com/vuejs/vue) | 210k | TypeScript | [前端](02-前端框架与移动开发.md) | 渐进式前端框架，易上手文档友好 |
| 19 | [ossu/computer-science](https://github.com/ossu/computer-science) | 203k | HTML | [学习](07-学习资源与Awesome清单.md) | 免费自学计算机科学路径 |
| 20 | [trekhleb/javascript-algorithms](https://github.com/trekhleb/javascript-algorithms) | 196k | JavaScript | [学习](07-学习资源与Awesome清单.md) | JS 实现算法与数据结构并配讲解 |
| 21 | [tensorflow/tensorflow](https://github.com/tensorflow/tensorflow) | 195k | C++ | [AI](03-人工智能与机器学习.md) | Google 开源机器学习框架，工业级 |
| 22 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 192k | Python | [AI](03-人工智能与机器学习.md) | 自进化 AI Agent（持久记忆、技能沉淀） |
| 23 | [n8n-io/n8n](https://github.com/n8n-io/n8n) | 190k | TypeScript | [工具](06-开发工具与终端效率.md) | Fair-code 工作流自动化，原生 AI 能力 |
| 24 | [ohmyzsh/ohmyzsh](https://github.com/ohmyzsh/ohmyzsh) | 188k | Shell | [工具](06-开发工具与终端效率.md) | 社区驱动 zsh 配置框架，300+ 插件 |
| 25 | [microsoft/vscode](https://github.com/microsoft/vscode) | 185k | TypeScript | [工具](06-开发工具与终端效率.md) | 微软开源编辑器，插件生态无敌 |
| 26 | [Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | 184k | Python | [AI](03-人工智能与机器学习.md) | 引爆「自主 AI Agent」浪潮的项目 |
| 27 | [getify/You-Dont-Know-JS](https://github.com/getify/You-Dont-Know-JS) | 184k | 列表 | [学习](07-学习资源与Awesome清单.md) | 深入 JS 语言系列的免费书 |
| 28 | [CyC2018/CS-Notes](https://github.com/CyC2018/CS-Notes) | 184k | 列表 | [学习](07-学习资源与Awesome清单.md) | 中文技术面试必备（计网/OS/系统等） |
| 29 | [jackfrued/Python-100-Days](https://github.com/jackfrued/Python-100-Days) | 181k | Jupyter | [学习](07-学习资源与Awesome清单.md) | Python 100 天从新手到大师 |
| 30 | [flutter/flutter](https://github.com/flutter/flutter) | 177k | Dart | [前端](02-前端框架与移动开发.md) | Google 跨平台 UI 工具包，一套代码多端 |
| 31 | [github/gitignore](https://github.com/github/gitignore) | 174k | 文本 | [工具](06-开发工具与终端效率.md) | 各类 .gitignore 模板集合 |
| 32 | [twbs/bootstrap](https://github.com/twbs/bootstrap) | 174k | HTML/CSS | [前端](02-前端框架与移动开发.md) | 最流行的响应式前端框架 |
| 33 | [awesome-go/awesome-go](https://github.com/awesome-go/awesome-go) | 172k | Go | [学习](07-学习资源与Awesome清单.md) | Go 框架/库/软件精选清单 |
| 34 | [ollama/ollama](https://github.com/ollama/ollama) | 170k | Go | [AI](03-人工智能与机器学习.md) | 本地一键跑大模型，隐私友好 |
| 35 | [AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | 163k | Python | [AI](03-人工智能与机器学习.md) | SD 的 Web UI，AI 绘画入门标配 |
| 36 | [huggingface/transformers](https://github.com/huggingface/transformers) | 162k | Python | [AI](03-人工智能与机器学习.md) | 海量预训练模型库，推理训练一体 |
| 37 | [jlevy/the-art-of-command-line](https://github.com/jlevy/the-art-of-command-line) | 161k | 列表 | [学习](07-学习资源与Awesome清单.md) | 一页掌握命令行的艺术 |
| 38 | [f/prompts.chat](https://github.com/f/prompts.chat) | 160k | HTML | [学习](07-学习资源与Awesome清单.md) | 原 Awesome ChatGPT Prompts 提示词合集 |
| 39 | [DigitalPlatDev/FreeDomain](https://github.com/DigitalPlatDev/FreeDomain) | 160k | HTML | [学习](07-学习资源与Awesome清单.md) | 免费域名项目 |
| 40 | [Snailclimb/JavaGuide](https://github.com/Snailclimb/JavaGuide) | 156k | Java | [学习](07-学习资源与Awesome清单.md) | Java 面试与后端通用指南（owner: Snailclimb） |
| 41 | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | 154k | Python | [系统](08-底层系统与知名项目.md) | 功能极强的命令行音视频下载器 |
| 42 | [HelloGitHub/HelloGitHub](https://github.com/HelloGitHub/HelloGitHub) | 148k | Python | [学习](07-学习资源与Awesome清单.md) | 分享有趣、入门级开源项目（中文社区） |
| 43 | [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) | 146k | C/Java | [系统](08-底层系统与知名项目.md) | 电脑显示并控制安卓设备，无需 root |
| 44 | [langgenius/dify](https://github.com/langgenius/dify) | 145k | TypeScript | [AI](03-人工智能与机器学习.md) | 生产级 LLM 应用开发平台 |
| 45 | [open-webui/open-webui](https://github.com/open-webui/open-webui) | 141k | Python | [AI](03-人工智能与机器学习.md) | 自托管 AI 对话界面，可完全离线 |
| 46 | [vercel/next.js](https://github.com/vercel/next.js) | 141k | JavaScript | [前端](02-前端框架与移动开发.md) | React 元框架，生产 React 首选 |
| 47 | [yangshun/tech-interview-handbook](https://github.com/yangshun/tech-interview-handbook) | 141k | JavaScript | [学习](07-学习资源与Awesome清单.md) | 技术面试通关手册 |
| 48 | [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | 140k | Python | [AI](03-人工智能与机器学习.md) | Agent 工程平台，编排 LLM/工具/RAG |
| 49 | [rust-lang/rust](https://github.com/rust-lang/rust) | 113k | Rust | [语言](01-编程语言与运行时.md) | 内存安全无 GC 的系统级语言 |
| 50 | [nodejs/node](https://github.com/nodejs/node) | 110k | JS/C++ | [语言](01-编程语言与运行时.md) | Node.js 运行时，前端/全栈基石 |
| 51 | [denoland/deno](https://github.com/denoland/deno) | 107k | Rust | [语言](01-编程语言与运行时.md) | 安全的 JS/TS 运行时，Node 现代替代 |
| 52 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | 105k | TypeScript | [语言](01-编程语言与运行时.md) | 给 JS 加静态类型的超集 |
| 53 | [pytorch/pytorch](https://github.com/pytorch/pytorch) | 101k | Python | [AI](03-人工智能与机器学习.md) | 动态图深度学习框架，研究界首选 |
| 54 | [neovim/neovim](https://github.com/neovim/neovim) | 101k | Vim/C | [工具](06-开发工具与终端效率.md) | 超可扩展 Vim 衍生编辑器 |

> 📝 星数在 50k–100k 之间的高星项目（如 Spring Boot、FastAPI、Kubernetes、Docker、Grafana、Prometheus、Redis、Elasticsearch、ClickHouse、Tailwind、Vite、Svelte、Ant Design、React Native、Bun、uv 等）已收录在下方对应分类文件中。

---

## 四、按分类浏览（点击进入详解）

| 分类文件 | 内容 | 代表仓库 |
|----------|------|----------|
| [01-编程语言与运行时](01-编程语言与运行时.md) | 语言、运行时、工具链 | Go / Rust / Deno / Bun / TypeScript / Python / uv / ruff / tokio |
| [02-前端框架与移动开发](02-前端框架与移动开发.md) | 前端框架、UI 库、构建、移动 | React / Vue / Angular / Next.js / Tailwind / Vite / Flutter / RN |
| [03-人工智能与机器学习](03-人工智能与机器学习.md) | 深度学习、LLM、Agent、AIGC | TensorFlow / PyTorch / Transformers / Ollama / llama.cpp / LangChain / Dify |
| [04-后端框架与数据库](04-后端框架与数据库.md) | Web 框架、RPC、数据库缓存 | FastAPI / Gin / Django / Laravel / Spring Boot / Redis / ES / ClickHouse |
| [05-DevOps云原生与基础设施](05-DevOps云原生与基础设施.md) | 容器、编排、IaC、可观测 | Kubernetes / Docker / Terraform / Ansible / Prometheus / Argo CD |
| [06-开发工具与终端效率](06-开发工具与终端效率.md) | 编辑器、终端、CLI 效率 | VS Code / Oh My Zsh / Neovim / fzf / ripgrep / n8n |
| [07-学习资源与Awesome清单](07-学习资源与Awesome清单.md) | 教程、面经、路线、清单 | build-your-own-x / awesome / freeCodeCamp / system-design-primer |
| [08-底层系统与知名项目](08-底层系统与知名项目.md) | 内核、经典基建、国民工具 | Linux / Bitcoin / Git / curl / vim / scrcpy / yt-dlp |
| [09-数据基础设施与中间件](09-数据基础设施与中间件.md) | 消息、缓存、存储、计算引擎 | Kafka / Redis / ClickHouse / Flink / RocketMQ / ShardingSphere |
| [10-云原生与可观测性生态](10-云原生与可观测性生态.md) | CNCF 全景、三件套、服务网格、GitOps | Kubernetes / Prometheus / OpenTelemetry / Jaeger / Istio / Argo CD |

---

## 五、怎么用这份清单（建议路径）

1. **打地基**：先刷 [07 学习资源](07-学习资源与Awesome清单.md) 里的 `system-design-primer`、`coding-interview-university`、`developer-roadmap`。
2. **选语言**：在 [01 编程语言](01-编程语言与运行时.md) 里挑一门主攻（Java/Go/Python/Rust/TS 任其一）。
3. **做应用**：[02 前端](02-前端框架与移动开发.md) + [04 后端](04-后端框架与数据库.md) 组合出全栈能力。
4. **上云与交付**：[05 DevOps](05-DevOps云原生与基础设施.md) + 本库 [CI/CD 专题](../基础知识/CI-CD/README.md) 打通构建部署。
5. **追 AI 浪潮**：[03 人工智能](03-人工智能与机器学习.md) + 本库 [大模型板块](../大模型/) 深入 LLM/Agent。

---

## 六、与其他模块的关联

- 想系统学 **CI/CD / Jenkins / GitLab CI / GitOps** → [基础知识 / CI-CD](../基础知识/CI-CD/README.md)
- 想深入 **Kubernetes / 容器 / 云原生** → [云原生 / K8S](../云原生/K8S.md)
- 想看 **大数据全链路（采集/存储/计算/数仓/湖仓一体）** → [基础知识 / 大数据](../基础知识/大数据/README.md)
- 想补 **大模型 / RAG / 提示词 / Agent** → [大模型](../大模型/)

---

## 参考

- [EvanLi/Github-Ranking（Top 100 Stars）](https://github.com/EvanLi/Github-Ranking)
- [hotgit — Top Stars](https://www.hotgit.org/en/repos?category=top_stars)
- [githublb — Top Starred Repositories](http://githublb.vercel.app/)
- [ghtrends — Best LLM projects on GitHub](https://ghtrends.dev/zh/trends/llm)
- [attosol — Top 100 Projects on GitHub (2026)](https://www.attosol.com/posts/2026/top-100-projects-on-github/)

---

[← 返回首页](../README.md)
