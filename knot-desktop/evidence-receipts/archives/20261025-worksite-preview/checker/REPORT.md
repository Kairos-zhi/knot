# WORKSTATION-024 独立检查

结论：`ACCEPT_SHARED_WORKSITE_PREVIEW_QUERY_LIMITED`。无阻断；仅接受源码、build 与隔离服务契约。

冻结 manifest `3193b6c5...4f85a4c7` 一致，登记 6/6 项（4 项产品/测试、2 项日志/报告）匹配。独立使用官方 bundled Node 执行 build，退出 0。聚焦测试 32/32：Maker 新专项 7、既有相关 22、Checker 自有 3；0 fail/skip。未重跑全量。

自有检查使用 synthetic 状态和 handler 替身，覆盖冻结输入、嵌套 provenance 对象无别名、编码斜杠与字面 `%2F` 身份同时存在且不混淆、单次 read 的 seq、畸形 UTF8、近似/多路径、OPTIONS 等方法拒绝、未认证坏编码也先于读取。Maker 测试另覆盖真实隔离 HTTP、旧 store 持久字节/事件、Host/Origin/远端、有限前缀注册清理和相关旧协议回归。

人类可维护性通过：纯函数只负责供给投影，KontStore.preview 委派，协议层负责认证、路径、方法及序号 envelope。名称是业务词，普通显式循环与路由流程；没有通用路由器、DSL、隐式注册表、第二份状态或命令总线。输入前提是已验证 store snapshot，不重新铺一套 schema 验证。悬空供给引用明确 INVALID_STORE，避免静默丢材料；旧形状、NOT_FOUND/404、getBlocks fallback、checked 顺序与 excluded 语义保持。保留既有线性查询，当前窄契约不需要额外索引。未来客户端可以直接消费同一 GET 接点，无需复制供给语义。

包装明确未覆盖：历史 Desktop candidate 工具仍固定旧 25 项 inventory，不含新模块。虽然 package.files 包含 src，也不能据此声称新的目录候选已可部署。下一张打包任务需版本化 inventory，继续支持验证旧 25 项冻结候选，不改写旧证据。本卡没有生成新 Desktop 候选或更新在用软件。

未访问生产数据、模型、凭据或 Session，未执行桌面启停/安装、系统设置、commit/push/merge。人的正式 Apple 体验、完整 Run 和完整产品均未验收。细节见 final-review.json 与 focused.tap。

根补充的 docs/api/worksite-preview.md 与 README 接口行已只读复核，职责、单快照、一次编码、认证/错误、无副作用和旧 25 项打包边界均符合实际；未增加依赖、框架或平行 store。纯供给预览仍与 Run 输入编译/执行职责分开。本次文档检查不需重复测试。
