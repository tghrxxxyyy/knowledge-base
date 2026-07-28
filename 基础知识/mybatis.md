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
