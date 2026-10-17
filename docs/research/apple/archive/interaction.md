> 历史研究归档 · 来源 H03 · 整理入库 2026-10-18。
> 本文保留原论证与原日期；“当前／已完成／待办”指原文时点，厂商价格、指标、竞品判断与推断未在本轮重新全面核验。
> 本机路径和内部链接已归一，图片及内部运行明细未迁入。现行入口：[文档地图](../../../README.md)；来源与变换：[登记](../../../history/sources.md)。

---

# knot 交互实现对标 Apple HIG 调研

**调研者**：Seeker · **项目**：knot（语义空间 A2A 工作站）  
**时间**：2026-08-30 · **方法**：Tavily Extract advanced 直抓 Apple HIG + 搜索交叉验证  
**一手源**：
- HIG Motion — https://developer.apple.com/design/human-interface-guidelines/motion
- HIG Windows — https://developer.apple.com/design/human-interface-guidelines/windows
- HIG Materials — https://developer.apple.com/design/human-interface-guidelines/materials
- HIG Accessibility — https://developer.apple.com/design/human-interface-guidelines/accessibility
- SwiftUI Animation — https://developer.apple.com/documentation/swiftui/animation
- WWDC23 "Animate with springs"（session 10158）

---

## 一、最有价值的三个对标结论

1. **动效底层切 spring，不用 cubic-bezier**。Apple 自 iOS 17/macOS Sonoma 起全线用 `duration + bounce` 双参数弹簧模型（smooth / snappy / bouncy 三档），knot 的焦点按钮、渗透圈、卡片展开收起应对齐这套预设。`smooth(duration: 0.5)` 是系统默认质感。

2. **红绿灯语义对齐 mac 即可，不要硬套像素尺寸**。HIG 明确红=关闭、黄=最小化、绿=全屏/缩放（Option 点击切换 zoom），失活态统一变灰——但**官方未公布精确尺寸**（12px/8px 是社区测量，非规范）。knot 黄灯已反转（=收起 mini）是正确决策。

3. **Dock 放大镜是"渗透/吸附"最佳先例，但官方不给参数**。HIG 只描述行为不公开放大倍数/触发距离/曲线。社区复现的算法骨架是"指针到中心距离线性衰减缩放 + 弹簧"，knot 渗透圈可借鉴，参数用系统 spring 预设自行标定。

---

## 二、HIG Motion 核心原则与动效 Token

### 2.1 设计原则（一手：HIG Motion）
- 有目的，不为动而动；过度动画会造成分心与生理不适
- 动效必须可替代（不能作为唯一信息通道），配合触觉/音频
- 反馈动画要跟随手势预期、简短精确、可打断
- 频繁交互的元素避免额外动效

### 2.2 弹簧动画体系（一手：SwiftUI Animation + WWDC23 10158）

Apple 2023 年推出 duration+bounce 双参数模型，取代了 response/dampingFraction 工程参数。三档预设：

| 预设 | 默认时长 | 回弹 | 适用场景 |
|---|---|---|---|
| `.smooth` | 0.5 s | 无（临界阻尼） | 内容切换、展开收起、位移 |
| `.snappy` | 0.5 s | 微量过冲 | 按钮反馈、开关、状态切换 |
| `.bouncy` | 0.5 s | 明显回弹 | 强调动画、表情反应 |

经典参数（仍可用）：`.spring(response: 0.55, dampingFraction: 0.825)` 默认；`.interactiveSpring(response: 0.15, dampingFraction: 0.86)` 手势即时响应。

### 2.3 动效 Token 清单（knot 可直接落地）

**弹簧预设**
```
motion.spring.smooth  = { duration: 0.5, bounce: 0.0 }
motion.spring.snappy  = { duration: 0.5, bounce: 0.15 }
motion.spring.bouncy  = { duration: 0.5, bounce: 0.4 }
```
注：bounce 为 SwiftUI `extraBounce` 语义近似，CSS/JS 实现需用 spring physics 引擎换算。

**时长尺度**
| Token | 时长 | 用途 |
|---|---|---|
| `motion.duration.fast` | 150 ms | 微反馈（hover 提亮、按钮按下） |
| `motion.duration.base` | 300 ms | 基础过渡（状态切换、颜色变化） |
| `motion.duration.slow` | 500 ms | 展开收起、焦点切换 |
| `motion.duration.emphasis` | 800 ms | 进入/退出、重大变化 |

