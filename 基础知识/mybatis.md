# MyBatis

本文围绕以下三个问题展开：

1. 延迟加载的原理是什么
2. 说一下 MyBatis 的一级缓存和二级缓存
3. MyBatis 解析执行 xml 的语句的流程

![](images/WEBRESOURCEba15ebd23646b278ee3f70879e89b805截图.png)

> 图：MyBatis 整体结构示意（一）

![](images/WEBRESOURCEcbf21ebb9a380f4c070ee4c500a07f12截图.png)

> 图：MyBatis 整体结构示意（二）

## 1. 延迟加载的原理是什么

它的原理是，使用 CGLIB 或 Javassist（默认）创建目标对象的代理对象。当调用代理对象的延迟加载属性的 getting 方法时，进入拦截器方法。比如调用 `a.getB().getName()` 方法，进入拦截器的 `invoke(...)` 方法，发现 `a.getB()` 需要延迟加载时，那么就会单独发送事先保存好的查询关联 B 对象的 SQL，把 B 查询上来，然后调用 `a.setB(b)` 方法，于是 a 对象 b 属性就有值了，接着完成 `a.getB().getName()` 方法的调用。这就是延迟加载的基本原理。

## 2. 说一下 MyBatis 的一级缓存和二级缓存

![](images/WEBRESOURCEfff9202df808e31252d7eb1473e18f81截图.png)

> 图：MyBatis 一级缓存与二级缓存示意

### 一级缓存

BaseExecutor

BaseExecutor 是一个抽象类，实现了 Executor 接口，并提供了大部分方法的实现，只有 4 个基本方法：`doUpdate`、`doQuery`、`doQueryCursor`、`doFlushStatement` 没有实现，还是抽象方法，由子类实现，这 4 个方法相当于模板方法中变化的那部分。

### 二级缓存

当配置打开，MyBatis 的二级缓存是用 CachingExecutor 来实现的，它是 Executor 的一个装饰器类。为 Executor 对象添加了 MapperFactoryBean 缓存的功能。

在介绍 CachingExecutor 之前，先来看看 CachingExecutor 依赖的两个类，TransactionalCacheManager 和 TransactionalCache。

## 3. MyBatis 解析执行 xml 的语句的流程

1. MapperScannerConfigurer 是一个 BeanDefinitionRegistryPostProcessor，会在 Spring 构建 IoC 容器的早期被调用重写的 `postProcessBeanDefinitionRegistry`，扫描注册 basePackage 包下的所有 bean，将 basePackage 包下的所有 bean 进行一些特殊处理：beanClass 设置为 MapperFactoryBean、bean 的真正接口类作为构造函数参数传入 MapperFactoryBean、为 MapperFactoryBean 添加 sqlSessionFactory 和 sqlSessionTemplate 属性。
2. SqlSessionFactoryBean 来说，实现了 2 个接口，InitializingBean 和 FactoryBean，build 了 buildSqlSessionFactory，构建了全局配置 Configuration，解析 mapperLocations 属性的 mapper 文件，将 mapper 文件中的每个 SQL 封装成 MappedStatement，放到 mappedStatements 缓存中，key 为 id，例如：`com.joonwhee.open.mapper.UserPOMapper.queryByPrimaryKey`，value 为 MappedStatement。并且将解析过的 mapper 文件的 namespace 放到 knownMappers 缓存中，key 为 namespace 对应的 class，value 为 MapperProxyFactory。
3. 创建 DAO 的 bean 时，通过 mapperInterface 从 knownMappers 缓存中获取到 MapperProxyFactory 对象，通过 JDK 动态代理创建 MapperProxyFactory 实例对象，InvocationHandler 为 MapperProxy。
4. DAO 中的接口被调用时，通过动态代理，调用 MapperProxy 的 invoke 方法，最终通过 mapperInterface 从 mappedStatements 缓存中拿到对应的 MappedStatement，执行相应的操作。

## MyBatis 插件机制（Interceptor）

MyBatis 通过**拦截器**在四大对象的方法上织入逻辑：

- 可拦截对象：`Executor`（增删改查）、`ParameterHandler`（参数）、`ResultSetHandler`（结果集）、`StatementHandler`（SQL 执行）。
- 实现 `Interceptor` 接口，用 `@Intercepts({@Signature(type=, method=, args=)})` 指定拦截点；`plugin()` 方法用 `Plugin.wrap(target, this)` 返回代理。

