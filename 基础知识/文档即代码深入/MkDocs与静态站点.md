# MkDocs与静态站点

> 对应 reStructuredText / MkDocs / Sphinx docs-as-code。

## 一、背景与挑战
团队需要轻量、快速、可版本化的文档站点，而不想维护笨重的 CMS 或依赖商业 Wiki。

## 二、核心原理
MkDocs 以 Markdown 为源，用 mkdocs.yml 组织导航，构建为静态 HTML；可托管于对象存储或 Pages，配合 CI 自动发布。

## 三、形式化与数学基础
输入集合 M = {md 文件}，导航树 N 由 mkdocs.yml 定义。构建 f: (M, N) -> Site（静态资源）。部署即上传 Site，无服务端渲染负担。

## 四、代码实现
```yaml
# mkdocs.yml
nav:
  - 首页: index.md
  - 设计模式: pattern/index.md
theme:
  name: mkdocs-material
# 构建
mkdocs build
```

## 五、与其他技术对比
相比 Sphinx（偏 rST/Python 生态），MkDocs 对 Markdown 更友好、上手快；二者皆属静态站点生成。

## 六、常见误区
- 导航与文件实际路径不一致，构建出空页。
- 忽视搜索索引，站点内容难以检索。

## 七、与开源书/权威来源对应
MkDocs 官方文档描述 material 主题与多版本文档能力。

## 八、面试题
MkDocs 与 Sphinx 如何选？静态站点为何适合文档托管？

## 九、演进与趋势
mkdocs-material 提供版本切换、离线搜索，接近商业文档体验。

## 十、小结
MkDocs 以 Markdown 源加声明式导航，提供低门槛的文档即代码方案。