**缓动曲线**（仅非弹簧属性用，如颜色/透明度）
```
motion.ease.standard = cubic-bezier(0.4, 0.0, 0.2, 1)
motion.ease.enter    = cubic-bezier(0.0, 0.0, 0.2, 1)
motion.ease.exit     = cubic-bezier(0.4, 0.0, 1, 1)
```

**Reduce Motion 变体**（一手：HIG Accessibility）
- 所有 spring 回弹归零（tightening springs to reduce bounce）
- 禁用自动/重复动画（脉冲、涟漪、自动滚动）
- 用淡入淡出替代位移
- 检测 `prefers-reduced-motion`

---

## 三、红绿灯对标建议（knot 卡片三态）

### 3.1 一手规范要点（HIG Windows）
- 名称：Close / Minimize / Zoom（系统枚举 `NSWindow.ButtonType`）
- 颜色：key window 彩色；inactive 窗口灰色（失去 vibrancy，视觉更远）
- 绿键：默认全屏；**Option 点击 = Zoom**（智能缩放，不进全屏）；长按弹出布局菜单
- hover 显示符号：× − +
- VoiceOver 标签：Close button / Minimize button / Zoom button

> **尺寸**：官方 HIG **未找到**精确像素/点尺寸。12px 圆点、8px 间距等均为社区测量/AppKit 反编译值，非规范。规范层面只要求用 `NSWindow.standardWindowButton(_:)` 保留原生行为。

### 3.2 knot 落地参数表

| 维度 | Apple 规范 | knot 建议 | 说明 |
|---|---|---|---|
| 排列顺序 | 红·黄·绿（左→右） | 红·黄·绿 | 与 mac 直觉一致 |
| 形状 | 圆形 | 圆形 | — |
| 激活色 | 红/黄/绿（官方无具体色值） | 采 macOS 截图实测：#FF5F57 / #FEBC2E / #28C840 | 社区测量近似值 |
| 失活态 | 灰色三圆（去饱和） | 灰色三圆 | HIG 明确规定 |
| hover 符号 | × − +（整体 hover 同时出现） | × 关闭链接 / − 收起 mini / + 展开变形 | 语义已对齐 |
| 点击行为 | 红=关 / 黄=最小化 / 绿=全屏 | 红=关闭卡片链接 / 黄=收起为 mini / 绿=展开变形 | 语义已对齐 |
| Option+绿 | 切换为 Zoom（智能缩放） | Option+绿 = 切换到"最佳展开尺寸"而非全展开 | 继承肌肉记忆 |
| 可见尺寸 | 未找到 | 12–14 px（视觉直径） | 社区经验，可调 |
| **Hit target** | macOS 默认 28×28 pt / 最小 20×20 pt | **≥ 28×28 px** | HIG Accessibility 硬性要求 |
| VoiceOver | Close / Minimize / Zoom button | aria-label："关闭卡片"/"最小化"/"展开" | 无障碍必做 |

---

## 四、焦点按钮组（中心圈 + 加减 + 渗透圈）对标

### 4.1 中心圈形按钮
- 无直接一手先例，但遵循 Apple 圆形控件通用规则
- 桌面 hit target ≥ 28×28 pt；触控场景 44×44 pt（HIG Accessibility）
- 圆形用 continuous corner curve 近似（CSS `border-radius: 50%` 近似即可）

### 4.2 范围加减（+/− 控制渗透圈大小）

**Apple 缩放类交互先例**：Finder 缩放按钮、地图捏合、Dock 大小滑块。

建议：
- 加减按钮 28×28 pt（macOS 默认控件尺寸），圆角方或圆形
- 点击分段 + 长按连续调节（对齐 macOS 音量/亮度按钮行为）
- 同时支持滚轮/触控板捏合（手势优先，按钮辅助）
- 符号用 SF Symbols 风格 stroke 型 plus/minus（medium weight）

### 4.3 渗透圈（自动吸附）

**最佳先例：Dock Magnification**

HIG Dock 行为描述：指针靠近时图标放大、相邻图标带动形成波浪、离开后平滑回归；用户可开关及调尺寸。

> **官方参数未找到**。以下为社区逆向参考值（非官方）：
> - 默认放大倍数约 1.8x
> - 触发范围约 2–3 个图标宽度
> - 距离中心越近，放大比例线性增加
> - 动画曲线推断为弹簧

**knot 渗透圈参数建议**：

