# Nacos 源码解析

## 服务的注册流程

从 Spring Boot 的自动装配说起：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

这个依赖下的 `spring.factories` 中，自动装配了类：

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  com.alibaba.cloud.nacos.discovery.NacosDiscoveryAutoConfiguration,\
  com.alibaba.cloud.nacos.ribbon.RibbonNacosAutoConfiguration,\
  com.alibaba.cloud.nacos.endpoint.NacosDiscoveryEndpointAutoConfiguration,\
  com.alibaba.cloud.nacos.registry.NacosServiceRegistryAutoConfiguration,\
  com.alibaba.cloud.nacos.discovery.NacosDiscoveryClientConfiguration,\
  com.alibaba.cloud.nacos.discovery.reactive.NacosReactiveDiscoveryClientConfiguration,\
  com.alibaba.cloud.nacos.discovery.configclient.NacosConfigServerAutoConfiguration
org.springframework.cloud.bootstrap.BootstrapConfiguration=\
  com.alibaba.cloud.nacos.discovery.configclient.NacosDiscoveryClientConfigServiceBootstrapConfiguration
```

其中，注册核心为 `NacosServiceRegistryAutoConfiguration`，它注入了 `NacosAutoServiceRegistration`。

这个类继承了 `AbstractAutoServiceRegistration`：

```java
public abstract class AbstractAutoServiceRegistration<R extends Registration>
      implements AutoServiceRegistration, ApplicationContextAware,
      ApplicationListener<WebServerInitializedEvent>
```

当完成 Spring 的容器加载后调用 `onApplicationEvent`，进入 `org.springframework.cloud.client.serviceregistry.ServiceRegistry#register`，进而调用 `com.alibaba.nacos.client.naming.NacosNamingService#registerInstance(java.lang.String, java.lang.String, com.alibaba.nacos.api.naming.pojo.Instance)`：

```java
public void registerInstance(String serviceName, String groupName, Instance instance) throws NacosException {
    //心跳默认是5s一次执行，rest接口发送
    if (instance.isEphemeral()) {
        BeatInfo beatInfo = new BeatInfo();
        beatInfo.setServiceName(NamingUtils.getGroupedName(serviceName, groupName));
        beatInfo.setIp(instance.getIp());
        beatInfo.setPort(instance.getPort());
        beatInfo.setCluster(instance.getClusterName());
        beatInfo.setWeight(instance.getWeight());
        beatInfo.setMetadata(instance.getMetadata());
        beatInfo.setScheduled(false);
        beatInfo.setPeriod(instance.getInstanceHeartBeatInterval());
        this.beatReactor.addBeatInfo(NamingUtils.getGroupedName(serviceName, groupName), beatInfo);
    }
    //注册服务 rest接口
    this.serverProxy.registerService(NamingUtils.getGroupedName(serviceName, groupName), groupName, instance);
}
```

## 客户端发现

一样依靠了 Spring Boot 的自动装配了这个类 `NacosDiscoveryClientConfiguration`，这个类中加载了 `com.alibaba.cloud.nacos.discovery.NacosWatch`。

这个类核心继承了 `org.springframework.context.SmartLifecycle`（extends `org.springframework.context.Lifecycle`）：

```java
public interface Lifecycle {
    void start();

    void stop();

    boolean isRunning();
}
```

```java
@Override
public void start() {
   if (this.running.compareAndSet(false, true)) {
      this.watchFuture = this.taskScheduler.scheduleWithFixedDelay(
            this::nacosServicesWatch, this.properties.getWatchDelay());
   }
}
private long watchDelay = 30000;
```

## 如何支持高并发注册（异步任务与内存队列设计原理及源码剖析）

> ⚠️ 本小节内容待补充。

## nacos 的配置中心功能实现

整体工作流程如下：

- 客户端发起长轮询请求
- 服务端收到请求以后，先比较服务端缓存中的数据是否相同，如果不同，则直接返回
- 如果相同，则通过 schedule 延迟 29.5s 之后再执行比较
- 为了保证当服务端在 29.5s 之内发生数据变化能够及时通知给客户端，服务端采用事件订阅的方式来监听服务端本地数据变化的事件，一旦收到事件，则触发 DataChangeTask 的通知，并且遍历 allSubs 队列中的 ClientLongPolling，把结果写回到客户端，就完成了一次数据的推送
- 如果 DataChangeTask 任务完成了数据的“推送”之后，ClientLongPolling 中的调度任务又开始执行了怎么办呢？很简单，只要在进行“推送”操作之前，先将原来等待执行的调度任务取消掉就可以了，这样就防止了推送操作写完响应数据之后，调度任务又去写响应数据，这时肯定会报错的。所以，在 ClientLongPolling 方法中，最开始的一个步骤就是删除订阅事件

