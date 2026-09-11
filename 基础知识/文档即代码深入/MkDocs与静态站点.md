# MkDocs与静态站点

> 对应 MkDocs 官方文档与 mkdocs-material 主题官方文档。

## 一、背景与挑战
团队需要一套轻量、快速、可版本化的文档站点，既不想维护笨重的 CMS，也不愿受制于商业 Wiki 的数据锁定与访问限制。同时希望文档能像代码一样走 PR 评审、由 CI 自动构建发布，而不是在某个后台里手工编辑、难以审查。

静态站点生成器正是为此而生：以纯文本为源，在构建时生成完整的 HTML 与静态资源，部署时只需托管文件、无需服务端渲染。这带来极低的运维成本与极高的可移植性，也天然契合文档即代码的流程。

## 二、核心原理
MkDocs 的工作方式：以 Markdown（`.md`）为源文件，用 `mkdocs.yml` 声明导航结构与主题配置，构建时把源文件渲染为静态 HTML 站点。站点可直接托管在对象存储、静态托管服务或代码平台的 Pages 上，配合 CI 在每次合并后自动重建与发布。

关键构件包括：`nav` 声明式导航决定侧边栏与页面层级；主题（最常用的是 mkdocs-material）决定视觉与交互；搜索索引在构建时生成，使静态站点也具备本地全文检索；插件机制支持多版本切换、重定向、代码高亮等能力。

因为输出是纯静态资源，站点可以 CDN 加速、可离线部署、可长期归档，不存在「服务挂了文档看不了」的风险。

## 三、形式化与数学基础
把构建过程形式化为一个映射。输入是源文件集合 $M$ 与导航结构 $N$，输出是站点产物（HTML + 资源）：

$$ \text{build}: (M,\ N) \longrightarrow \text{Site} $$

其中 $M = \{\, \text{md}_1, \text{md}_2, \dots \,\}$ 为 Markdown 文件集合，$N$ 由 `mkdocs.yml` 的 `nav` 定义。构建是确定性的：相同输入必得相同输出，因而产物可被哈希校验、可复现。

导航与文件的一致性可定义为一个引用的邻接集合 $L(N)$，要求对每个导航项 $p \in L(N)$ 都有对应文件存在：

$$ \forall p \in L(N):\ p \in M $$

不满足即为「空页/断链」错误，正是 `--strict` 模式会拦截的情况。部署则是把 Site 上传到静态托管：

$$ \text{deploy}: \text{Site} \longrightarrow \text{CDN / Pages} $$

## 四、代码实现
```yaml
# mkdocs.yml：声明式导航与主题
site_name: 我的知识库
theme:
  name: material
  features:
    - navigation.tabs
    - search.suggest
nav:
  - 首页: index.md
  - 设计模式:
      - 总览: pattern/index.md
      - 单例: pattern/singleton.md
plugins:
  - search
markdown_extensions:
  - admonition
  - pymdownx.superfences
```

```bash
# 本地预览：热重载
mkdocs serve

# 构建：--strict 使告警（如断链）升级为错误
mkdocs build --strict

# 发布到代码平台 Pages
mkdocs gh-deploy
```

`--strict` 的具体行为、可用插件与主题选项以 MkDocs 与主题官方文档为准。

## 五、与其他技术对比
| 维度 | MkDocs | Sphinx | 手写 HTML | 商业 Wiki/CMS |
| --- | --- | --- | --- | --- |
| 源格式 | Markdown | reStructuredText | HTML | 富文本/私有格式 |
| 学习曲线 | 低 | 中高 | 高 | 低 |
| API 自动文档 | 需插件 | 原生强 | 无 | 弱 |
| 多格式输出 | 以 HTML 为主 | HTML/PDF/EPUB | 需自行处理 | 一般仅 HTML |
| 运维成本 | 极低（静态） | 低（静态） | 低 | 中高 |
| 适合场景 | 通用文档站点 | API 密集、Python 生态 | 特殊定制 | 非技术协作文档 |

相比 Sphinx（偏 rST 与 Python 生态），MkDocs 对 Markdown 更友好、上手更快；两者同属静态站点生成，选择取决于文档类型与团队习惯。

## 六、常见误区
误区一：「导航与实际文件路径不一致，构建出空页」。错，`nav` 中的路径必须与真实文件对应，`--strict` 可拦截。误区二：「忽视搜索索引，内容难以检索」。错，应启用 search 插件并优化标题与摘要。误区三：「认为静态站点不能有多版本」。错，配合插件可实现版本切换。误区四：「不在 CI 中用 --strict」。错，否则断链会被静默放过。误区五：「主题越花哨越好」。错，可读性与导航清晰度优先于视觉装饰。

## 七、与开源书·权威来源对应
- MkDocs 官方文档：源文件组织、`mkdocs.yml` 配置、构建与部署。
- mkdocs-material 官方文档：主题特性、多版本切换与搜索增强。
- Anne Gentle《Docs Like Code》：静态站点在 docs-as-code 流程中的定位。
- 具体配置项与插件清单以官方最新文档为准。

## 八、面试题
1. MkDocs 与 Sphinx 应如何选择？各自适合什么类型的文档？
2. 静态站点为什么特别适合文档托管？相比动态 CMS 有何优势？
3. `mkdocs build --strict` 解决了什么问题？
4. 如何为静态站点实现多版本文档切换与离线搜索？
5. 导航结构与文件路径不一致会导致什么后果？如何预防？

## 九、演进与趋势
mkdocs-material 等主题把版本切换、离线搜索、深色模式、多语言等能力做成开箱即用，静态站点的体验已接近商业文档产品。趋势上，站点与 CI/CD 深度集成实现「合并即发布」，并与 API Schema、代码符号联动自动生成内容。另一方向是把文档站点做成可交互环境（内嵌 Playground、可运行示例），让静态站点突破「只读」的边界。

## 十、小结
MkDocs 以 Markdown 为源、以声明式导航组织内容、以静态 HTML 为产物，提供了门槛极低的文档即代码方案。它的核心价值是简单与确定：源是纯文本、构建是纯映射、部署是文件托管，因而易于评审、易于自动化、易于长期维护。对于以内容为主的团队文档，它是性价比极高的默认选择。
