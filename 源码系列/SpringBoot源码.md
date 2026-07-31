# Spring Boot 源码精读

## 〇、本体介绍

**Spring Boot** 的核心是「**约定优于配置 + 自动装配**」，让 Spring 应用零 XML、内嵌容器、一键启动。源码里最该读懂的是 **`@SpringBootApplication` 的三合一魔法**与 **自动配置的条件化装配机制**。

**为什么读源码**：理解「为什么加个依赖就能用」「starter 怎么工作」「bean 冲突怎么排」「启动慢/体积大怎么查」——排查「自动配置不生效」「循环依赖」都靠它。

**三个注解合一**：`@SpringBootApplication` = `@Configuration` + `@ComponentScan` + `@EnableAutoConfiguration`。

---

## 一、启动流程（SpringApplication.run）

1. **推断应用类型**（Servlet / Reactive / None）、**加载 `ApplicationContextInitializer` 与 `ApplicationListener`**（spring.factories / `@AutoConfiguration` 注册）。
2. **创建并准备 Environment**（profiles、配置源）。
3. **创建 ApplicationContext**（根据类型选 `AnnotationConfigServletWebServerApplicationContext` 等）。
4. **refresh()**（Spring 核心，见 源码系列/spring.md）：`prepareRefresh` → `obtainFreshBeanFactory` → `invokeBeanFactoryPostProcessors`（**解析 @Configuration、处理 @Import、触发自动配置**）→ `registerBeanPostProcessors` → `onRefresh`（**创建 WebServer，内嵌 Tomcat**）→ `finishBeanFactoryInitialization`（**实例化单例**）→ `finishRefresh`。
5. **内嵌容器启动**：`onRefresh` 中 `ServletWebServerApplicationContext` 创建并启动 Tomcat（见 源码系列/Tomcat源码.md）。
6. 发布 `ApplicationStartedEvent` / `ApplicationReadyEvent`。

---

## 二、自动配置（AutoConfiguration）

