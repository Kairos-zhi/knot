# Run历史与当前产物位置的组合版本

Run source继续允许Run seq>=Workspace floor；历史phase可分时读取，不要求所有请求原子或强制聚合新API。current assets是否有产物是另一个事实，不能由新Run+旧assets推断已删除。

RunStatusPanel显式接收assetSeq与runSeq。areRunAssetsComparable只验证两者为非负safe integer且相等；缺失、坏值或大小不等均不可组合，不默认为同epoch。

| 状态 | 显示／动作 |
|---|---|
| 同epoch且目标／块存在 | present，允许查看 |
| 同epoch而目标／块不存在 | missing，保留“产物位置已失效，完成记录仍保留”，禁查看 |
| 不同／缺／坏epoch | unknown，历史完成仍显示，位置待核对／要求刷新，禁查看 |
| source或Workspace busy/error／指针不对应 | 沿原屏障显示核对提示，不提供旧位置操作 |

四phase标签与完成receipt细节仍仅来自createRunStatusView。混版旧assets有标题可作已知文本；若旧快照没有目标，不写“目标已移除”，而是“运行目标待核对”。即使旧assets恰有相同block ID，混版也不能开放定位。

client导航token捕获当次source快照对象和asset快照对象。执行时重新读取最新source／Workspace；必须仍对应active worksite、可组合epoch、捕获对象身份相同，且最新Run列表有匹配completed outputReference；再用原resolveRunOutput核当前目标和块。旧按钮回调即使被直接调用也不能绕过。

已开预览在render同步使用同样token／tuple／当前块判断；不等effect才隐藏。source每次emit对象更新，所以同seq refresh经过loading再success也使旧token永久失效；即使两个阶段之间没有render，也不会自动复活旧预览。effect只回收旧引用；重新查看必须是当前可核对版本下的新动作。

没有修改source generation/floor、SSE手动核对、WorkIsland历史phase、server或低层resolver，不增加请求／监听／timer／运行与取消入口。程序化验证不代替实际ReactDOM／焦点／native EventSource／宿主／人的体验。
