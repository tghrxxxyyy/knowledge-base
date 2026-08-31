# Spring 框架核心源码要点

> 本文从源码视角梳理 Spring（以 Spring Framework / Spring Boot 为主）的核心机制：IoC 容器、Bean 生命周期、依赖注入、AOP、事务、以及 Boot 自动配置。内容基于公开源码结构与原理，具体类名与流程以对应版本为准。

## 1. Spring 的核心：IoC 容器

- IoC（控制反转）：对象创建与依赖管理交给容器，而非硬编码 new。
- 容器即 ApplicationContext，管理 Bean 定义与实例。
- BeanFactory 是基础接口，ApplicationContext 扩展（国际化、事件、AOP）。

## 2. BeanDefinition

- 容器不直接持 Java 对象，先解析为 BeanDefinition（类、scope、依赖、初始化方法等元数据）。
- 来源：XML、@ComponentScan、@Bean、@Import。
- 容器启动时注册所有 BeanDefinition 到 BeanFactory。

## 3. 容器启动流程（思路）

1. 定位与加载配置（Resource → Document → BeanDefinition）。
2. 注册 BeanDefinition 到容器。
3. 实例化单例（getBean 触发或预实例化）。
4. 依赖注入、初始化、后置处理。
5. 容器就绪，对外提供 Bean。

## 4. Bean 生命周期

### 4.1 阶段

- 实例化（构造器创建对象）。
- 属性填充（依赖注入，populate）。
- Aware 接口回调（BeanNameAware、BeanFactoryAware 等）。
- BeanPostProcessor 前置。
- 初始化（@PostConstruct / InitializingBean / init-method）。
- BeanPostProcessor 后置（AOP 代理常在此生成）。
- 使用。
- 销毁（@PreDestroy / DisposableBean / destroy-method）。

### 4.2 关键扩展点

- BeanPostProcessor：每个 Bean 初始化前后干预（AOP、校验）。
- InstantiationAwareBeanPostProcessor：实例化前后。
- FactoryBean：自定义复杂对象创建（如 MyBatis 的 SqlSessionFactoryBean）。
- BeanFactoryPostProcessor：BeanDefinition 级别修改（占位符替换）。

## 5. 依赖注入

### 5.1 方式

- 构造器注入：推荐，不可变、必填清晰。
- Setter 注入：可选依赖。
- 字段注入（@Autowired 字段）：方便但难测试、隐藏依赖。

### 5.2 注入过程

- 容器按类型/名称解析依赖 Bean。
- 循环依赖：Spring 用"三级缓存"解决单例构造器外的循环（提前暴露半成品对象）。
- 多实现：用 @Qualifier / @Primary 指定。

### 5.3 循环依赖

- 构造器循环依赖无法解决（抛异常）。
- 字段/Setter 循环：三级缓存（singletonFactories 提前暴露代理/原始对象）打破。

## 6. AOP 原理

### 6.1 概念

- 切面（Aspect）：横切逻辑（日志、事务、权限）。
- 切点（Pointcut）：哪些方法织入。
- 通知（Advice）：before/after/around。
- 织入（Weaving）：把切面代码插入目标。

### 6.2 实现

- 默认用动态代理：
  - 有接口 → JDK 动态代理。
  - 无接口 → CGLIB 子类代理。
- 在 Bean 生命周期后置阶段生成代理对象。
- 调用时经拦截器链执行通知。

### 6.3 代理时机

- 容器创建 Bean 后，若匹配切点，用代理包装返回。
- 因此 @Autowired 拿到的是代理（事务/注解生效靠此）。

## 7. 事务管理

### 7.1 声明式事务

- @Transactional 基于 AOP 代理。
- 拦截方法前后开启/提交/回滚事务。

### 7.2 传播行为

- REQUIRED：有则加入，无则新建（默认）。
- REQUIRES_NEW：挂起当前，新建独立。
- NESTED：嵌套（保存点）。
- SUPPORTS / NOT_SUPPORTED / NEVER / MANDATORY 等。

### 7.3 失效场景

- 同类方法内部调用（this 调，未走代理）→ 事务不生效。
- 异常被 catch 吞掉 → 不回滚。
- 非 RuntimeException 默认不回滚（可配 rollbackFor）。
- 非 public 方法（CGLIB 也可能不代理）。

## 8. Spring Boot 自动配置

### 8.1 核心机制

- @SpringBootApplication 含 @EnableAutoConfiguration。
- 扫描 META-INF/spring.factories（或新版本 ImportCandidates）中的自动配置类。
- 每个自动配置类用 @Conditional 系列条件决定是否生效（类存在、Bean 缺失、属性匹配）。

### 8.2 条件注解

- @ConditionalOnClass / OnMissingBean / OnProperty。
- 这是"约定优于配置"的实现：有依赖就自动配，用户可覆盖。

### 8.3 启动流程

- SpringApplication.run：准备环境 → 创建容器 → 加载自动配置 → 刷新上下文 → 启动内嵌服务器（Web）。

## 9. 常用扩展总结

- 自定义 BeanPostProcessor：统一加工 Bean。
- 自定义 Starter：封装自动配置，复用。
- ApplicationListener：监听容器事件。
- Environment / PropertySource：统一配置来源。

## 10. 与 MyBatis 集成要点

- SqlSessionFactoryBean 创建会话工厂。
- MapperScanner 扫描接口生成代理（无实现类）。
- 事务由 Spring 管理（DataSourceTransactionManager / MyBatis-Spring）。
- Mapper 方法调用经 SqlSession → Executor → StatementHandler。

## 11. 常见踩坑

1. **循环依赖滥用**：虽能跑，但设计异味；优先重构解耦。
2. **事务方法自调用失效**：拆分到另一 Bean 或用 AopContext。
3. **@Transactional 吞异常**：catch 后不抛出，不回滚。
4. **字段注入难测试**：改用构造器注入。
5. **Bean 过早初始化**：@Lazy 延迟加载重 Bean。
6. **自动配置冲突**：多个 DataSource 未排除，需 @Conditional 或 @Primary。
7. **代理导致类型转换异常**：拿到的是代理类，强转失败；用接口。

## 12. 调试与阅读建议

- 从 AbstractApplicationContext.refresh() 入手看容器生命周期。
- 关注 getBean → doGetBean → 创建/注入/初始化链路。
- 用断点观察 BeanPostProcessor 何时生成 AOP 代理。
- 读 spring.factories 理解自动配置装配。

## 13. 小结

Spring 的本质是"管理对象生命周期与依赖的容器 + 横切逻辑的 AOP 织入 + Boot 的条件化自动装配"。掌握 Bean 生命周期的扩展点、三级缓存解决循环依赖、AOP 动态代理生成时机、@Transactional 代理失效场景、以及自动配置的条件机制，就能读懂绝大多数 Spring 应用的运行原理。阅读源码从 refresh() 与 getBean() 两条主线切入最高效。