```java
@Intercepts({@Signature(type = Executor.class, method = "update",
        args = {MappedStatement.class, Object.class})})
public class ExampleInterceptor implements Interceptor {
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        // 前后织入逻辑：分页、审计、慢SQL统计
        return invocation.proceed();
    }
}
```

典型应用：PageHelper 分页（重写 SQL 拼 LIMIT）、数据权限（加部门过滤）、读写分离路由。

## 动态 SQL 进阶

`<if>/<choose>/<foreach>/<trim>/<where>/<set>` 在 `XMLScriptBuilder` 中被解析为 `SqlNode` 树，OGNL 表达式取值：

```xml
<select id="list" parameterType="map">
  SELECT * FROM t
  <where>
    <if test="name != null">AND name = #{name}</if>
    <if test="statusList != null">
      AND status IN
      <foreach collection="statusList" item="s" open="(" close=")" separator=",">#{s}</foreach>
    </if>
  </where>
</select>
```

注意：`<where>` 自动去除首部 `AND/OR`；`<set>` 去除尾部逗号；`${}` 用于动态表名/排序字段（**有注入风险，必须白名单校验**）。

## 缓存深入与 `#{}` vs `${}`

- **一级缓存**：`SqlSession` 级别，相同 `Mapper + 参数 + 方法` 命中；`update/commit/close` 失效；Spring 集成下 SqlSession 短命，一级缓存基本失效。
- **二级缓存**：`Mapper`(namespace) 级别，需 `cacheEnabled=true` + `<cache/>`；跨 SqlSession 共享；**事务提交后才写入**，避免脏读；但多表关联缓存易不一致，谨慎开启。
- **`#{}` 预编译**：`?` 占位 + PreparedStatement，防 SQL 注入（**必须用**）。
- **`${}` 字符串拼接**：原样替换，仅用于排序字段、表名等，务必服务端白名单。

## 批量操作与生产实践

- **`foreach` 批量插入**：`INSERT INTO t (...) VALUES (...),(...)`；注意单条 SQL 长度受 `max_allowed_packet` 限制，需分批（每批 500~1000）。
- **`ExecutorType.BATCH`**：`SqlSessionFactory.openSession(ExecutorType.BATCH)` 攒批 `addBatch`，`flushStatements()` 一次性提交，大幅降低网络往返。
- **关联查询**：`N+1` 问题用 `<collection>/<association>` 嵌套（join 一次查）或延迟加载（按需）。
- **类型处理器**：自定义 `TypeHandler` 处理枚举/JSON/加密字段。

## 面试高频

1. **MyBatis 与 Hibernate 区别**：半自动（手写 SQL，灵活可控）vs 全自动（HQL，对象化、屏蔽 SQL）；MyBatis 在复杂查询/性能敏感场景占优。
2. **插件能拦截哪些**：四大对象（Executor/ParameterHandler/ResultSetHandler/StatementHandler）。
3. **逻辑分页 vs 物理分页**：`RowBounds` 是逻辑分页（先查全量再内存截取，禁用）；PageHelper 是物理分页（改写 SQL）。

---

# 第二轮深度优化：插件 / 缓存源码 / 动态 SQL 陷阱 / 注入风险 / 批量流式 / Spring 整合

## 一、插件（Interceptor）机制与自定义实战

MyBatis 通过**责任链 + 动态代理**拦截四大核心对象：`Executor`、`ParameterHandler`、`ResultSetHandler`、`StatementHandler`。插件本质是 `@Intercepts({@Signature(type=, method=, args=)})` 标注的 `Interceptor`，在创建这四类对象时 MyBatis 用 `Plugin.wrap` 生成代理，方法调用前走 `intercept(Invocation)`。

- **自定义插件步骤**：
  ```java
  @Intercepts({@Signature(type = Executor.class, method = "update",
          args = {MappedStatement.class, Object.class})})
  public class SqlCostInterceptor implements Interceptor {
      public Object intercept(Invocation inv) throws Throwable {
          long t = System.nanoTime();
          Object r = inv.prokeed();           // 放行原方法
          log.info("sql cost={}ms", (System.nanoTime()-t)/1_000_000);
          return r;
      }
      public Object plugin(Object target){ return Plugin.wrap(target, this); }
  }
  ```
