# Spring

## Spring Bean 的几个处理扩展方法

1. Bean 自身的方法：比如构造函数、getter/setter 以及 init-method 和 destory-method 所指定的方法等。
2. Bean 级生命周期方法：可以理解为 Bean 类直接实现接口的方法，比如 BeanNameAware、BeanFactoryAware、ApplicationContextAware、InitializingBean、DisposableBean 等方法，这些方法只对当前 Bean 生效。
3. 容器级的方法（BeanPostProcessor 一系列接口）：主要是后处理器方法，比如上图的 InstantiationAwareBeanPostProcessor、BeanPostProcessor 接口方法。这些接口的实现类是独立于 bean 的，并且会注册到 Spring 容器中。在 Spring 容器创建任何 Bean 的时候，这些后处理器都会发生作用。
4. 工厂后处理器方法（BeanFactoryProcessor 一系列接口）：包括 AspectJWeavingEnabler、CustomAutowireConfigurer、ConfigurationClassPostProcessor 等。这些都是 Spring 框架中已经实现好的 BeanFactoryPostProcessor，用来实现某些特定的功能。

![](images/ea479a06399f40ef5f90307e30b82d57ea479a06399f40ef5f90307e30b82d57.jpg)

> 图：Spring Bean 生命周期示意

![](images/WEBRESOURCE3a8fdf6671dbadf5ea46c56bb2861899截图.png)

> 图：Spring Bean 生命周期扩展方法示意（一）

![](images/WEBRESOURCEf992c7ee09f68399a566821b3dea0c5b截图.png)

> 图：Spring Bean 生命周期扩展方法示意（二）

## Spring MVC 的整体流程

![](images/WEBRESOURCE53f2df765f672d94833c32204d642155截图.png)

> 图：Spring MVC 整体流程

## Spring 循环依赖源码解析

```java
// 一级缓存
private final Map singletonObjects = new ConcurrentHashMap<>(256);
// 二级缓存
private final Map earlySingletonObjects = new HashMap<>(16);
// 三级缓存
private final Map> singletonFactories = new HashMap<>(16);

protected Object getBean(final String beanName) {
    // !以下为getSingleton逻辑！
    // 先从一级缓存获取
    Object single = singletonObjects.get(beanName);
    if (single != null) {
        return single;
    }
    // 再从二级缓存获取
    single = earlySingletonObjects.get(beanName);
    if (single != null) {
        return single;
    }
    // 从三级缓存获取objectFactory
    ObjectFactory objectFactory = singletonFactories.get(beanName);
    if (objectFactory != null) {
        single = objectFactory.get();
        // 升到二级缓存
        earlySingletonObjects.put(beanName, single);
        singletonFactories.remove(beanName);
        return single;
    }
    // !以上为getSingleton逻辑！

    // ！以下为doCreateBean逻辑
    // 缓存完全拿不到，需要创建
    // 创建实例
    Object beanInstance = createBeanInstance(beanName);
    // 实例创建之后，放入三级缓存
    singletonFactories.put(beanName, () -> return beanInstance);
    // 依赖注入，会触发依赖的bean的getBean方法
    populateBean(beanName, beanInstance);
    // 初始化方法调用
    initializeBean(beanName, beanInstance);

    // 依赖注入完之后，如果二级缓存有值，说明出现了循环依赖
    // 这个时候直接取二级缓存中的bean实例
    Object earlySingletonReference = earlySingletonObjects.get(beanName);
    if (earlySingletonReference != null) {
        beanInstance = earlySingletonObject;
    }
    // ！以上为doCreateBean逻辑

    // 从二三缓存移除，放入一级缓存
    singletonObjects.put(beanName, beanInstance);
    earlySingletonObjects.remove(beanName);
    singletonFactories.remove(beanName);

    return beanInstance;
}
```

## Spring 涉及的设计模式

![](images/WEBRESOURCE899a6ae27f4885c8dc1da7a280486182截图.png)

> 图：Spring 设计模式示意（一）

![](images/WEBRESOURCEa07c311a1dfa610d65f07d9971173d3fimage.png)

> 图：Spring 设计模式示意（二）

## 对 Spring 的 IOC 和 AOP 的理解

Spring 的 IOC 包含两种实现方式：DI（依赖注入）和 DL（依赖查找）。

DL 分两种：依赖拖曳（Dependency Pull）、上下文查找。

## 对 Spring 的循环依赖和 Bean 生命周期相关的比较好的博主

[Spring 循环依赖与 Bean 生命周期（掘金）](https://juejin.cn/post/7213307533279199292#heading-11)

## Spring 事务详解

[Spring 事务详解（掘金）](https://juejin.cn/post/7208479235132244023)

## 熔断框架

取代了原先的 Netflix Hystrix，官网停止维护了。

Resilience4j 是一个轻量级、易于使用的“容错”包。它受 Netflix Hystrix 启发但只有一个依赖（Vavr），而不像 Hystrix 有很多很多的依赖。

Resilience4j 在“容错”方面提供了各种模式：断路器（Circuit Breaker）、重试（Retry）、限时器（Time Limiter）、限流器（Rate Limiter）、隔板（BulkHead）。

[Resilience4j 介绍（知乎）](https://zhuanlan.zhihu.com/p/583585713?utm_id=0)

## Spring Boot 项目为什么能一键启动

![](images/WEBRESOURCE93a638128cc977bce64bb7d7d9c4359eimage.png)

> 图：Spring Boot 一键启动原理

## 实现多数据源切换

核心是 AbstractRoutingDataSource 这个类，这个是 spring-jdbc 自带的。

## Spring Modulith（模块化单体）
