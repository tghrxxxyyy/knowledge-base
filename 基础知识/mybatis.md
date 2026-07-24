

1.延迟加载的原理是什么

2.说一下 mybatis 的一级缓存和二级缓存

3.mybatis解析执行xml的语句的流程





![](images/WEBRESOURCEba15ebd23646b278ee3f70879e89b805截图.png)



![](images/WEBRESOURCEcbf21ebb9a380f4c070ee4c500a07f12截图.png)

## 1.延迟加载的原理是什么

它的原理是，使用 CGLIB 或 Javassist( 默认 ) 创建目标对象的代理对象。当调用代理对象的延迟加载属性的 getting 方法时，进入拦截器方法。比如调用 a.getB().getName() 方法，进入拦截器的 invoke(...) 方法，发现 a.getB() 需要延迟加载时，那么就会单独发送事先保存好的查询关联 B 对象的 SQL ，把 B 查询上来，然后调用 a.setB(b) 方法，于是 a 对象 b 属性就有值了，接着完成 a.getB().getName() 方法的调用。这就是延迟加载的基本原理





## 2.说一下 mybatis 的一级缓存和二级缓存

![](images/WEBRESOURCEfff9202df808e31252d7eb1473e18f81截图.png)

一级缓存 

BaseExecutor

BaseExecutor 是一个抽象类，实现了 Executor 接口，并提供了大部分方法的实现，只有 4 个基本方法：doUpdate, doQuery, doQueryCursor, doFlushStatement 没有实现，还是一个抽象方法，由子类实现，这 4 个方法相当于模板方法中变化的那部分



二级缓存

当配置打开，Mybatis 的二级缓存是用 CachingExecutor 来实现的，它是 Executor 的一个装饰器类。为 Executor 对象添加了MapperFactoryBean缓存的功能。

在介绍 CachingExecutor 之前，先来看看 CachingExecutor 依赖的两个类，TransactionalCacheManager 和 TransactionalCache。



## 3.mybatis解析执行xml的语句的流程

1）MapperScannerConfigurer 是一个 BeanDefinitionRegistryPostProcessor，会在 Spring 构建 IoC容器的早期被调用重写的 postProcessBeanDefinitionRegistry ，扫描注册 basePackage 包下的所有 bean，将 basePackage 包下的所有 bean 进行一些特殊处理：beanClass 设置为 MapperFactoryBean、bean 的真正接口类作为构造函数参数传入 MapperFactoryBean、为 MapperFactoryBean 添加 sqlSessionFactory 和 sqlSessionTemplate属性。

2）SqlSessionFactoryBean 来说，实现了2个接口，InitializingBean 和 FactoryBean，build了buildSqlSessionFactory ，构建了全局配置 Configuration，解析 mapperLocations 属性的 mapper 文件，将 mapper 文件中的每个 SQL 封装成 MappedStatement，放到 mappedStatements 缓存中，key 为 id，例如：com.joonwhee.open.mapper.UserPOMapper.queryByPrimaryKey，value 为 MappedStatement。并且将解析过的 mapper 文件的 namespace 放到 knownMappers 缓存中，key 为 namespace 对应的 class，value 为 MapperProxyFactory。

3）创建 DAO 的 bean 时，通过 mapperInterface 从 knownMappers 缓存中获取到 MapperProxyFactory 对象，通过 JDK 动态代理创建 MapperProxyFactory 实例对象，InvocationHandler 为 MapperProxy。

4）DAO 中的接口被调用时，通过动态代理，调用 MapperProxy 的 invoke 方法，最终通过 mapperInterface 从 mappedStatements 缓存中拿到对应的 MappedStatement，执行相应的操作。