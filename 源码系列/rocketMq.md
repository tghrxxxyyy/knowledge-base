## FileWatchService

FileWatchService 用于监听文件的变更，实现逻辑比较简单。

- 在创建 FileWatchService 时，就遍历要监听的文件，计算文件的hash值，存放到内存列表中

- run() 方法中就是监听的核心逻辑，while 循环通过

 isStopped() 判断是否中断执行

- 默认每隔 500 秒检测一次文件 hash 值，然后与内存中的 hash 值做对比

- 如果文件 hash 值变更，则触发监听事件的执行

```java
package org.apache.rocketmq.srvutil;

public class FileWatchService extends ServiceThread {
    // 监听的文件路径
    private final List<String> watchFiles;
    // 文件当前hash值
    private final List<String> fileCurrentHash;
    // 监听器
    private final Listener listener;
    // 观测变化的间隔时间
    private static final int WATCH_INTERVAL = 500;
    // MD5 消息摘要
    private final MessageDigest md = MessageDigest.getInstance("MD5");

    public FileWatchService(final String[] watchFiles, final Listener listener) throws Exception {
        this.listener = listener;
        this.watchFiles = new ArrayList<>();
        this.fileCurrentHash = new ArrayList<>();

        // 遍历要监听的文件，计算每个文件的hash值并放到内存表中
        for (int i = 0; i < watchFiles.length; i++) {
            if (StringUtils.isNotEmpty(watchFiles[i]) && new File(watchFiles[i]).exists()) {
                this.watchFiles.add(watchFiles[i]);
                this.fileCurrentHash.add(hash(watchFiles[i]));
            }
        }
    }

    // 线程名称
    @Override
    public String getServiceName() {
        return "FileWatchService";
    }

    @Override
    public void run() {
        // 通过 stopped 标识来暂停业务执行
        while (!this.isStopped()) {
            try {
                // 等待 500 毫秒
                this.waitForRunning(WATCH_INTERVAL);
                // 遍历每个文件，判断文件hash值是否变更
                for (int i = 0; i < watchFiles.size(); i++) {
                    String newHash = hash(watchFiles.get(i));
                    // 对比hash
                    if (!newHash.equals(fileCurrentHash.get(i))) {
                        // 更新文件hash值
                        fileCurrentHash.set(i, newHash);
                        // 触发文件变更事件
                        listener.onChanged(watchFiles.get(i));
                    }
                }
            } catch (Exception e) {
                log.warn(this.getServiceName() + " service has exception. ", e);
            }
        }
    }

    // 计算文件的hash值
    private String hash(String filePath) throws IOException {
        Path path = Paths.get(filePath);
        md.update(Files.readAllBytes(path));
        byte[] hash = md.digest();
        return UtilAll.bytes2string(hash);
    }

    // 文件变更监听器
    public interface Listener {
        void onChanged(String path);
    }
}
复制代码
```

FileWatchService 的初始化代码大致如下：

```typescript
if (TlsSystemConfig.tlsMode != TlsMode.DISABLED) {
    fileWatchService = new FileWatchService(
        // 监听证书文件的变更
        new String[]{
                TlsSystemConfig.tlsServerCertPath,
                TlsSystemConfig.tlsServerKeyPath,
                TlsSystemConfig.tlsServerTrustCertPath
        },
        // 注册监听器
        new FileWatchService.Listener() {
            boolean certChanged, keyChanged = false;

            @Override
            public void onChanged(String path) {
                ((NettyRemotingServer) remotingServer).loadSslContext();
            }
        });
}
```

## 事件

![](images/WEBRESOURCE8e53b4ac940fa21363f516c95c5d72c1截图.png)

## rocket mq的底层的消息存储

不直接使用sendFile而是write然后flush主要是有小块数据写入的需要，对比sendfile更使用与大文件