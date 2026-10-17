> 历史研究归档 · 来源 H07 · 整理入库 2026-10-18。
> 本文保留原论证与原日期；“当前／已完成／待办”指原文时点，厂商价格、指标、竞品判断与推断未在本轮重新全面核验。
> 本机路径和内部链接已归一，图片及内部运行明细未迁入。现行入口：[文档地图](../../../README.md)；来源与变换：[登记](../../../history/sources.md)。

---

# knot 无障碍对标 Apple 调研报告

> Seeker | 2026-08-30 | 服务于 knot 语义空间 A2A 工作站
> 一手源：Apple 官方（developer.apple.com / support.apple.com）、W3C WCAG 2.2
> 双源核对：关键参数（对比度 4.5:1 / 焦点环 2px / 动效降级触发）均有 Apple + WCAG 双源

---

## 一、Apple 无障碍设计原则：Accessibility by Design

Apple 的核心思路——**无障碍是默认状态，不是附加模式**。系统级功能随设备出厂即用，应用只需响应系统设置，无需自建一套。

| 维度 | Apple 做法 | knot 现状 |
|------|-----------|-----------|
| 设计起点 | HIG 把 Accessibility 列为 Foundations 一级章节，与 Color/Typography/Layout 平级 | 设计规范 v1 包含键盘操作表，但无障碍未作为一级原则 |
| 系统级开关 | Reduce Motion / Increase Contrast / Dynamic Type / Full Keyboard Access / VoiceOver 均为系统全局设置，应用自动响应 | 暂无系统偏好检测 |
| 默认可用 | 系统组件自带无障碍属性（标签、焦点、动效降级），自定义组件需补全 | 红绿灯/渗透圈/焦点按钮等自定义交互需单独适配 |
| 辅助技术一致性 | VoiceOver 做好了，Voice Control / Switch Control / Hover Text 自动受益 | AGENT_FRIENDLY 数据层可复用同一棵可访问性树 |

**关键洞察**：Apple 把"无障碍树"视为系统的公共接口——人用 VoiceOver 读、Voice Control 说、Switch Control 切，都走同一棵 accessibility tree。knot 的 AGENT_FRIENDLY（原生感知/原生调度）恰好是同构设计：**可访问性树 = agent 感知接口 = 人类辅助技术接口**，三端共享。