通过 Spring Boot 的自动装配原理，在 `spring-cloud-starter-alibaba-nacos-config` 的 `spring.factories` 中自动装配了 `com.alibaba.cloud.nacos.NacosConfigBootstrapConfiguration`：

```java
//这个类里核心注入了 com.alibaba.cloud.nacos.NacosConfigManager，在它的构造方法中执行了 createConfigService 方法，通过 NacosFactory
//生成了核心的 ConfigService，调用 getConfig 进入到 NacosConfigService 类中 new 了一个 ClientWorker
public ClientWorker(final HttpAgent agent, final ConfigFilterChainManager configFilterChainManager, final Properties properties) {
    this.agent = agent;
    this.configFilterChainManager = configFilterChainManager;

    // Initialize the timeout parameter

    init(properties);
    //检查线程池
    executor = Executors.newScheduledThreadPool(1, new ThreadFactory() {
        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r);
            t.setName("com.alibaba.nacos.client.Worker." + agent.getName());
            t.setDaemon(true);
            return t;
        }
    });
    //长轮询
    executorService = Executors.newScheduledThreadPool(Runtime.getRuntime().availableProcessors(), new ThreadFactory() {
        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r);
            t.setName("com.alibaba.nacos.client.Worker.longPolling." + agent.getName());
            t.setDaemon(true);
            return t;
        }
    });
    //每10ms执行 一次
    executor.scheduleWithFixedDelay(new Runnable() {
        @Override
        public void run() {
            try {
                checkConfigInfo();
            } catch (Throwable e) {
                LOGGER.error("[" + agent.getName() + "] [sub-check] rotate check error", e);
            }
        }
    }, 1L, 10L, TimeUnit.MILLISECONDS);
}

public void checkConfigInfo() {
    // 分任务
    int listenerSize = cacheMap.get().size();
    // 向上取整为批数  默认3000个一批
    int longingTaskCount = (int) Math.ceil(listenerSize / ParamUtil.getPerTaskConfigSize());
    if (longingTaskCount > currentLongingTaskCount) {
        for (int i = (int) currentLongingTaskCount; i < longingTaskCount; i++) {
            // 要判断任务是否在执行 这块需要好好想想。 任务列表现在是无序的。变化过程可能有问题
            executorService.execute(new LongPollingRunnable(i));
        }
        currentLongingTaskCount = longingTaskCount;
    }
}
```

![服务端 /v1/cs/configs/listener 接口](images/WEBRESOURCE76d81e36f2d5a87a95ce80b335aa0f05stickPicture.png)

> 上图为服务端 `/v1/cs/configs/listener` 接口的处理示意（原为有道云笔记截图，此处保留引用）。

## doPollingConfig

这个方法主要是用来做长轮询和短轮询的判断：

1. 如果是长轮询，直接走 addLongPollingClient 方法
2. 如果是短轮询，直接比较服务端的数据，如果存在 md5 不一致，直接把数据返回

