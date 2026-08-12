# 📖 知识库网站（website/）

把整个知识库以**现代知识星球风格**的网站形式呈现。所有内容**实时读取自 GitHub 仓库**（jsDelivr CDN + GitHub API），不拉取、不构建静态副本，仓库更新即网站更新。

## 快速使用

**方式一：直接打开（推荐，零部署）**

```
https://cdn.jsdelivr.net/gh/tghrxxxyyy/knowledge-base@main/website/index.html
```

**方式二：GitHub Pages / 任意静态托管**

把 `website/` 部署到任意静态服务器即可（纯前端，无后端依赖）。

**方式三：本地预览**

```bash
cd website
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 技术架构

| 层 | 选型 | 说明 |
|----|------|------|
| 渲染 | marked.js 12 | Markdown → HTML，自定义 renderer 拦截相对链接/图片 |
| 高亮 | highlight.js 11 | 代码块语法高亮（github-dark 主题） |
| 图表 | Mermaid 10 | ` ```mermaid ` 代码块渲染为流程图 |
| 公式 | KaTeX 0.16 | `$...$` / `$$...$$` 数学公式 |
| 样式 | 手写 CSS | 玻璃拟态 + 极光渐变 + 星点闪烁，深/浅双主题 |
| 目录数据 | `search-index.json` | 本地构建的索引（路径/标题/摘要/行数） |
| 文档内容 | jsDelivr CDN | `cdn.jsdelivr.net/gh/<repo>@<branch>/<path>` 实时拉取 |
| 降级 | GitHub Trees API | 索引加载失败时回退 git trees 接口 |

## 文件结构

```
website/
├── index.html          # 单页应用入口
├── css/style.css       # 全部样式（玻璃拟态/极光背景/响应式）
├── js/app.js           # 主逻辑（索引/侧栏/路由/渲染/搜索）
├── build-index.py      # 构建 search-index.json 的脚本
├── search-index.json   # 目录索引（构建产物，随仓库推送）
└── README.md           # 本文档
```

## 功能特性

- 🗂️ **目录树**：16 大板块分组侧边栏，折叠/展开，README 置底
- 🔍 **即时搜索**：标题/路径/板块/摘要模糊匹配，`/` 快捷键唤起，高亮命中
- 📄 **文档阅读**：面包屑、右键工具栏（GitHub 原文/原始 MD/回顶部）、上一篇/下一篇
- 🧭 **页内大纲**：右侧 TOC 随滚动高亮（≥1200px 显示）
- 🔗 **站内互链**：相对 `.md` 链接在站内打开，锚点平滑滚动，图片自动转 CDN
- 🌙 **双主题**：深色星云 / 浅色卡片，localStorage 记忆
- 🏠 **仪表盘首页**：统计数字 + 四条阅读路径 + 板块卡片网格
- 📱 **响应式**：移动端抽屉式侧边栏

## 更新索引（新文档入库后执行）

```bash
cd website
python3 build-index.py   # 重新扫描全部 md，生成 search-index.json
git add website/search-index.json && git commit && git push
```

> 每次知识库新增/改名文档后，记得重新生成 `search-index.json` 并推送，网站侧边栏与搜索才会包含新文档。