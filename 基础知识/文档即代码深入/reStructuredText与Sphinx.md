# reStructuredText与Sphinx

> 对应 reStructuredText / Sphinx docs-as-code。

## 一、背景与挑战
大型项目（尤其 Python 库）需要跨模块自动抽取 API 文档、交叉引用与多格式输出，纯 Markdown 表达力不足。

## 二、核心原理
reStructuredText（rST）是带丰富语义标记的标记语言；Sphinx 以 rST 为源，支持 autodoc 从代码注释生成 API 文档、交叉引用与 PDF/HTML 多输出。

## 三、形式化与数学基础
源文档 D 经解析生成文档对象模型 DOM，autodoc 阶段注入代码符号 S 的文档串，渲染器 R: DOM -> {html, pdf, epub}。

## 四、代码实现
```rst
.. autofunction:: mylib.process
    :noindex:
见 :ref:`glossary` 获取术语定义。
```

```python
# Sphinx 配置启用 autodoc
extensions = ["sphinx.ext.autodoc"]
```

## 五、与其他技术对比
相比 MkDocs，Sphinx/rST 语义更强、适合 API 文档自动化；但学习曲线更陡，Markdown 迁移有成本。

## 六、常见误区
- autodoc 指向已删除符号，构建报缺失引用。
- 过度依赖指令，文档可读性下降。

## 七、与开源书/权威来源对应
Sphinx 官方文档详述 rST 指令与 autodoc 扩展机制。

## 八、面试题
rST 相比 Markdown 强在哪？autodoc 如何保持 API 文档不腐？

## 九、演进与趋势
MyST 让 Markdown 获得 rST 级能力，弥合两者生态。

## 十、小结
Sphinx + rST 是大体量、API 密集型文档的工业级方案，自动化是其最大价值。
