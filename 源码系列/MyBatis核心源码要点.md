# MyBatis 核心源码要点

> 本文从源码与工程视角梳理 MyBatis 的核心机制：整体架构、配置解析、SqlSession 与执行器、Mapper 代理、动态 SQL、缓存（一级/二级）、以及插件拦截链。内容基于公开实现原理，具体类以版本为准。

## 1. MyBatis 的定位

- 半自动 ORM：SQL 由开发者写，框架负责映射与执行。
- 相比全自动（Hibernate/JPA）：对 SQL 控制强，适合复杂查询与优化。
- 核心价值：消除 JDBC 样板（连接、Statement、结果集映射）。

## 2. 整体架构分层

- 接口层：SqlSession、Mapper 接口。
- 核心处理层：配置解析、执行器、语句处理器、参数/结果映射。
- 基础支撑层：数据源、事务、日志、反射、类型转换。

## 3. 配置解析

- 启动期解析 mybatis-config.xml 与 Mapper.xml。
- 生成 Configuration 对象（全局配置 + MappedStatement 集合）。
- MappedStatement：一个 SQL（含 SQL、参数映射、结果映射、缓存配置）。
- 解析结果缓存在 Configuration，供运行期使用。

## 4. SqlSession 与工厂

- SqlSessionFactory：工厂，重量级，全局单例。
- SqlSession：会话，轻量，线程不安全，用完关闭。
- 默认实现 DefaultSqlSession。
- Spring 整合后用 SqlSessionTemplate（线程安全代理）。

## 5. 执行器（Executor）

- 三种：SIMPLE（默认，每次新 Statement）、REUSE（重用 Statement）、BATCH（批量）。
- 职责：调度 StatementHandler、处理缓存、事务。
- 可套装饰：CachingExecutor 包一级/二级缓存逻辑。

## 6. StatementHandler

- 真正与 JDBC 打交道：prepare、parameterize、query/update。
- 类型：Simple/PreparedStatement/Callable。
- routing 按 StatementType 路由。

## 7. 参数映射（ParameterHandler）

- 把方法参数按映射规则设到 PreparedStatement。
- 支持 #{}（预编译占位，防注入）与 ${}（字符串拼接，有注入风险）。
- 类型处理器（TypeHandler）负责 Java 类型 ↔ JDBC 类型转换。

## 8. 结果映射（ResultSetHandler）

- 把 ResultSet 映射成 Java 对象/集合。
- 依据 resultMap 或自动映射（列名→属性名）。
- 支持嵌套结果、关联（association）、集合（collection）。
- 延迟加载：关联对象按需查询（代理触发）。

## 9. Mapper 接口代理

- Mapper 接口无实现类，由 MapperProxy 动态代理。
- 调用方法 → 按接口全名+方法名 找到 MappedStatement → 执行。
- 因此方法名需与 XML 中 statement id 对应（或注解 SQL）。
- Spring 整合：MapperScanner 扫描接口注册为 Bean。

## 10. 动态 SQL

- 标签：if、choose/when、foreach、trim/where/set。
- 解析为 SqlNode 树，运行时按参数求值拼接。
- foreach 用于 IN 查询、批量插入。
- 注意：动态 SQL 易产生多余逗号/AND，用 where/trim 处理。

## 11. 一级缓存

- 作用域：SqlSession 级别（会话内）。
- 同会话同查询命中缓存，不查库。
- 增删改或手动 clearCache 失效。
- 注意：不同 SqlSession 不共享，Spring 整合下会话短命，一级缓存意义有限。

## 12. 二级缓存

- 作用域：Mapper（namespace）级别，跨 SqlSession。
- 需显式开启（cache 标签）且实体可序列化。
- 事务提交后才写入，避免脏读。
- 多表关联时缓存粒度问题易致不一致，慎用。

## 13. 插件（Interceptor）

- 基于责任链，可拦截 Executor/StatementHandler/ParameterHandler/ResultSetHandler 方法。
- 实现 Interceptor + @Intercepts 指定签名。
- 典型用途：分页插件、慢 SQL 统计、多租户、加解密。
- 插件链按顺序执行，注意性能与正确改写 SQL。

## 14. 事务与数据源

- 集成 Spring 时用 Spring 事务管理（DataSourceTransactionManager）。
- 数据源可配连接池（Druid/HikariCP）。
- MyBatis 自身事务（JdbcTransaction）少用，多交容器。

## 15. 类型处理器（TypeHandler）

- 枚举、JSON、日期等自定义映射。
- 可注册全局或指定。
- 例如把 List 存 JSON 列，用自定义 TypeHandler。

## 16. 与 Spring 整合要点

- SqlSessionFactoryBean 创建工厂。
- MapperScannerConfigurer 扫描注册 Mapper。
- 事务由 Spring 统一，SqlSession 自动管理生命周期。
- 本质：MyBatis 的 SqlSession 被 Template 包装成线程安全。

## 17. 常见踩坑

1. **${} 注入风险**：拼接用户输入导致 SQL 注入；用 #{}。
2. **一级缓存跨会话误用**：以为命中实则新会话，或脏读；明确作用域。
3. **二级缓存不一致**：多表 join 缓存难失效；复杂场景关二级缓存。
4. **foreach 大列表**：IN 千条以上 SQL 超长；分批或临时表。
5. **N+1 查询**：循环查关联；用 join 或延迟加载优化。
6. **映射列名不匹配**：下划线 vs 驼峰，开 mapUnderscoreToCamelCase。
7. **插件改 SQL 出错**：拦截逻辑 bug 致全量故障；充分测试。
8. **resultMap 漏字段**：查出来为 null；检查 column/property。

## 18. 性能要点

- 用 #{} 预编译，复用执行计划。
- 合理 resultMap，避免全字段。
- 批量用 BATCH 执行器或 foreach。
- 慢 SQL 用插件监控。
- 连接池配置合理（最大连接、超时）。

## 19. 执行流程串联

```
MapperProxy.invoke
 → SqlSession.select/insert
 → CachingExecutor(查缓存)
 → BaseExecutor(一级缓存/事务)
 → StatementHandler(准备/设参/执行)
 → ParameterHandler(设参)
 → ResultSetHandler(映射)
 → 返回对象
```

## 20. 小结

MyBatis 的核心是"配置解析成 MappedStatement + 接口代理路由 + Executor/StatementHandler 执行 + 参数与结果映射"。掌握 Mapper 代理原理、#{} 与 ${} 区别、一级/二级缓存作用域、动态 SQL 与插件拦截链，即可排查绝大多数问题。铁律：**用 #{} 防注入、明确缓存作用域、复杂关联慎用二级缓存、插件改 SQL 须谨慎测试**。
