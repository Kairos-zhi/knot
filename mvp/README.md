# Knot MVP

当前代码在 `mvp/`。开工先读[开发基准](docs/development-baseline.md)、根[状态](../STATE.md)／[队列](../QUEUE.md)和当前任务卡。本文不单独维护另一套进度。

## 数据与操作入口

- [数据模型和迁移](docs/SCHEMA.md)：main 新建 schema 1.4；1.5/1.6 为显式迁移，实际库版本须核实。
- [导入契约](docs/IMPORT.md)：来源校验、逐文件资产／事件事务、对象副作用及幂等边界。
- [API](docs/API.md)及对应源码：参数、返回值与既有异常；文档不同步时核源并登记，不默改语义。
- [后端代码](backend/)与[测试](tests/)：实现和程序化验证；目录存在不等于前端、时间轴、续接或桌面已交付。

在已有开发环境的仓库根运行测试：

```sh
python -m pytest mvp/tests/ -q
```

这是一条验证入口，不是本轮已执行结果。CI配置使用Python 3.12；其他环境支持范围须按任务核实。

## 初始化与迁移

只对明确准备新建的候选目标初始化，具体命令见[SCHEMA](docs/SCHEMA.md)。当前 init 遇已有文件、目录或悬空软链一律拒绝，不询问、不删除；新建使用同目录临时库自验后硬链接发布。不能将其作为升级工具，也不把默认用户目录当演练目标。已有库先核版本和结构，再按显式迁移任务处理。

## 既有不变量

- 历史按追加契约保留；候选关系不自动成为用户确认。
- 布尔、来源及正文分层授权；未经授权不缓存并外发支持族。
- 动态查询缺依赖证书时全量重算，不冒险复用。
- 冻结参考与原算法证据保留；接口／文档整理不顺手改算法。涉及内核、适配或支持族行为的代码卡须运行冻结 Frontier17 回归，不能跳过算法验证；纯文档卡不因此重跑全部测试。
- 人和Agent共用操作语义，服务层验证优先；Maker与独立Checker分离。

## 历史证据

[Day 2](docs/W1D2-development.md)、[FTS修复](docs/FTS-FIX-001.md)、[候选导入](docs/W1D3-IMPORT-001.md)、[Frontier17](docs/W1D4-FRONTIER17-001.md)、[支持族](docs/W1D5-SUPPORT-001.md)、[Day 7](docs/W1D7-EVIDENCE.md)按各自基线读取。历史1.3改动见[断言映射S38–S40](docs/W1D7-CLAIM-MAP.md)。旧数字和接受范围不自动升级为当前验证。

四周Roadmap交接原件为 `20261028_Knot_前后端Roadmap_写死版_v1.0.md`，已包含于本轮交接包并在本地交接区固定，未复制入公开仓；见[收口卡](docs/PLUGIN-W1D1-BASELINE-001.md)。旧周次用于历史映射，不替代新插件阶段任务。历史产品／研究资料继续保留于原来源；此处不复制私人路径。

当前文档同步任务见 [PLUGIN-W1D1-BASELINE-001](docs/PLUGIN-W1D1-BASELINE-001.md)，遗漏前置见[P0台账](docs/PLUGIN-P0-REGISTER.md)。旧 [ENTRYPOINT-SYNC-001](docs/ENTRYPOINT-SYNC-001.md) 保留追溯。本页更新不代表后端重新验收、主线已发布或在用软件已更新。
