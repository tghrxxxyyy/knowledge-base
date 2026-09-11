# reStructuredText与Sphinx

> 对应 Sphinx 官方文档与 docutils / reStructuredText 规范，以及 MyST 官方文档。

## 一、背景与挑战
大型项目——尤其是 Python 库与框架——的文档需求远超「写几篇 Markdown」：需要从代码注释自动抽取 API 文档、在文档间建立交叉引用、生成术语表与索引、并同时输出 HTML、PDF 等多种格式。纯 Markdown 在表达力上力有不逮：缺少原生的角色/指令体系，难以表达「这个引用指向某个函数」这类语义。

这正是 reStructuredText（rST）与 Sphinx 组合的用武之地。rST 提供丰富的语义标记，Sphinx 在其上构建了自动化文档生成与多格式发布的完整体系，成为 API 密集型文档的工业级方案。

## 二、核心原理
reStructuredText 是一种纯文本标记语言，相比 Markdown 拥有更强的语义结构：指令（directive）、角色（role）、引用（reference）、显式标记（explicit markup）等。Sphinx 以 rST 为源，提供三大核心能力：

- autodoc：从代码中的注释/签名自动生成 API 文档，避免手写与实现脱节。
- 交叉引用：文档内部与文档之间可互相引用（` :ref: `、`:doc:`、`:func:` 等），构建时校验引用有效性。
- 多输出：同一份源可渲染为 HTML、PDF（LaTeX）、EPUB 等格式。

工作流是「解析 → 注入 → 渲染」：先用 docutils 把 rST 解析为文档对象模型，autodoc 阶段把代码符号的文档串注入模型中，再由渲染器输出目标格式。为弥补 rST 的学习曲线，MyST 让 Markdown 也能获得 rST 级别的能力。

## 三、形式化与数学基础
把构建过程抽象为三阶段复合：

$$ \text{Source}\ D \xrightarrow{\ \text{parse}\ } \text{DOM} \xrightarrow{\ \text{autodoc}(S)\ } \text{DOM}' \xrightarrow{\ R\ } \{\text{html},\ \text{pdf},\ \text{epub}\} $$

其中 $S$ 为代码符号集合，$R$ 为目标格式渲染器。autodoc 可视为注入函数：把符号 $s \in S$ 的文档串挂载到 DOM 的对应节点上。

交叉引用的正确性可形式化为引用图的可解析性。设文档集合中的引用集合为 $X$，定义解析函数 $\text{resolve}(x)$：

$$ \forall x \in X:\ \text{resolve}(x) \neq \bot $$

任何无法解析的引用即为构建错误。Sphinx 在构建时报告「未定义引用」，等价于在 CI 中强制维护引用图的一致性——这正是不腐化 API 文档的关键机制。

## 四、代码实现
```rst
# 从代码自动抽取函数文档（autodoc 指令）
.. autofunction:: mylib.process
    :noindex:

.. automodule:: mylib.core
    :members: encode, decode

# 交叉引用术语与章节
见 :ref:`glossary` 获取术语定义，更多细节见 :doc:`design/overview`。
```

```python
# conf.py 中启用 autodoc 扩展
extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.napoleon",     # 支持 Google/NumPy 风格注释
    "sphinx.ext.intersphinx",  # 跨项目引用
]
```

```bash
# 构建并开启严格模式（引用错误即失败）
sphinx-build -W -b html docs docs/_build/html
```

扩展清单、`-W` 行为与 autodoc 选项以 Sphinx 官方文档为准。

## 五、与其他技术对比
| 维度 | Sphinx + rST | MkDocs + Markdown | MyST（Markdown in Sphinx） |
| --- | --- | --- | --- |
| 语义表达力 | 强 | 中 | 强（Markdown 语法） |
| API 自动文档 | 原生 autodoc | 需插件 | 原生 autodoc |
| 交叉引用校验 | 原生 | 有限 | 原生 |
| 多格式输出 | HTML/PDF/EPUB | 以 HTML 为主 | HTML/PDF/EPUB |
| 学习曲线 | 较陡 | 平缓 | 中 |
| 典型用户 | Python 生态 | 通用文档 | 想用 Markdown 的 Sphinx 用户 |

相比 MkDocs，Sphinx/rST 语义更强、更适合 API 文档自动化，但学习曲线更陡、从 Markdown 迁移有成本；MyST 则试图弥合两者生态。

## 六、常见误区
误区一：「autodoc 指向已删除符号，构建报缺失引用」。错，删除符号后需同步更新 autodoc 指令，`-W` 会拦截。误区二：「过度依赖指令，文档可读性下降」。错，语义标记应服务于读者而非炫技。误区三：「rST 只是 Markdown 的复杂版」。错，它提供角色/指令等 Markdown 无原生等价物的能力。误区四：「不开启严格模式」。错，引用错误会被静默放过。误区五：「autodoc 生成即完成」。错，自动生成的 API 文档仍需人工撰写概述与示例，否则可读性差。

## 七、与开源书·权威来源对应
- Sphinx 官方文档：rST 指令体系、autodoc/dosctest/intersphinx 等扩展机制。
- docutils / reStructuredText 规范：rST 语法与语义的权威定义。
- MyST 官方文档：在 Sphinx 中使用 Markdown 的方案。
- Anne Gentle《Docs Like Code》：将自动生成的 API 文档纳入整体文档流程。
- 具体指令、扩展与配置项以官方最新文档为准。

## 八、面试题
1. rST 相比 Markdown 强在哪里？哪些场景是 Markdown 难以胜任的？
2. autodoc 如何保证 API 文档不腐化？它的局限是什么？
3. 交叉引用在构建时如何校验？对文档质量意味着什么？
4. Sphinx 与 MkDocs 如何选型？各自的取舍是什么？
5. MyST 解决了什么问题？它与原生 rST 有何差异？

## 九、演进与趋势
MyST 让 Markdown 获得 rST 级能力，正在弥合两大生态的割裂，使团队可以用更熟悉的语法获得 Sphinx 的自动化能力。同时，API 文档与类型系统、OpenAPI Schema 的联动日益紧密，向「一处定义、多处一致」演进。严格构建（`-W`）与引用校验正被纳入 CI 门禁，把「文档不腐化」从人工纪律变为流水线保障。

选型速查：

- 以手写说明、教程为主 → MkDocs 更省事。
- 以 API 自动文档、交叉引用、多格式为主 → Sphinx。
- 团队熟悉 Markdown 又想要 autodoc → MyST。

## 十、小结
Sphinx + rST 是大体量、API 密集型文档的工业级方案：它以语义化标记支撑交叉引用，以 autodoc 实现 API 文档的自动同步，以多渲染器输出多种格式。其最大价值是自动化——只要符号还在、引用可解析，文档就能随代码保持正确。代价是学习曲线与迁移成本，因此 MyST 等折中方案也在快速普及。
