# Claude Code 记忆架构

> Claude Code 的记忆由两套互补系统组成：你写的 **CLAUDE.md**（静态指令）与 agent 写的 **Auto Memory**（生成笔记）。两者叠加，既保证确定性规则，又补上涌现事实。

## 一、CLAUDE.md 体系（你写的静态指令）

### 1. 四层作用域

| 层级 | 路径 | 作用 | 是否提交 VCS |
| --- | --- | --- | --- |
| ① Managed 组织级 | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md` 等 | IT 通过 MDM 推送，团队强制基线 | 不可被 `claudeMdExcludes` 排除 |
| ② User 用户级 | `~/.claude/CLAUDE.md` | 个人偏好，作用于所有项目 | 个人，通常不提交 |
| ③ Project 项目级 | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 团队共享的项目约定 | **提交 VCS** |
| ④ Local 个人项目级 | `./CLAUDE.local.md` | 个人项目偏好，覆盖但不污染团队文件 | **加 `.gitignore`** |

```text
your-project/
├── CLAUDE.md            # ③ 项目级，团队共享，提交
├── .claude/
│   └── CLAUDE.md        # ③ 另一种写法（同样项目级）
├── CLAUDE.local.md      # ④ 个人偏好，记得 .gitignore
└── .gitignore           # 建议包含 CLAUDE.local.md
```

> ⚠️ `CLAUDE.local.md` 含个人/机器相关偏好，**务必加入 `.gitignore`**，否则容易把本地路径、密钥习惯等误提交到团队仓库。

### 2. 加载与合并规则

- **从工作目录向上遍历串联**：Claude Code 会沿目录树向上找所有 `CLAUDE.md`，依次拼接（**不覆盖**，是合并上下文）。
- **子目录按需加载**：子目录里的 `CLAUDE.md` 不是启动就全读，而是在 Claude 实际读取/处理该子目录时才加载。
- **目标 < 200 行/文件**：官方建议每个文件保持精简，避免上下文膨胀。
- **`@import` 最多 5 跳**：可用 `@path/to/other.md` 语法引入其它文件，相对路径，递归跳转上限为 **5 跳**。

```text
工作目录 ./services/api/
   ↓ 向上遍历
读取 ./services/api/CLAUDE.md
读取 ./services/CLAUDE.md
读取 ./CLAUDE.md
读取 ~/.claude/CLAUDE.md
读取 Managed 组织级 CLAUDE.md
   ↓ 全部拼接进上下文（不互相覆盖）
```

### 3. `.claude/rules/` 路径限定规则

有些规则只对特定文件类型生效，可以放 `.claude/rules/` 下，用 **YAML frontmatter 的 `paths:`** 声明只在处理匹配文件时加载。

目录示意：

```text
your-project/.claude/rules/
├── backend.md        # 通用后端规则
└── frontend.md       # 仅前端文件生效
```

`frontend.md` 示例：

```yaml
---
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
---
- 组件必须用函数式写法
- 样式优先用 CSS Modules
```

> 只有 Claude 正在处理匹配 `paths` 的文件时，`frontend.md` 的内容才被注入上下文；处理后端文件时不会被干扰。

### 4. AGENTS.md 兼容

Claude Code **读 `CLAUDE.md`，不读 `AGENTS.md`**。若你的仓库已经有一份 `AGENTS.md`（比如同时给 Codex / Cursor 用），在 `CLAUDE.md` 里加一行即可让它被同时读取：

```text
@AGENTS.md
```

这样 Claude 会把 `AGENTS.md` 当作导入内容一起加载，避免维护两份重复约定。

## 二、Auto Memory（agent 自己写的生成笔记）

### 1. 存储位置

```text
~/.claude/projects/<project>/memory/
├── MEMORY.md          # 索引：指向各主题文件
├── debugging.md       # 主题文件示例：调试经验
├── api-conventions.md # 主题文件示例：API 约定
└── ...                # 其它涌现主题
```

- 同一 git 仓库的**所有 worktree 共享**这份记忆。
- **机器本地，不云同步**。

> ⚠️ Auto Memory 只在机器本地，重装/换机即丢失。它不适合存「唯一真相」，关键约定仍应写进 `CLAUDE.md` 并纳入 VCS。

### 2. 加载方式

- **`MEMORY.md` 索引**：每会话加载其**前 200 行或前 25KB**（超出部分本会话不自动注入）。
- **主题文件按需读取**：`MEMORY.md` 里引用的主题文件，超过索引部分时由 agent 在需要时再读。
- **可用 `/memory` 命令**：浏览、编辑、开关自动记忆。

### 3. 子代理记忆

子代理（subagent）也可以拥有自己的自动记忆，逻辑与主代理一致，独立存储于对应项目目录下。

## 三、小结

- **确定性规则** → 写 `CLAUDE.md`（项目级提交、个人级 `.gitignore`）。
- **涌现事实** → 交给 Auto Memory（agent 自动总结，机器本地）。
- **跨工具** → 用 `@AGENTS.md` 复用仓库里已有的 `AGENTS.md`。

下一篇：[03-Codex记忆架构.md](./03-Codex记忆架构.md)
