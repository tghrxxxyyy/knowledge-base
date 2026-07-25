# 回溯（DFS）

回溯算法本质是**深度优先搜索 + 状态撤销**：在递归尝试每一种选择后，撤销本次选择造成的影响，以便尝试下一种选择。

## 模板

### Java 模板

```java
void backtracking(参数) {
    if (终止条件) {
        存放结果;
        return;
    }

    for (选择：本层集合中元素（树中节点孩子的数量就是集合的大小）) {
        处理节点;
        backtracking(路径，选择列表); // 递归
        回溯，撤销处理结果
    }
}
```

### Python 模板（伪代码）

```python
for 选择 in 选择列表:
    # 做选择
    将该选择从选择列表移除
    路径.add(选择)
    backtrack(路径, 选择列表)
    # 撤销选择
    路径.remove(选择)
    将该选择再加入选择列表
```

## 典型例题

### 1. LeetCode 39 组合总和

![](images/WEBRESOURCE018da28658393f132c2a771dc319ff1c截图.png)

```java
class Solution {
    public List<List<Integer>> combinationSum(int[] candidates, int target) {
        int len = candidates.length;
        List<List<Integer>> res = new ArrayList<>();
        if (len == 0) {
            return res;
        }

        Deque<Integer> path = new ArrayDeque<>();
        dfs(candidates, 0, len, target, path, res);
        return res;
    }

    /**
     * @param candidates 候选数组
     * @param begin      搜索起点
     * @param len        冗余变量，是 candidates 里的属性，可以不传
     * @param target     每减去一个元素，目标值变小
     * @param path       从根结点到叶子结点的路径，是一个栈
     * @param res        结果集列表
     */
    private void dfs(int[] candidates, int begin, int len, int target, Deque<Integer> path, List<List<Integer>> res) {
        // target 为负数和 0 的时候不再产生新的孩子结点
        if (target < 0) {
            return;
        }
        if (target == 0) {
            res.add(new ArrayList<>(path));
            return;
        }

        // 重点理解这里从 begin 开始搜索的语意
        for (int i = begin; i < len; i++) {
            path.addLast(candidates[i]);

            // 注意：由于每一个元素可以重复使用，下一轮搜索的起点依然是 i，这里非常容易弄错
            dfs(candidates, i, len, target - candidates[i], path, res);

            // 状态重置
            path.removeLast();
        }
    }
}
```

### 2. LeetCode 46 全排列

![](images/WEBRESOURCE75068912455a4a2fa483b9ce9be1df69截图.png)

```java
class Solution {
    public List<List<Integer>> permute(int[] nums) {
        int len = nums.length;
        List<Integer> list = new ArrayList();
        List<List<Integer>> res = new ArrayList();
        boolean[] used = new boolean[len];
        dfs(nums, len, list, res, used);
        return res;
    }

    public void dfs(int[] nums, int len, List<Integer> list, List<List<Integer>> res, boolean[] used) {
        if(list.size() == len) {
            res.add(new ArrayList(list));
        }

        for(int i = 0; i < len; i++) {
            if(!used[i]) {
                list.add(nums[i]);
                used[i] = true;
                dfs(nums, len, list, res, used);
                used[i] = false;
                list.remove(list.size() - 1);
            }
        }
    }
}
```
