# CDN工作原理

> 对应 RFC 8825 系列（WebRTC 不直接相关，此处以 CDN 通用架构）+ Akamai/Cloudflare 技术文档；参考 xiaolincoder/hello-http。

## 一、背景与挑战
源站带宽与地理距离限制用户访问速度。CDN 通过分布式边缘节点缓存内容，使用户就近获取，降低延迟与源站压力。

## 二、核心原理
- DNS 调度：根据用户 IP 返回最近边缘节点 IP。
- 边缘缓存：节点缓存静态/可缓存响应，命中则直接返回。
- 回源：未命中时向源站或父层拉取并缓存。
- 内容刷新：purge 主动失效。

## 三、形式化与数学基础
用户到边缘 RTT 远小于到源站：
  RTT_edge << RTT_origin
缓存命中率：
  HR = hit / (hit + miss)
命中率每提升 1% 显著降低源站带宽 B_src = B_total * (1 - HR)

## 四、代码实现
# 边缘节点回源逻辑（伪代码）
def serve(req):
    obj = cache.get(req.url)
    if obj and obj.fresh():
        return obj                      # 命中
    obj = origin.fetch(req)             # 回源
    cache.put(req.url, obj, ttl=obj.max_age)
    return obj

## 五、与其他技术对比
CDN 是"分布式反向缓存代理"，与本地浏览器缓存互补；与负载均衡区别在于聚焦内容就近。

## 六、常见误区
1. 认为动态内容无法 CDN——边缘计算/ESI 可缓存片段。
2. 忽视缓存 key 包含 Query String，易缓存错乱。

## 七、与开源书/权威来源对应
- xiaolincoder/hello-http（CDN 章节）
- Cloudflare / Akamai 技术文档
- Kurose & Ross《Computer Networking》（CDN 章）

## 八、面试题
CDN 如何做调度？命中率怎么算？回源是什么？

## 九、演进与趋势
边缘计算（Edge Functions）让 CDN 节点执行动态逻辑，模糊静态/动态边界。

## 十、小结
CDN 通过就近缓存与智能调度，是大规模 Web 性能与可用性的基石。
