## 文章 ：

[https://mp.weixin.qq.com/s/ir0uurwo95hB3g__vTceJQ](https://mp.weixin.qq.com/s/ir0uurwo95hB3g__vTceJQ)      常见 zk的 面试题

ZNode的数据结构

```java
 public class DataNode implements Record {
    byte data[];  //数据                 
    Long acl;  //访问权限                      
    public StatPersisted stat;   //当前节点 状态     
    private Set<String> children = null;  //子节点  
}
```

- 「data:」

  znode存储的业务数据信息

- 「ACL:」

 记录客户端对znode节点的访问权限，如IP等。

- 「child:」

 当前节点的子节点引用

- 「stat:」

 包含Znode节点的状态信息，比如**「事务id、版本号、时间戳」**等等。

## zk是如何保证消息顺序性的

![](images/WEBRESOURCE571efa2f214a1880e3a696aac8cc818f截图.png)