| 参数 | 建议值 | 对标依据 |
|---|---|---|
| 渗透圈基础半径 | 60–120 px（随画布缩放） | 类比 Dock 触发范围 |
| 吸附判定 | 卡片中心进入圈半径即触发 | 类比 Dock "中心距指针距离"判定 |
| 吸附动画 | `.smooth(duration: 0.35~0.5)` 弹簧 | Apple smooth 预设（内容级动效） |
| 吸附后视觉 | mini 态向展开态过渡一档 + 圈内扩散圆环脉冲 | 类比 Dock 放大 + 高亮 |
| 扩散脉冲 | 单圈向外扩散+淡出，0.6 s，ease-out | 对齐 macOS focus ring 扩散感 |
| 批量吸附顺序 | 由近及远依次触发，每卡延迟 30–50 ms | Apple 级联/涟漪风格 |
| Reduce Motion | 去掉扩散脉冲 + 弹簧归零回弹 | HIG Accessibility 明确要求 |

---

## 五、基础规范对齐

### 触控目标（一手：HIG Accessibility）

| 平台 | 默认 | 最小 |
|---|---|---|
| iOS/iPadOS | 44×44 pt | 28×28 pt |
| macOS | 28×28 pt | 20×20 pt |
| visionOS | 60×60 pt | 28×28 pt |

knot 桌面端：所有可交互元素 hit target ≥ 28×28 px。

### 间距阶梯（HIG Layout 体系）
4 pt 基准：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64。knot 沿用 4 px 基准。

### 圆角（Continuous Corner）
- Apple 用 continuous corner curve（连续曲率），大半径时比标准圆角更平滑
- CSS 仅近似；追求 1:1 需 SVG/mask
- knot 建议：mini 卡片 8 px、展开 12 px、悬浮选中 16 px（随尺寸递增）

### 材质（一手：HIG Materials）
- **Liquid Glass**：2025 新材质，控件/导航层专用，浮于内容之上，内容可透出 → knot 焦点按钮组、工具栏用此层级
- **Standard materials**：内容层内分级（ultraThin / thin / regular / thick 四档）→ knot 卡片不同层级对应不同厚度
- **Vibrancy**：材质前景自动调颜色保对比度 → knot 需做前景对比度自检

### 无障碍清单（必做）
1. `prefers-reduced-motion` 检测 + 弹簧收紧 + 关自动动画
2. VoiceOver aria-label（红绿灯、焦点按钮、加减）
3. Tab 键盘可达 + Enter/Space 触发
4. 清晰 focus ring
5. 文本对比度 ≥ 4.5:1（WCAG AA）
6. 所有动画可打断

---

## 六、未找到清单（诚实标注）

以下 Apple 官方一手文档中**未找到**精确数值，均为社区测量/逆向值，引用须谨慎：

1. macOS 红绿灯精确尺寸与间距（12px/8px = 社区测量）
2. Dock magnification 放大倍数、触发距离、动画曲线
3. spring 预设的精确 bounce 数值（0.15/0.4 = 社区测试）
4. 连续圆角（continuous corner）的数学公式（Apple 专利，不公开）
5. macOS 窗口圆角精确半径（社区测 12–14 px，非官方）

建议：以上先按经验值落地，标注"Apple 风格近似"，待测试迭代。

---

## 七、落地优先级

| 优先级 | 事项 | 依据 |
|---|---|---|
| P0 | 动效从 cubic-bezier 切 spring（三档预设） | Apple 全线切换，核心质感 |
| P0 | Reduce Motion 支持（检测 + 弹簧收紧 + 关自动动画） | HIG 硬性要求 |
| P0 | 所有可交互元素 hit target ≥ 28×28 px | HIG Accessibility |
| P1 | 红绿灯语义对齐 mac + Option 键变种 | 肌肉记忆复用 |
| P1 | 焦点按钮组 + 弹簧吸附渗透圈 | Dock 先例 + spring 体系 |
| P2 | 材质分层（Liquid Glass 控件层 + 标准材质内容层） | HIG Materials |
| P2 | 连续圆角近似 + 4 px 间距阶梯 | 视觉风格细节 |
| P3 | VoiceOver 全量标签 + 键盘全可达 | 无障碍完整性 |

---

*一手结论基于 Apple HIG 官方页面与 SwiftUI Developer Documentation 抓取（2026-08-30）。二手结论已明确标出。查不到的参数诚实写"未找到"，不编造。*
