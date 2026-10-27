# KONT-RUN-013 · 现场运行状态呈现

授权：2026-10-24之“继续推进”，沿用子agent并行开发。基线423fe42；只接只读工作站状态，不新增模型请求／在用Desktop部署。

既查：开发基准、RUN-012工作站接入说明与现client/build；复用唯一store的Run查询/seq、既有中文viewmodel与对象身份。B沿用现设计与Apple工作在前、同对象连续性／渐进披露，不另定色彩或扩写旧编辑表单。人的体验仍需之后过手，程序化检查不能称UI验收。

A线：client与bundle接入、只读请求controller。GET /kont/runs，same-origin；手动及现场切换刷新，取消／卸载／乱序响应与错误隔离，window/card/icon共用同源状态。build内置现viewmodel与B组件，不要求Host加载不存在的相对模块。不增加执行或写入能力。

B线：独立RunStatusPanel CJS及样式／测试。固定props={runs,worksiteId,assets,loading,error,onRefresh,onLocate}，导出RunStatusPanel，内部require('react')与require('@kont/run-status-view')；仅当前现场。已提交不冒称运行，待核对不诱导重发；错误／loading不显示旧状态，空与非法DTO诚实呈现。目标／块存在才启用定位，引用由当前kernel snapshot再解析。定位只在当前工作旁显示只读产物，切换现场／引用失效不能继续显示旧正文。

分文件：A=client/build/source-controller/tests；B=panel/CSS/tests；根=卡／状态／README。Maker自测→独立Checker核真实bundle与controller/panel组合→Gate→一次本地提交。聚焦受影响测试，不截图／模拟点击、不全量重复、不改vendor／历史证据／profile／ASAR。证据根evidence/local/20261024-run-panel，archive_id=kont-run-panel-20261024。

七格收口：目标＝当前现场只读状态呈现；回收＝两Maker冻结及独立Checker完成；证据＝evidence/RUN-013-INDEX.json、X/checker/final-review.json；验收＝ACCEPT_READONLY_RUN_PANEL_LIMITED，无剩余阻断，16冻结项一致、独立build、focused11/11与实际bundle factory组合1/1，未全量；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，无模型／在用部署／push／合并；未决＝检查为语义树／hooks seam和factory程序化组合，不等于实际ReactDOM／视觉或人的体验。冻结前已修workspace刷新等待／失败显示旧记录和定位正文的问题。未扩旧编辑表单；产物缺失保留历史记录、不重建、不付费重发。