- **触发**：`@EnableAutoConfiguration` → `@Import(AutoConfigurationImportSelector)`。
- **加载候选**：从 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`（2.7+，旧版 `spring.factories`）读取所有自动配置类。
- **条件过滤（@Conditional）**：每个 `XxxAutoConfiguration` 用 `@ConditionalOnClass` / `OnMissingBean` / `OnProperty` / `OnWebApplication` 等决定是否生效——**「有这个类、且你没有自己定义 bean 时，我才配」**，这就是「约定优于配置」的实现。
- **@Import 的三种用法**：`@ImportBeanDefinitionRegistrar`、`ImportSelector`（AutoConfiguration 用它批量选）、直接导入 @Configuration 类。

---

## 三、条件注解（@Conditional）家族

| 注解 | 含义 |
|------|------|
| `@ConditionalOnClass` | classpath 有某类才生效 |
| `@ConditionalOnMissingBean` | 容器无该 bean 才生效（**允许用户覆盖**） |
| `@ConditionalOnProperty` | 配置项匹配才生效 |
| `@ConditionalOnWebApplication` | 是 Web 应用才生效 |
| `@AutoConfigureBefore/After` | 控制自动配置顺序 |

> **用户自定义优先**：`@ConditionalOnMissingBean` 保证你自己写的 bean 会覆盖自动配置的——这是「可定制」的关键。

---

## 四、Starter 机制

- Starter 本质：**一个空 pom 依赖包 + 一个 `autoconfigure` 模块**，后者在 `imports` 里声明配置类。引入 starter，自动配置随之生效。
- 例：`spring-boot-starter-data-redis` 引入 → `RedisAutoConfiguration` 条件装配 `RedisTemplate` / `StringRedisTemplate`。

---

## 五、Bean 生命周期与循环依赖

- **生命周期**：实例化（构造）→ 属性填充（@Autowired）→ `Aware` 回调 → `BeanPostProcessor.before` → `@PostConstruct`/`InitializingBean` → `BeanPostProcessor.after` → 就绪 → `@PreDestroy`/`DisposableBean` 销毁。
- **循环依赖**：Spring 用 **三级缓存**（singletonObjects / earlySingletonObjects / `singletonFactories` 放「半成品工厂」）解决**单例 setter/字段注入**的循环；**构造器注入、原型、不支持**。
- **AOP 与循环**：提前暴露的是「原始对象或 AOP 代理」，通过 `getEarlyBeanReference` 统一处理。

---

## 六、外部化配置（Environment）

- 配置来源有序：命令行 > 环境变量 > application-{profile}.yml > application.yml > 默认。
- `PropertySource` 列表、`@Value` / `@ConfigurationProperties` 绑定（宽松绑定）。

---

## 七、与其他板块的关系

- **源码系列 / spring.md**：Boot 建立在 Spring Framework 的 refresh/BeanFactory 之上，本篇是其「自动装配」扩展。
- **源码系列 / Tomcat源码.md**：Boot 内嵌 Tomcat，onRefresh 启动。
- **基础知识 / 并发编程**：Bean 单例线程安全、循环依赖三级缓存。

---

## 八、速查表

| 机制 | 作用 |
|------|------|
| @EnableAutoConfiguration | 触发自动配置 |
| AutoConfigurationImportSelector | 批量导入配置类 |
| @ConditionalOnMissingBean | 用户可覆盖 |
| 三级缓存 | 解决单例循环依赖 |
| Starter | 依赖包+自动配置模块 |

---

## 面试高频问题（20+ 条）

1. **@SpringBootApplication 是哪三个注解？** @Configuration + @ComponentScan + @EnableAutoConfiguration。
2. **自动配置原理？** @EnableAutoConfiguration → ImportSelector 读 imports 列表 → 条件注解过滤生效。
3. **自动配置类从哪加载？** 2.7+ 读 META-INF/spring/...AutoConfiguration.imports（旧 spring.factories）。
4. **@ConditionalOnMissingBean 意义？** 无用户 bean 才自动配，保证用户自定义优先覆盖。
5. **为什么 starter 加依赖就能用？** starter 引 autoconfigure 模块，其声明自动配置类 + 条件装配。
6. **Spring Boot 启动核心步骤？** 推断类型→准备Environment→建Context→refresh→onRefresh起Tomcat→实例化单例→发事件。
7. **内嵌 Tomcat 何时启动？** AbstractApplicationContext.refresh 的 onRefresh，ServletWebServerApplicationContext 建并启动。
8. **Spring 的 refresh 做了什么？** 准备→BeanFactory→BeanFactoryPostProcessor→BeanPostProcessor→onRefresh→实例化单例→finishRefresh。
9. **@Import 有几种用法？** 导入 @Configuration、ImportSelector(批量选)、ImportBeanDefinitionRegistrar(编程注册)。
10. **循环依赖怎么解决？** 三级缓存（含 earlySingletonObjects + 工厂），暴露半成品解决单例字段/setter 循环。
11. **哪些循环依赖解决不了？** 构造器注入、原型(prototype)作用域。
12. **为什么用三级缓存而非两级？** 需提前暴露「可能是 AOP 代理的半成品」，工厂层统一处理原始/代理。
13. **Bean 生命周期？** 实例化→填充→Aware→BPP.before→init→BPP.after→销毁。
14. **@PostConstruct / InitializingBean？** 初始化回调，前者注解后者接口，均在填充后、就绪前。
15. **配置优先级？** 命令行>环境变量>profile yml>默认 yml。
16. **@ConfigurationProperties 作用？** 把配置批量绑定到 bean（宽松绑定）。
17. **如何实现可插拔自动配置？** 条件注解 + @AutoConfigureBefore/After 控制顺序。
18. **Spring Boot 2.7 弃用了什么？** spring.factories 的自动配置改到 AutoConfiguration.imports。
19. **actuator 是什么？** 生产监控端点（健康检查/指标），见可观测性。
20. **fat jar 怎么运行？** Boot 打可执行 jar，Launcher 起的嵌套 jar 类加载器加载 BOOT-INF 类。
21. **启动慢怎么查？** 开 debug 看自动配置报告、Bean 数量、懒加载 @Lazy、排除无用 starter。
22. **自动配置不生效怎么排查？** 看 ConditionEvaluationReport（debug=true），确认 class 缺失/条件不满足/被用户 bean 覆盖。