- **实战场景**：分页（PageHelper 思路，改写 SQL 拼 limit）、读写分离（按 SQL 类型路由数据源）、SQL 性能监控、数据脱敏（`ResultSetHandler` 对结果字段解密）、防全表更新（`Executor.update` 前解析 SQL 校验是否有 where）。
- **注意**：插件按配置顺序形成嵌套代理；`invocation.proceed()` 必须调用；不要在插件里做重 IO（会拖慢所有 SQL）。

## 二、缓存源码级剖析

- **一级缓存（SqlSession 级）**：存于 `BaseExecutor.localCache`（`PerpetualCache`，本质 HashMap）。cacheKey = `statementId + rowBounds + params + boundSql` 的哈希。执行 `query` 先查 localCache；`update`/`commit`/`rollback`/`close` 会 `clearLocalCache`。**纯 MyBatis** 下同一 SqlSession 两次相同查询命中；但 **Spring 集成** 时 `SqlSessionTemplate` 每次 mapper 方法调用往往新建/归还 SqlSession，一级缓存基本不跨方法生效。
- **二级缓存（namespace/Mapper 级）**：`CachingExecutor` 装饰 `BaseExecutor`，namespace 级。命中顺序：二级 → 一级 → DB。`<cache/>` 默认 `LRU` + 要求 POJO 实现 `Serializable`、`readWrite=true` 返回副本防并发修改。关键：`TransactionalCacheManager` 在**事务提交后**才把待提交缓存刷入 `delegate`，避免脏读（未提交就读到别人未提交数据）。**多表 join 的二级缓存极易不一致**（A 表更新但 B 表缓存没清），生产慎用，常用 Redis 替代。

## 三、动态 SQL 陷阱（foreach / choose / trim）

- **`foreach` 空集合**：默认会生成 `IN ()` 语法错误；务必 `collection != null and collection.size() > 0` 守卫，或用 `(1=0)` 兜底。
- **`foreach` 大列表**：拼接超长 SQL 触发 `max_allowed_packet`；分批（每批 500~1000）。
- **`choose/when/otherwise`**：类似 switch，注意 `when` 顺序，第一个命中即停，后续不再判断。
- **`trim`**：`prefixOverrides`/`suffixOverrides` 去掉多余 AND/OR/逗号，比手写 `<where>` 灵活，但要小心多 Condition 全空导致 `WHERE` 残留。
- **`#{}` 在 `foreach` 中**：每个 item 都是预编译占位，安全。

## 四、`#{}` 与 `${}` 注入风险深度

- **`#{}`**：→ `?` + PreparedStatement 设参，`'` 被转义，**杜绝 SQL 注入**。任何用户输入的列值、参数必须用 `#{}`。
- **`${}`**：→ 字符串直接拼接（text 替换），**有注入风险**。仅用于：动态表名（`FROM ${tableName}`，必须白名单校验表名集合）、动态排序字段（`ORDER BY ${column}`，白名单 + 方向校验）、动态 `LIMIT`（数值强校验）。
- **真实事故**：用 `${}` 拼 `ORDER BY ${userInput}`，用户传 `id; DROP TABLE users;--` 导致删表。防护：排序字段映射到枚举白名单 `{ "createTime":"create_time DESC" }`，前端只传 key。

## 五、批量与流式

- **`ExecutorType.BATCH`**：攒 `addBatch`，`flushStatements()` 一次性提交，减少网络 RTT；但批内异常定位难，且单批过大占内存。
- **流式查询**：`resultSetType=FORWARD_ONLY` + `fetchSize=Integer.MIN_VALUE`（MySQL 驱动流式），`ResultHandler` 逐条处理大结果集，避免全量加载 OOM。`Cursor<T>`（`@Options(resultSetType=...)`）类似。
- **对比**：小批量用 `foreach VALUES`，超大用 BATCH + 分批；超大读用流式 / Cursor。

## 六、MyBatis 与 Spring 整合原理

