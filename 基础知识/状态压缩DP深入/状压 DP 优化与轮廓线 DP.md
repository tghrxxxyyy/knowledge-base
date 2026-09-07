# 状压 DP 优化与轮廓线 DP

> 对应 youngyangyang04/leetcode-master 状态压缩进阶（插头 DP）与 Bellman 1962 DP 原理。

## 一、背景与挑战
普通按行/列状压只适合窄维度。处理"连通性""回路"等需记录轮廓线状态，引出插头 DP。

## 二、核心原理
轮廓线 DP 以"已决策格子的右下边界"为阶段，状态记录轮廓线上每个格的连通标号（插头）。转移只改轮廓线局部。

## 三、形式化与数学基础
状态为轮廓线插头序列 $P=(p_1,\dots,p_m)$，转移根据当前格的插头连接更新标号（合并/新建/闭合），空间 $O(m\cdot 状态数)$。

## 四、代码实现
```python
# 轮廓线 DP 高度依赖问题，下面是框架示意（以括号表示连通）
def plug_dp(n, m):
    # 状态: 轮廓线用最小表示法编码
    from collections import defaultdict
    dp = defaultdict(int)
    dp[encode([0] * (m + 1))] = 1
    for i in range(n):
        for j in range(m):
            ndp = defaultdict(int)
            for state, val in dp.items():
                for nst in transition(state, i, j):
                    ndp[nst] += val
            dp = ndp
    return sum(dp.values())

def encode(line):
    return tuple(line)

def transition(state, i, j):
    # 依据插头规则生成新轮廓线（问题相关，示意返回原状态）
    return [state]
```

## 五、与其他技术对比
普通状压记录整行/列（宽维度受限）；轮廓线只记边界，适合棋盘连通性问题但实现复杂。

## 六、常见误区
- 插头标号的最小表示法实现繁琐易错（需路径压缩式重编号）。
- 边界格的特殊处理遗漏。

## 七、与开源书/权威来源对应
- leetcode-master 状态压缩进阶（插头 DP/轮廓线）。
- Bellman 1962 DP 思想延伸。

## 八、面试题
1. 普通状压与轮廓线 DP 的状态维度差异？
2. 插头 DP 的最小表示法解决什么问题？

## 九、演进与趋势
轮廓线 DP 用于棋盘覆盖、哈密顿回路计数；与位运算结合提升常数。

## 十、小结
轮廓线 DP 把状态压缩到边界插头，突破普通状压维度限制，适合连通性计数。
