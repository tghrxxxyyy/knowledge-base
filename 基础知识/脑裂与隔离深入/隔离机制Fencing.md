# 隔离机制Fencing

> 对应 Gray 1978（Notes on Data Base Operating Systems，fencing 概念）与 Kleppmann DDIA 第8章（fencing tokens）。

## 一、背景与挑战
即使有租约/选主，陈旧的主（因网络抖动被误判失联）可能在恢复后继续写，破坏新主的数据。隔离（fencing）机制在存储层拒绝陈旧写入。

## 二、核心原理
- 每次授予领导权时颁发单调递增的 fencing token。
- 存储服务记录已接受的最大 token，拒绝 token 更小的写。
- 陈旧主持旧 token，写被拒，从而被“隔离”。

## 三、形式化与数学基础
设第 k 次选举的 token 为 k。存储维护 $t_{max}$。写请求带 token t，仅当 $t > t_{max}$ 才执行并令 $t_{max} = t$，否则拒绝。

## 四、代码实现
# 存储侧 fencing 检查
class Store:
    def __init__(self):
        self.tmax = 0
    def write(self, token, data):
        if token <= self.tmax:
            return False   # 陈旧写被拒绝
        self.tmax = token
        apply(data)
        return True

## 五、与其他技术对比
- 对比租约：租约靠时间，fencing 靠单调序号，更稳。
- 对比 ZooKeeper 临时节点：临时节点消失即失去权利。

## 六、常见误区
1. 认为有 leader 选举就不需要 fencing。
2. token 不单调导致绕过。

## 七、与开源书/权威来源对应
- Gray 1978, Operating Systems Notes。
- Kleppmann, DDIA, Ch.8。
- Hunt et al. 2010, ZooKeeper。

## 八、面试题
1. fencing token 如何阻止陈旧主写？
2. 为什么时间租约不够？

## 九、演进与趋势
把 fencing 下沉到磁盘/云卷的写令牌（如 cloud volume lease）。

## 十、小结
fencing 是防守脑裂的最后一道闸，应在存储层强制生效。