- `SqlSessionFactoryBean` 构建 `SqlSessionFactory`（读配置、`mapperLocations` 扫描 XML）。
- `@MapperScan` + `ClassPathMapperScanner`：把 Mapper 接口扫描注册为 `MapperFactoryBean`，其 `getObject()` 返回 `SqlSession.getMapper(interface)` 生成的**动态代理**（`MapperProxy`）。
- 调用代理方法 → `MapperMethod.execute` → 经 `SqlSessionTemplate`（线程安全，用 `SqlSessionInterceptor` 每次从 `SqlSessionHolder` 取/建 SqlSession，自动关闭）→ `Executor`。
- **事务**：Spring 托管 `SpringManagedTransaction`，把 SqlSession 与 Spring 事务绑定（同一事务复用同一 Connection），`@Transactional` 才生效。
- **一级缓存为何在 Spring 下失效**：每次 mapper 方法调用经 `SqlSessionTemplate` 默认把 SqlSession `close`（实际归还），下一个方法新建，故 localCache 不共享；但同一事务内通过 `SqlSessionHolder` 复用，一级缓存可在事务内命中。

## 七、TypeHandler 实战（枚举 / JSON / 加密）

- **枚举**：`@Enumerated` 或自定义 `TypeHandler` 把枚举与 code 互转（存 code 不存 name，防改名错乱）；`getNullableResult`/`setNonNullParameter` 做转换。
- **JSON 字段**：自定义 `JacksonTypeHandler` 把对象 ↔ JSON 字符串；MySQL 5.7+ 也可用 `JSON` 类型 + `GeneratedProperty` 读，兼顾查询与存储。
- **加密字段**：在 `TypeHandler` 的 `setParameter`/`getResult` 做加解密，业务无感；注意密钥管理、且加密后字段无法走索引/范围查询。

## 八、useGeneratedKeys 与主键回填

- `useGeneratedKeys=true` + `keyProperty` 让插入后把自增主键回填到对象；批量插入需 `keyProperty` 对应且驱动支持（JDBC 3+）。
- 注意：回填基于 JDBC `getGeneratedKeys`，与 `ExecutorType.BATCH` 配合时需在 `flushStatements()` 之后才能拿到回填值。
- Oracle 等无自增需用 `selectKey`（执行 `select seq.nextval`）先取主键再插入。

## 九、多数据源与整合进阶

- 多 `SqlSessionFactory` + 多 `DataSource` + `@MapperScan(basePackages=, sqlSessionFactoryRef=)` 分库；或用 `AbstractRoutingDataSource` 按上下文（ThreadLocal）动态路由（读写分离 / 多租户）。
- 事务：多数据源无法用单 `@Transactional` 跨库原子，需 `JtaTransactionManager`（Atomikos/Narayana）或退而求其次用最终一致（本地消息表 / TCC）。

## 十、XML 与注解混用、OGNL 陷阱

- 注解（`@Select`/`@Update`）与 XML 二选一；复杂动态 SQL 仍用 XML（`@SelectProvider` 也可，但可读性差）。
- OGNL 取值：`#{}` 按属性名取（支持 `user.name` 嵌套），`${}` 拼字符串；`<if test="status == 1">` 里 `==` 比较对象时当心 `Integer` 缓存只覆盖 -128~127，超范围要用 `eq` 或 `.equals()`。
- 字符串判空：`<if test="name != null and name != ''">`；集合判空：`<if test="list != null and list.size() > 0">`。

## 十一、通用 Mapper / MyBatis-Plus

- **MyBatis-Plus** 提供 `BaseMapper` 通用 CRUD、`Wrapper` 条件构造、`分页插件`、`逻辑删除`（`@TableLogic`）、`自动填充`（`MetaObjectHandler`）；大幅减样板代码。
- 代价：复杂 SQL 仍要手写；`Wrapper` 过度拼接易出 `TooManyResults`/误全表风险，必要时 `last("limit 1")` 兜底；代码生成器（generator）可一键出 entity/mapper/xml。

## 十二、常见性能坑与排查

- 慢 SQL：`logImpl=STDOUT` 或 `p6spy` 打印实际 SQL 与耗时；`fetchSize` 调大减少往返。
- N+1：`@One`/`@Many` 嵌套 + `fetchType` 控制；优先 join 一次查或分页避免。
- 缓存误用：同 SqlSession 多次查触发一级缓存，但并发下可能读到中间状态；明确缓存作用域，别依赖它做跨请求一致性。
- 大结果集：务必流式/分页，勿 `select *` 全量进内存；`resultMap` 复杂映射注意懒加载触发次数。

## 十三、二级缓存与 Redis 整合

