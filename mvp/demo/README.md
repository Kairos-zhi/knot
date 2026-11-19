# Knot 公开 Demo

需要 Python 3.12。在仓库根目录运行：

```sh
python -m mvp.devtools.demo
```

工作台运行在本机，演示资料在启动时导入临时库。程序会打印本轮可直接粘贴的整理草稿和证据卡所在目录，关闭后下次可以重新开始。端口冲突时加 `--port 4976`。用 `python -m mvp.devtools.demo --check` 可验证接口和样例后退出。

## 从需求到证据

1. [打开工作台](http://127.0.0.1:4974/)，选择「社区活动报名工具」。把日期轨滚到 11 月 10 日和 12 日，看需求形成和验收记录。到 11 月 11 日切换「街区展览导览页」，看另一个项目的起点。
2. 打开已保存项目回顾，展开逐字出处。自己整理一轮时，复制工作台生成的完整指令，用[项目整理 Skill](../docs/agent/knot-project-review/SKILL.md)和[短启动词](../docs/agent/knot-project-review/短启动词.md)交给 Agent。也可以粘贴启动时生成的 `review-signup.json`，查看检查与保存流程。
3. 在「为这条需求生成项目证据」填入需求「社区活动报名工具 · 分场次统计」、交付物「场次报名汇总 CSV」、验收要求「按场次分别累计确认人数和候补人数，缺项填 0」。标为样例，用生成的 `evidence-draft.json` 起草，展开原文、选择可分享的摘录并复制证据卡。
4. 对照 [证据卡样例](evidence-card.md)、[开发记录](signup-development.md)、[报名输入](signup-input.csv)和[汇总 CSV](signup-summary.csv)核对产物。期待上午场确认 3 人、候补 1 人，下午场确认 2 人、候补 0 人。

## 把项目带到下一个窗口

在「社区活动报名工具」打开「生成续接包」，勾选开发记录，点「预览续接包」。核对完成事项、卡点、下一步和所选原文，再复制到另一个 Agent 窗口或下载 Markdown。演示启动时也会生成同样的 `continuation-signup.md`。

## 从多项目贡献到需求推荐

[打开能力回顾](http://127.0.0.1:4974/demo/capabilities/)，切换回顾截至阶段。能力标签根据不同项目的已核贡献记录汇总。展开「代表案例」能看到原句、来源和证据层级。需求卡按必需能力的证据覆盖匹配，同时列出试做和未验证条件。页面也可以直接从源码目录打开 [index.html](capabilities/index.html)。

[能力回顾 Skill](../docs/agent/knot-capability-review/SKILL.md) 说明如何把不同 Agent 窗口的证据整理成待核贡献记录。当前演示使用三组独立合成案例和两个模拟宿主展示汇总及匹配。实际宿主自动导入和需求平台接入是后续工作。

所有项目、记录和联系方式字段均使用公开合成数据。工作台项目样例见 [projects.json](projects.json)，能力样例内嵌在演示页面。