```java
public void addLongPollingClient(HttpServletRequest req, HttpServletResponse rsp, Map<String, String> clientMd5Map,
        int probeRequestSize) {

    String str = req.getHeader(LongPollingService.LONG_POLLING_HEADER);
    String noHangUpFlag = req.getHeader(LongPollingService.LONG_POLLING_NO_HANG_UP_HEADER);
    String appName = req.getHeader(RequestUtil.CLIENT_APPNAME_HEADER);
    String tag = req.getHeader("Vipserver-Tag");
    int delayTime = SwitchService.getSwitchInteger(SwitchService.FIXED_DELAY_TIME, 500);

    // Add delay time for LoadBalance, and one response is returned 500 ms in advance to avoid client timeout.
    long timeout = Math.max(10000, Long.parseLong(str) - delayTime);
    if (isFixedPolling()) {
        timeout = Math.max(10000, getFixedPollingInterval());
        // Do nothing but set fix polling timeout.
    } else {
        long start = System.currentTimeMillis();
        List<String> changedGroups = MD5Util.compareMd5(req, rsp, clientMd5Map);
        if (changedGroups.size() > 0) {
            generateResponse(req, rsp, changedGroups);
            LogUtil.CLIENT_LOG.info("{}|{}|{}|{}|{}|{}|{}", System.currentTimeMillis() - start, "instant",
                    RequestUtil.getRemoteIp(req), "polling", clientMd5Map.size(), probeRequestSize,
                    changedGroups.size());
            return;
        } else if (noHangUpFlag != null && noHangUpFlag.equalsIgnoreCase(TRUE_STR)) {
            LogUtil.CLIENT_LOG.info("{}|{}|{}|{}|{}|{}|{}", System.currentTimeMillis() - start, "nohangup",
                    RequestUtil.getRemoteIp(req), "polling", clientMd5Map.size(), probeRequestSize,
                    changedGroups.size());
            return;
        }
    }
    String ip = RequestUtil.getRemoteIp(req);

    // Must be called by http thread, or send response.
    final AsyncContext asyncContext = req.startAsync();

    // AsyncContext.setTimeout() is incorrect, Control by oneself
    asyncContext.setTimeout(0L);

    ConfigExecutor.executeLongPolling(
            new ClientLongPolling(asyncContext, clientMd5Map, ip, probeRequestSize, timeout, appName, tag));
}
public void run() {
    try {
        getRetainIps().put(ClientLongPolling.this.ip, System.currentTimeMillis());

        // Delete subsciber's relations.
        boolean removeFlag = allSubs.remove(ClientLongPolling.this);

        if (removeFlag) {
            if (isFixedPolling()) {
                LogUtil.CLIENT_LOG
                        .info("{}|{}|{}|{}|{}|{}", (System.currentTimeMillis() - createTime), "fix",
                                RequestUtil.getRemoteIp((HttpServletRequest) asyncContext.getRequest()),
                                "polling", clientMd5Map.size(), probeRequestSize);
                List<String> changedGroups = MD5Util
                        .compareMd5((HttpServletRequest) asyncContext.getRequest(),
                                (HttpServletResponse) asyncContext.getResponse(), clientMd5Map);
                if (changedGroups.size() > 0) {
                    sendResponse(changedGroups);
                } else {
                    sendResponse(null);
                }
            } else {
                LogUtil.CLIENT_LOG
                        .info("{}|{}|{}|{}|{}|{}", (System.currentTimeMillis() - createTime), "timeout",
                                RequestUtil.getRemoteIp((HttpServletRequest) asyncContext.getRequest()),
                                "polling", clientMd5Map.size(), probeRequestSize);
                sendResponse(null);
            }
        } else {
            LogUtil.DEFAULT_LOG.warn("client subsciber's relations delete fail.");
        }
    } catch (Throwable t) {
        LogUtil.DEFAULT_LOG.error("long polling error:" + t.getMessage(), t.getCause());
    }

}
//LongPollingService监听了数据变更的事件，触发事件的话会有定时任务DataChangeTask
@Override
public void run() {
    try {
        ConfigCacheService.getContentBetaMd5(groupKey);
        for (Iterator<ClientLongPolling> iter = allSubs.iterator(); iter.hasNext(); ) {
            ClientLongPolling clientSub = iter.next();
            if (clientSub.clientMd5Map.containsKey(groupKey)) {
                // If published tag is not in the beta list, then it skipped.
                if (isBeta && !CollectionUtils.contains(betaIps, clientSub.ip)) {
                    continue;
                }

                // If published tag is not in the tag list, then it skipped.
                if (StringUtils.isNotBlank(tag) && !tag.equals(clientSub.tag)) {
                    continue;
                }

                getRetainIps().put(clientSub.ip, System.currentTimeMillis());
                iter.remove(); // Delete subscribers' relationships.
                LogUtil.CLIENT_LOG
                        .info("{}|{}|{}|{}|{}|{}|{}", (System.currentTimeMillis() - changeTime), "in-advance",
                                RequestUtil
                                        .getRemoteIp((HttpServletRequest) clientSub.asyncContext.getRequest()),
                                "polling", clientSub.clientMd5Map.size(), clientSub.probeRequestSize, groupKey);
                clientSub.sendResponse(Arrays.asList(groupKey));
            }
        }
    } catch (Throwable t) {
        LogUtil.DEFAULT_LOG.error("data change error: {}", ExceptionUtil.getStackTrace(t));
    }
}
```