- 二级缓存跨 SqlSession 但多表关联易不一致；生产更常用 **Redis 作为二级缓存**（MyBatis Redis Cache 实现 / 自写 `Cache` 接口），集中存储、可 TTL、多实例共享。
- 注解：`@CacheNamespace(implementation = RedisCache.class)` 或 XML `<cache type="com.x.RedisCache"/>`；`@Options(useCache=false)` 关闭单条缓存、`flushCache=true` 强制刷新。

## 十四、批处理 BATCH 陷阱

- `ExecutorType.BATCH` 靠 `PreparedStatement.addBatch` + `executeBatch` 合并；**只有同一条 SQL 才合并**，不同 SQL 各自 batch；`flushStatements()` 后才真正发送。
- 坑：批内某条失败抛 `BatchUpdateException`，需 `getUpdateCounts` 逐条看；批太大占 JDBC 内存，应分批（每批 500~1000）。

## 十五、插件拦截顺序与常见问题

- 多个插件按配置顺序形成嵌套代理：最外层先执行 `intercept` 前置逻辑，`Executor` 实际执行。调试时注意调用栈顺序。
- 常见坑：在 `ResultSetHandler` 改结果却忘了处理 `proceed()` 之后；插件里做 IO 拖慢所有查询；拦截 `update` 做审计要跳过自身写入。

## 十六、延迟加载（Lazy Loading）

- `fetchType=LAZY` + `aggressiveLazyLoading=false`：关联对象用代理，访问时才查，避免无用 join。坑：SqlSession 关闭后访问懒加载属性抛 `LazyInitializationException`；序列化时可能触发或丢失。

## 十七、MyBatis 与 JPA 再次选型

- 复杂 SQL/高性能用 MyBatis，标准 CRUD/对象模型用 JPA；也可"JPA 管写、MyBatis 管复杂读"混用（见其他框架技术篇）。

## 十八、常见面试题深入

- **`#{}` 预编译原理**：MyBatis 把 `#{}` 替换为 `?`，用 `PreparedStatement.setXxx` 设参，类型由 JavaType/JdbcType 推断；`${}` 直接文本替换，有注入风险。
- **插件能拦截哪些**：Executor / ParameterHandler / ResultSetHandler / StatementHandler；`SqlSession` 不在其列（它不是被代理包装的核心对象）。
- **一级缓存失效原因**：SqlSession 关闭/commit/update；Spring 集成下每次 mapper 调用新建 SqlSession。
- **逻辑 vs 物理分页**：`RowBounds` 逻辑分页（先查全量再截断，禁用），PageHelper 改写 SQL 物理分页。

## 十九、MyBatis 与 Spring 事务整合坑

- 事务失效常因"自调用"或 SqlSession 作用域：同一 Service 内方法互调不经过代理；跨 mapper 调用由 `SpringManagedTransaction` 把 SqlSession 绑到 Spring 事务，同一事务复用同一 Connection。`@Transactional` 不生效时优先查：是否 public、是否被自调用、异常是否被吞、数据库是否支持。
- 多数据源下每个数据源有独立 `SqlSessionFactory` 与事务管理器，单 `@Transactional` 不能跨库原子，需用 JTA 或最终一致。

## 二十、批量主键生成（useGeneratedKeys 深入）

- `useGeneratedKeys=true` + `keyProperty` 在插入后回填 JDBC 自增主键；批量插入时 MyBatis 会按 `BatchResult` 回填每个对象的 key（要求驱动/JDBC 支持 `getGeneratedKeys`）。
- Oracle 无自增，用 `<selectKey>` 先查序列 `seq.nextval` 赋给 keyProperty，再插入；MySQL 8 可用 `IDENTITY` 自增。
- 注意：与 `ExecutorType.BATCH` 配合时，回填发生在 `flushStatements()` 之后，若提前读取会拿到 null。

## 二十一、MyBatis-Plus 常见陷阱

- `Wrapper` 拼接若来自外部输入需防注入（只拼白名单字段）；`eq` 字段名用实体属性而非数据库列名（MP 做映射）。
- 逻辑删除（`@TableLogic`）会在查询自动加 `deleted=0`，但**手动 SQL / XML 不受控**，易漏；更新时逻辑删除是 `update deleted=1` 而非物理删。
- `updateById` 只更新非 null 字段（null 不更新），想更新为 null 需 `set` 或 `UpdateWrapper`。
- 乐观锁 `@Version` 靠 `UPDATE ... SET ..., version=version+1 WHERE id=? AND version=?`，并发冲突抛 `OptimisticLockException`，需业务重试。
