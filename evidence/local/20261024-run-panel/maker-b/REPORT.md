# RUN013 Maker B

新增只读RunStatusPanel组件、独立CSS与程序化语义树测试，不改client/build/A文件，不扩旧表单。导出RunStatusPanel，props {runs,worksiteId,assets,loading=false,error='',onRefresh,onLocate}；仅消费既有八字段共享投影，内部调用@kont/run-status-view.createRunStatusView；无执行、取消、重发、计时、费用或工具权限。React由宿主提供。

既查沿用开发基准、RUN012接入说明及已读设计principles/system、Apple索引/iPadOS定调；本轮复读现client与style.css。采用当前现场、同一对象连续性与details/summary渐进披露；新增CSS只复用现灰绿/中性色、边框、间距、圆角和焦点样式，无新色系或动画。不得据本轮测试声称人的体验已接受。

只显示当前worksite记录与当前资产标题，不把run/request/session ID作标签；加载与查询失败遮住旧数据并用status/alert诚实提示。非法本现场DTO不降级prepared。完成记录只在当前asset/block存在时提供可用定位；缺失明确位置失效并保留完成记录，不自动恢复或重发。导航仅给onLocate引用，A宿主负责再次现时解析。标题只作React文本节点，错误提示固定不透传后端内容。

新测试4/4 exit0，仅程序化createElement语义树与回调契约验证，复用真实viewmodel，无浏览器、截图或模拟点击。覆盖现场隔离与可访问名称、加载/失败/空态/非法DTO、历史输出失效、标题作为text及uncertain禁止重发动作。未全量、未模型、未部署、未提交；待独立Checker与根Gate。
