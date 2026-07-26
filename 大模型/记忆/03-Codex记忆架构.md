# Codex 记忆架构

> Codex 的记忆同样分两层：**AGENTS.md**（你写的静态指令）与 **Memories**（agent 生成的笔记）。但关键区别是——Codex 的 `AGENTS.md` 是**纯静态**的，agent 不能自己改写它。

## 一、AGENTS.md 静态指令层（你写的）

### 1. 文件位置与优先级

```text
~/.codex/
├── AGENTS.md            # 全局指令
└── AGENTS.override.md   # 全局覆盖，优先于 AGENTS.md

your-repo/
├── AGENTS.md            # 仓库根指令（团队共享，提交 VCS）
├── AGENTS.override.md   # 仓库级覆盖，优先于 AGENTS.md
└── x/
    ├── AGENTS.md        # 子目录指令
    └── AGENTS.override.md
```

- **全局**：`~/.codex/AGENTS.md`（或同目录 `AGENTS.override.md` 优先）。
- **仓库根**：`./AGENTS.md`。
- **子目录**：`./x/AGENTS.md`（`override.md` 优先）。

### 2. 发现与拼接规则（root-first）

Codex 从 **git 仓库根向当前工作目录遍历**，每一级目录都按 `override → AGENTS.md → fallback` 的顺序检查，把命中的文件拼接成一条指令链（**root-first**，仓库根在最前）。

```text
git 仓库根 /
   ↓ 检查 override.md → AGENTS.md → fallback
读取 ./AGENTS.md
   ↓ 进入子目录
读取 ./x/AGENTS.md（或 ./x/AGENTS.override.md 优先）
   ↓ 拼接为指令链（root-first）
```

### 3. 大小上限与 fallback

- **默认上限 32 KiB**：由配置项 `project_doc_max_bytes` 控制，可调整；**超出部分静默截断**（不会报错，但内容被砍）。
- **可配 fallback 文件名**：通过 `project_doc_fallback_filenames`（如 `TEAM_GUIDE.md`）指定备选文件名，找不到 `AGENTS.md` 时回退使用。

```toml
# 示意：Codex 配置（具体键名以官方文档为准）
project_doc_max_bytes = 32768          # 32 KiB
project_doc_fallback_filenames = ["TEAM_GUIDE.md", "CONTRIBUTING.md"]
```

### 4. 跨工具约定与治理

- `AGENTS.md` 是 **Cursor / Aider / Jules 等共用的跨工具约定**，一份文件多工具复用。
- 该约定现已归入 **Linux Foundation Agentic AI Foundation** 规范（成为事实标准）。
- **agent 不能自主改写 `AGENTS.md`**：它就是个普通、受版本控制的文件，由你 / 团队维护。

> 注意：因为没有「agent 自己改 `AGENTS.md`」的通道，`AGENTS.md` 无法补「会话中涌现的事实」这一缺口——这个缺口由下面的 Memories 层来填。

## 二、Memories 生成层（agent 写的笔记）

### 1. 存储与生成

```text
~/.codex/
└── memories/
    ├── <session-summary-1>.md
    └── <session-summary-2>.md
```

- Codex 在后台**异步总结历史会话**，把涌现的事实写入 `~/.codex/memories/`。
- **下一个会话**启动时读取这些记忆作为上下文。

### 2. eligible 条件

- 一个会话要被纳入记忆，需**空闲约 6 小时**后才会变成 eligible（可被合并进 memories）。
- 不是「聊完立刻记住」，有延迟。

### 3. 控制

- `/memories` 命令可控制**单任务**是否使用 / 贡献记忆（per-task 开关）。
- 同样**机器本地**，不云同步。

> ⚠️ Memories 只存于机器本地。它与 `AGENTS.md` 一样，换机即丢；涉及唯一真相的约定请放 `AGENTS.md` 并版本控制。

## 三、Claude vs Codex 关键差异

| 维度 | Claude Code | OpenAI Codex |
| --- | --- | --- |
| 静态指令文件 | `CLAUDE.md` | `AGENTS.md` |
| 静态层可否被 agent 改写 | 否（你维护） | 否（普通版本控制文件，用户维护） |
| 生成笔记层 | Auto Memory（自动总结，每会话加载索引 200 行/25KB） | Memories（异步总结，空闲约 6 小时才 eligible） |
| override 机制 | 用 `CLAUDE.local.md` + `.gitignore` | 原生 `.override.md` 优先 |
| 跨工具 | 读 `CLAUDE.md`，不读 `AGENTS.md`（需 `@AGENTS.md` 导入） | `AGENTS.md` 是 Cursor/Aider/Jules 共用规范 |

> 一句话差异：**Codex 的 `AGENTS.md` 是静态的、agent 不能自主改写；Memories 正是用来补「对话中涌现的事实」这块 `AGENTS.md` 覆盖不到的缺口**。Claude 侧则是用 Auto Memory 直接补同一缺口，但静态/生成两层都不允许 agent 改写静态层。

下一篇：[04-跨系统对比与落地建议.md](./04-跨系统对比与落地建议.md)
