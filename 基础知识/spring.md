## **spring bean的几个处理拓展方法**

1. Bean自身的方法：比如构造函数、getter/setter以及init-method和destory-method所指定的方法等

1. Bean级生命周期方法：可以理解为Bean类直接实现接口的方法，比如BeanNameAware、BeanFactoryAware、ApplicationContextAware、InitializingBean、DisposableBean等方法，这些方法只对当前Bean生效

1. 容器级的方法(BeanPostProcessor一系列接口)：主要是后处理器方法，比如上图的InstantiationAwareBeanPostProcessor、BeanPostProcessor接口方法。这些接口的实现类是独立于bean的，并且会注册到Spring容器中。在Spring容器创建任何Bean的时候，这些后处理器都会发生作用。

1. 工厂后处理器方法（BeanFactoryProcessor一系列接口）：包括AspectJWeavingEnabler、CustomAutowireConfigurer、ConfigurationClassPostProcessor等。这些都是Spring框架中已经实现好的BeanFactoryPostProcessor，用来实现某些特定的功能。

![](images/ea479a06399f40ef5f90307e30b82d57ea479a06399f40ef5f90307e30b82d57.jpg)

![](images/WEBRESOURCE3a8fdf6671dbadf5ea46c56bb2861899截图.png)

![](images/WEBRESOURCEf992c7ee09f68399a566821b3dea0c5b截图.png)

## **springMVC的整体流程**

![](images/WEBRESOURCE53f2df765f672d94833c32204d642155截图.png)

## **spring循环依赖源码解析**

// 一级缓存
private final Map singletonObjects = new ConcurrentHashMap<>(256);
// 二级缓存
private final Map earlySingletonObjects = new HashMap<>(16);
// 三级缓存
private final Map> singletonFactories = new HashMap<>(16);

protected Object getBean(final String beanName) {
    // !以下为getSingleton逻辑！
    // 先从一级缓存获取
    Object single = singletonObjects.get(beanName);
    if (single != null) {
        return single;
    }
    // 再从二级缓存获取
    single = earlySingletonObjects.get(beanName);
    if (single != null) {
        return single;
    }
    // 从三级缓存获取objectFactory
    ObjectFactory objectFactory = singletonFactories.get(beanName);
    if (objectFactory != null) {
        single = objectFactory.get();
        // 升到二级缓存
        earlySingletonObjects.put(beanName, single);
        singletonFactories.remove(beanName);
        return single;
    }
    // !以上为getSingleton逻辑！

    // ！以下为doCreateBean逻辑
    // 缓存完全拿不到，需要创建
    // 创建实例
    Object beanInstance = createBeanInstance(beanName);
    // 实例创建之后，放入三级缓存
    singletonFactories.put(beanName, () -> return beanInstance);
    // 依赖注入，会触发依赖的bean的getBean方法
    populateBean(beanName, beanInstance);
    // 初始化方法调用
    initializeBean(beanName, beanInstance);

    // 依赖注入完之后，如果二级缓存有值，说明出现了循环依赖
    // 这个时候直接取二级缓存中的bean实例
    Object earlySingletonReference = earlySingletonObjects.get(beanName);
    if (earlySingletonReference != null) {
        beanInstance = earlySingletonObject;
    }
    // ！以上为doCreateBean逻辑

    // 从二三缓存移除，放入一级缓存
    singletonObjects.put(beanName, beanInstance);
    earlySingletonObjects.remove(beanName);
    singletonFactories.remove(beanName);

    return beanInstance;
}

## **spring涉及的设计模式**

![](images/WEBRESOURCE899a6ae27f4885c8dc1da7a280486182截图.png)

![](images/WEBRESOURCEa07c311a1dfa610d65f07d9971173d3fimage.png)

## **对spring的IOC和AOP的理解**

spring的 IOC包含 两种 实现 方式 DI 依赖 注入 和 DL  依赖 查找

DL分 两种 依赖拖曳（Dependency Pull）、上下文查找

## 对Spring的循环依赖和bean生命周期相关的比较好的博主

[https://juejin.cn/post/7213307533279199292#heading-11](https://juejin.cn/post/7213307533279199292#heading-11)

## Spring事务详解

[https://juejin.cn/post/7208479235132244023](https://juejin.cn/post/7208479235132244023)

## 熔断框架

取代了原先的Netflix Hystrix，官网停止维护了

Resilience4j是一个轻量级、易于使用的轻量级“容错”包。它受Neflix Hystrix启发但只有一个依赖（Vavr），而不像Hystrix很多很多的依赖。

Resilience4j在“容错”方面提供了各种模式：断路器（Circuit Breaker）、重试（Retry）、限时器（Time Limiter）、限流器（Rate Limiter）、隔板（BulkHead）。

[https://zhuanlan.zhihu.com/p/583585713?utm_id=0](https://zhuanlan.zhihu.com/p/583585713?utm_id=0)

## springboot项目为什么能一键启动

![](images/WEBRESOURCE93a638128cc977bce64bb7d7d9c4359eimage.png)

## **实现多数据源切换**

核心是  AbstractRoutingDataSource这个类，这个是spring-jdbc自带的

## **Spring Modulith（模块化单体）**