> 来源：[Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[Apple Accessibility 首页](https://www.apple.com/accessibility)、[VoiceOver 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria)

---

## 二、Reduce Motion 规范（动效降级）

### 2.1 Apple 触发条件与机制

- **系统级开关**：设置 → 辅助功能 → 动效 → 减少动态效果（Reduce Motion）
- **二级开关**：减少动态效果开启后，可额外开启"偏好渐隐过渡"（Prefer Cross-Fade Transitions），将侧滑等过渡替换为溶解/渐隐
- **应用责任**：检测系统 `prefers-reduced-motion`（Web）/ `UIAccessibility.isReduceMotionEnabled`（iOS）/ `NSWorkspace.accessibilityDisplayShouldReduceMotion`（macOS），自动降级，无需用户在应用内二次设置

### 2.2 必须降级的动效类型（Apple 评估标准）

| 动效类型 | 降级要求 |
|---------|---------|
| 深度模拟（视差、动画模糊、景深） | 禁用或替换 |
| 多轴运动 / 多速运动 / 旋转 / 旋涡 | 禁用或替换 |
| 自动轮播 / 持续运动 | 停止或提供停止控制 |
| 缩放 / 弹性 / 弹跳过渡 | 替换为渐隐或静态切换 |
| 大面积外周视觉运动 | 降低速度与强度 |
| 自动播放视频 / GIF | 默认静态预览 + 手动播放 |

### 2.3 knot 动效降级对照表

| knot 动效 | 默认行为 | Reduce Motion 降级 | Prefer Cross-Fade 再降级 |
|----------|---------|-------------------|------------------------|
| 渗透圈（波纹扩散） | 环形向外扩散 + 透明度衰减 | 替换为单次淡入淡出（opacity 0→1→0，≤0.3s，无缩放） | 直接显示最终状态，无过渡 |
| 红绿灯状态机 | 颜色过渡 + 微缩放 | 颜色硬切或极短淡入（≤0.15s），移除缩放 | 状态直接切换，无动画 |
| 焦点按钮组（悬停/选中） | 光晕扩散 + 位移 | 保留 2px 焦点环，移除光晕与位移 | 仅焦点环可见 |
| 结的展开/收起 | 缩放 + 旋转 + 位移 | 替换为透明度淡入淡出（≤0.25s） | 直接显示/隐藏 |
| 绳的连接动画 | 路径描绘动画（stroke-dashoffset） | 直接显示完整路径，无描绘动画 | — |
| 卡片出现/消失 | 缓动位移 + 缩放 | 淡入淡出（opacity 0→1，≤0.2s） | 无过渡 |

> 降级原则（Apple 明确）：**不要把所有动画一刀切关掉**——好的动效承载信息，过度移除会让界面更难理解。应逐项判断：是否属于高风险类型？移除后信息是否仍清晰？
>
> 来源：[Reduced Motion 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)、[Customize onscreen motion on iPhone](https://support.apple.com/en-am/guide/iphone/iph0b691d3ed/ios)、[HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)、WWDC19 Session 244

---

## 三、键盘全覆盖与焦点管理

### 3.1 macOS 全键盘访问（Full Keyboard Access）

Apple 提供两级键盘导航：
1. **键盘导航**（系统设置 → 键盘 → 快捷键 → "使用键盘导航在控制间移动焦点"）：Tab 键在文本框/列表/按钮间移动
2. **全键盘访问**（辅助功能 → 键盘 → 全键盘访问）：Tab 可聚焦到几乎所有 UI 元素，包括菜单栏、窗口控制按钮、侧边栏项等；用高亮框（highlighter）标记当前焦点，可自定义颜色、粗细、高对比度、自动隐藏时间

### 3.2 焦点环设计参数

| 参数 | Apple / WCAG 标准 |
|------|------------------|
| 焦点可见性（AA） | WCAG 2.4.7：所有键盘可操作组件必须有可见焦点指示 |
| 焦点外观最小面积（AAA） | WCAG 2.4.13：≥ 2 CSS 像素厚的周长面积 |
| 焦点环对比度（AAA） | WCAG 2.4.13：聚焦态与未聚焦态同一像素位置对比度 ≥ 3:1 |
| 非文本对比度（AA） | WCAG 1.4.11：UI 组件（含焦点环）与相邻背景对比度 ≥ 3:1 |
| 焦点不被遮挡（AA，WCAG 2.2 新增） | 2.4.11：组件获得焦点时，不应被作者创建的内容完全遮挡 |
| macOS 系统焦点环 | 蓝色光晕（Halo Effect），可在系统设置中自定义颜色/粗细 |
| 命中区域 | Apple HIG：可交互元素最小 44×44 pt |

### 3.3 knot 六态/手势的键盘等价物

| 交互态 | 手势/鼠标 | 键盘等价 | 焦点指示 |
|--------|----------|---------|---------|
| 默认（Rest） | — | Tab 序列中的下一项 | 无 |
| 悬停（Hover） | 鼠标移入 | 聚焦（focus） | 2px 焦点环 + 微高亮 |
| 按下（Press） | 鼠标按下 | Space / Enter 按下 | 焦点环收缩/颜色加深 |
| 激活（Active） | 点击释放 | Space / Enter 释放 | 状态切换反馈（见动效降级表） |
| 选中（Selected） | — | 保持焦点 + 选中态 | 焦点环 + 选中标记（形状/图案，不依赖颜色） |
| 禁用（Disabled） | 无响应 | Tab 跳过（或聚焦但不可激活） | 降透明度 / 灰度 |

**knot 键盘全覆盖清单**：
- Tab / Shift+Tab：在结、绳、卡片、工具栏间线性遍历（逻辑顺序 = 视觉阅读顺序）
- 方向键：在同一组内（如焦点按钮组、结的相邻节点）移动焦点
- Space / Enter：激活当前焦点项
- Esc：退出当前模式/关闭弹窗/取消拖拽
- ?：显示键盘快捷键总览
- 所有自定义交互（渗透圈点击、绳的连接操作、卡片展开）必须有键盘等价路径

> 来源：[Focus and selection - Apple HIG](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection)、[WCAG 2.2 2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible)、[WCAG 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)、[Macworld: Full Keyboard Access](https://www.macworld.com/article/351823/macos-monterey-full-keyboard-access-accessiblity-navigation-hardware-viewer-how-to.html)

---

## 四、VoiceOver 与可访问性树（语义层）

### 4.1 Apple VoiceOver 核心规则

1. **能点就能读**：所有可点击/拖拽/交互的元素，VoiceOver 必须能聚焦、能读出、能激活
2. **标签简洁准确**：按钮/图标/表单控件必须有 `accessibilityLabel`，简短且脱离上下文仍有意义（不用"点击这里""了解更多"）
3. **不冗余**：标签不包含控件类型（如不说"复选框 复选框"），类型由 trait/role 承担
4. **分组有意义**：相关元素组合成容器，VoiceOver 按容器导航，减少按键次数
5. **焦点跟随内容**：弹窗/新内容出现时，VoiceOver 光标应逻辑地移入新内容区；不可聚焦到不可见/屏外内容
6. **状态可读**：选中/禁用/展开等状态通过 accessibilityValue / accessibilityState / trait 表达

### 4.2 knot 核心元素的语义标签设计

knot 的三个核心元语——**结、绳、卡片**——需要在可访问性树中正确建模。这棵树同时服务于：人类 VoiceOver 用户、Voice Control 语音指令、Switch Control 切换控制、以及 knot 的 AGENT_FRIENDLY agent 原生感知。

| knot 元素 | 语义角色（Role） | Label 格式 | Value/State | Hint |
|----------|----------------|-----------|------------|------|
| 结（Knot） | `group` / `landmark`（主结） | "{结标题}，结，含 {N} 条绳" | 展开/收起；选中态 | "按回车展开，方向键导航绳" |
| 绳（Rope/Connection） | `link` 或自定义 `connection` | "绳，连接 {源结名} 与 {目标结名}" | 激活态/弱化态 | "按回车跳转至对端" |
| 卡片（Card） | `article` / `document` | "{卡片标题}，卡片，{类型}" | 选中/未选中；展开/收起 | "按空格展开详情" |
| 焦点按钮组 | `toolbar` / `radiogroup` | "{组名}，{N} 个选项，当前选中 {当前项}" | — | "方向键切换，空格确认" |
| 红绿灯状态指示器 | `status` | "状态：{红/黄/绿}，{状态含义}" | 红/黄/绿 | — |
| 渗透圈交互区 | `button` | "{动作名}，渗透触发按钮" | 可用/禁用 | "按空格触发渗透" |
| 画布空白区 | `application` 或忽略 | "knot 画布，{结数} 个结，{绳数} 条连接" | — | "按 ? 查看快捷键" |

**关键设计决策**：绳（Rope）作为连接关系，在视觉上是线，在语义树上应表达为**两个结之间的可达关系**，而不是独立的装饰元素。VoiceOver 用户和 agent 都需要知道"从这里能到哪里"。

> 来源：[VoiceOver 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria)、[Supporting VoiceOver in your app](https://developer.apple.com/documentation/uikit/supporting-voiceover-in-your-app)、[SwiftUI Accessibility modifiers](https://developer.apple.com/documentation/SwiftUI/View-Accessibility)、WWDC25 Session 229

---

## 五、Dynamic Type 与对比度（低密度审美的可读性底线）

### 5.1 对比度标准（双源一致）

| 元素类型 | WCAG AA 最低 | Apple 评估标准 | 备注 |
|---------|-------------|---------------|------|
| 普通文本（<18pt 或 <14pt 粗体） | 4.5:1 | 4.5:1 | 正文、标签 |
| 大文本（≥18pt 或 ≥14pt 粗体） | 3:1 | 3:1 | 标题 |
| 非文本 UI 组件（图标/焦点环/选中态） | 3:1 | 3:1 | 按钮边框、勾选标记 |
| 禁用态文本 | 不要求 | 不要求 | 但需有其他禁用标识 |

**对 knot 低密度审美的约束**：之的审美方向是低信息密度、疏离、克制。但"低信息密度 ≠ 低对比度"。Apple 的做法是——**用留白实现低密度，用充足对比度保证可读性**。减少元素数量可以，降低文字/关键控件的对比度不行。

### 5.2 Dynamic Type / 文字缩放

- Apple 要求：正文文本至少可放大到 200%（Dynamic Type AX3 级别），最大可到 300%+（AX5）
- 测试维度：小号/默认/大号/特大无障碍字号，文字不截断、不重叠、信息层级不丢
- 图标等比例缩放：有意义的图标（不只是装饰）应随文字一起放大

### 5.3 颜色独立性

- Apple 评估标准：**Differentiate Without Color Alone**（不靠颜色单独区分）
- 对 knot 的影响：红绿灯状态机不能只有颜色差异——必须同时有形状、图案、位置或文字标签的差异（红/黄/绿三态配合形状/位置区分）

> 来源：[Sufficient Contrast 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/sufficient-contrast-evaluation-criteria)、[Larger Text 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria)、[HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、WCAG 2.2 1.4.3 / 1.4.4 / 1.4.11

---

## 六、knot 无障碍对标建议（优先级排序）

### P0：系统偏好检测 + 动效降级（最快见效、最高影响）

1. **全局读取 `prefers-reduced-motion`**（Web）/ 系统等效 API，作为动效系统的总开关
2. **渗透圈、焦点按钮光晕、结展开缩放**三项必须有 Reduce Motion 降级路径（参照 2.3 表）
3. 支持二级降级：`prefers-reduced-motion: reduce` + 自定义"偏好渐隐"选项，将所有过渡替换为 opacity 淡入淡出
4. **动效降级不丢失信息**——Apple 明确反对一刀切关掉所有动画，只移除高风险类型（缩放/旋转/视差/外周运动）

### P0：可访问性树 = AGENT_FRIENDLY 数据层（架构级决策）

1. 将"结/绳/卡片"的语义模型（role + label + state + value）作为**一等数据结构**，不是 UI 附属品
2. 这棵树同时服务三个消费者：VoiceOver 等辅助技术、agent 原生感知（AGENT_FRIENDLY）、键盘导航逻辑
3. 参照 4.2 表定义每个 knot 元语的 accessibility 契约，纳入设计规范 v2
4. **绳的语义化**是 knot 特有问题：连接关系必须在语义树上可遍历，不能只是视觉装饰

### P1：键盘全覆盖 + 焦点环

1. Tab 顺序 = 语义逻辑顺序（不是 DOM 顺序，也不是纯视觉顺序）
2. 自定义焦点环：2px 粗实线，与背景对比度 ≥ 3:1，提供 4px 粗的"增强"选项
3. 所有手势/鼠标交互有键盘等价路径（方向键组内导航、Space/Enter 激活、Esc 退出）
4. 焦点不被遮挡：弹窗/浮层出现时，焦点自动移入，且不被其他 UI 元素盖住
5. 最小命中区域 44×44 pt（适配触控和辅助点击）

### P2：对比度 + 文字缩放 + 颜色独立性

1. 所有正文文本对比度 ≥ 4.5:1（AA），作为设计系统的硬性门禁
2. 红绿灯状态增加形状/位置/图案区分，不只靠颜色（满足 Differentiate Without Color）
3. 设计文本缩放阶梯（至少 100% → 150% → 200% 三档），低密度布局在大字下不崩塌
4. 提供 Increase Contrast 模式（更高对比度的配色方案）

### P3：辅助技术测试流程

1. 设计评审阶段加入"无障碍自问清单"（标签是否脱离上下文可读？动效是否降级？键盘能否走完主流程？）
2. 用 VoiceOver + 键盘走一遍核心任务（创建结 → 连绳 → 展开卡片 → 切换视图）
3. 对标 Apple 评估标准的 6 项核心：VoiceOver / Reduce Motion / Sufficient Contrast / Larger Text / Differentiate Without Color / Voice Control

---

## 参考来源

| # | 来源 | 类型 | 获取时间 |
|---|------|------|---------|
| 1 | [Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 一手 | 2026-08-30 |
| 2 | [Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | 一手 | 2026-08-30 |
| 3 | [Apple HIG Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) | 一手 | 2026-08-30 |
| 4 | [Reduced Motion 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria) | 一手 | 2026-08-30 |
| 5 | [VoiceOver 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria) | 一手 | 2026-08-30 |
| 6 | [Sufficient Contrast 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/sufficient-contrast-evaluation-criteria) | 一手 | 2026-08-30 |
| 7 | [Larger Text 评估标准](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria) | 一手 | 2026-08-30 |
| 8 | [Apple Support: Customize onscreen motion](https://support.apple.com/en-am/guide/iphone/iph0b691d3ed/ios) | 一手 | 2026-08-30 |
| 9 | [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22) | 一手 | 2026-08-30 |
| 10 | [WCAG Understanding Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) | 一手 | 2026-08-30 |
| 11 | [Supporting VoiceOver (Apple Developer)](https://developer.apple.com/documentation/uikit/supporting-voiceover-in-your-app) | 一手 | 2026-08-30 |
| 12 | WWDC19 Session 244 "Visual Design and Accessibility" | 一手 | 2026-08-30 |
| 13 | WWDC25 Session 229 "Make your Mac app more accessible" | 一手 | 2026-08-30 |

---

*全文约 2900 字 | Seeker 出品 | 8/30*
