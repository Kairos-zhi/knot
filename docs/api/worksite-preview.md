# 现场供给预览

供正式工作站与Agent读取同一个现场的当前供给。024服务查询、026客户端消费和027阅读组件已独立限定接受；尚未生成真实checkout正式新桌面候选或部署。服务范围见[024任务卡](../tasks/KONT-WORKSTATION-024.md)。

## 入口与返回

`GET /kont/worksites/<worksiteId>/preview`

客户端对完整worksiteId执行一次`encodeURIComponent`，再放入这一个路径段；服务端匹配路径后只解码一次。编码后的斜杠属于身份，不成为新的路径层级。

```json
{
  "ok": true,
  "seq": 17,
  "preview": {
    "worksiteId": "example-worksite",
    "draft": "这次要推进的问题",
    "materials": [
      { "id": "example-asset", "title": "材料标题", "summary": "摘要", "blocks": [] }
    ]
  }
}
```

这是结构示意，实际blocks保留既有块内容、来源与metadata，不会因为预览而裁掉来路。材料按现场checkedIds的顺序排列，排除excludedIds；未选、建议项及只供给其他现场的材料不会自动加入。

seq和preview来自同一次store.read，描述同一时刻的状态；它们不锁定此后的编辑，也不构成模型请求的授权或输入冻结。空供给返回空materials。

## 维护位置

- `packages/dsh-plugin/src/worksite-preview.mjs`的`createWorksitePreview(state, worksiteId)`负责业务投影，输入前提是KontStore已验证的状态。输出深复制，修改返回对象不能改动输入。
- `KontStore.preview(worksiteId)`保留既有返回形状，只读取一次状态后委派该函数。
- `createProtocolHandler`负责认证、路径/方法、一次读取和HTTP信封；业务选择规则不复制到路由中。

纯函数不负责读文件、写状态、鉴权或执行。以后修改预览规则时维护这一处，并分别检查旧store调用与HTTP返回的兼容性。Run请求还包含自己的来源/请求核准，不在本卡强行合并。

## 错误与副作用

沿用现有浏览器Connection或受限Agent认证与Host/Origin规则，未经认证不读取store。只接受GET；其他方法返回405和`Allow: GET`。

坏编码为400/`INVALID_WORKSITE_ID`；路径形状不符或现场不存在为404/`NOT_FOUND`；已选材料引用不存在时为503/`INVALID_STORE`，不悄悄丢弃材料。查询不写持久文件、不发业务事件，不改变选择、排除或当前焦点。

行为测试在`tests/worksite-preview.test.mjs`，并回归原kernel、worksite、protocol、protocol-equivalence与run-query。程序化服务检查不替代人的界面体验验收。

## 后续桌面接入

026客户端源码已让原“查看本轮供给”动作消费此契约，保存/切换仍走原操作内核；正式Apple工作站整体未交付，正在运行的桌面软件也未更新。

客户端维护入口位于client.cjs的具名invalidatePreview/loadWorksitePreview：前者清空临时预览并取消请求，后者在必要的草稿保存成功后发一次同源GET。供给筛选只由服务端投影负责，编辑用的材料勾选仍走原命令。

客户端只显示与当前活动现场、草稿及workspace seq完全一致的响应。较旧或较新seq都提示先刷新核对；没有本地材料筛选回退、自动重试或模型动作。切换、刷新、写入开始、草稿编辑、组件/插件卸载使结果失效；即使请求忽略取消，迟到成功/失败也不能覆盖新状态。保存中追加的草稿不会被旧保存回执删除，已失效的预览动作也不会在保存后另发GET。

预览等待和失败不保留旧正文，错误使用固定可读提示。相关检查使用实际build后factory、组件回调与hook语义，不代表ReactDOM、视觉或人的体验已验收。单次预览仍不是Run输入冻结或付费请求许可。

027将阅读呈现提为client.cjs导出的纯组件SupplyPreviewPanel，由Workstation传入worksiteId、preview、loading、error。它只展示服务返回的材料，不取数、不维护请求状态、不执行命令；供给权限和选择规则仍由服务负责。等待、错误、身份不符或不可读数据均不展示旧正文。

阅读区显示材料数量、草稿、标题与摘要。原生details默认收起，展开“查看原文与来源”后显示完整块正文、人工／生成标签及历史来源记录条数；内部标识不作为阅读标签。来源记录仅供追溯，不成为额外供给，也不触发其他资产读取。空块如实提示，无效块显示固定错误；所有正文以React文本节点呈现。相关测试见tests/supply-preview-panel.test.mjs，程序化组件检查不代表浏览器布局或人的体验接受。

024收口时，旧014目录候选工具固定25文件且兼任旧候选验证，新模块未纳入该专用清单。

025增量将新制备格式升级为v2/26文件，同时保留旧v1/25验证；范围与维护位置见[目录候选格式](desktop-candidate-formats.md)。新模块已在隔离fixture候选中验证，真实checkout的正式新候选和在用桌面部署仍未完成；常规package.files包含src/也不代替这些步骤。
