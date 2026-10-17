> 历史研究归档 · 来源 H05 · 整理入库 2026-10-18。
> 本文保留原论证与原日期；“当前／已完成／待办”指原文时点，厂商价格、指标、竞品判断与推断未在本轮重新全面核验。
> 本机路径和内部链接已归一，图片及内部运行明细未迁入。现行入口：[文档地图](../../../README.md)；来源与变换：[登记](../../../history/sources.md)。

---

# knot 设计系统对标 Apple — 调研报告

> Seeker 产出 | 2026-08-30 | 一手源：developer.apple.com / HIG / UIKit 文档 | 二手校验：themeandcolor.com / noahgilmore.com / nutrient.io
> 获取时间：2026-08-30 17:58–18:05 (UTC+8)

---

## 1. Apple 设计语言的完整维度

Apple HIG Foundations 覆盖 **9 个核心层**，每一层有独立的规范文档：

| 层级 | HIG 文档入口 | 核心内容 |
|---|---|---|
| 布局 Layout | developer.apple.com/design/human-interface-guidelines/layout | 安全区、布局指南、网格、断点 |
| 颜色 Color | /color | 语义色、深浅模式、系统调色板 |
| 排版 Typography | /typography | SF 字体体系、字号阶梯、动态字体 |
| 材质 Materials | /materials | 毛玻璃分层、vibrancy、深浅适配 |
| 动效 Motion | /motion | 动画原则、时长、弹簧、可中断性 |
| SF Symbols | /sf-symbols | 图标网格、字重、渲染模式 |
| 声音与触觉 | /sound-and-haptics | 反馈层级、系统音效、触觉强度/锐度 |
| 无障碍 Accessibility | /accessibility | 动态字体、减弱动效、VoiceOver |
| 应用图标 App Icons | /app-icons | 圆角矩形模板、网格、适配 |

**设计原则层**（HIG Design Principles）：清晰（Clarity）、遵从（Deference）、深度（Depth）——界面服务内容、内容层级用景深/透明度表达。

---

## 2. 视觉层

### 2.1 SF 字体体系（iOS 默认尺寸）

| 文字样式 | 字重 | 字号 (pt) | 行高 (pt) | 强调字重 |
|---|---|---|---|---|
| Large Title | Regular | 34 | 41 | Bold |
| Title 1 | Regular | 28 | 34 | Semibold |
| Title 2 | Regular | 22 | 28 | Semibold |
| Title 3 | Regular | 20 | 25 | Semibold |
| Headline | Semibold | 17 | 22 | Semibold |
| Body | Regular | 17 | 22 | Semibold |
| Callout | Regular | 16 | 21 | Semibold |
| Subheadline | Regular | 15 | 20 | Semibold |
| Footnote | Regular | 13 | 18 | Semibold |
| Caption 1 | Regular | 12 | 16 | Semibold |
| Caption 2 | Regular | 11 | 13 | Semibold |

*来源：HIG Typography（visionOS AX3 大号表见 HIG 原文；以上为 iOS 默认尺寸）。二手校验：blakecrosley.com/blog/sf-pro-typography-system。*

- **字重 9 级**：Ultralight → Thin → Light → Regular → Medium → Semibold → Bold → Heavy → Black
- **光学尺寸**：SF Pro Text（≤19pt）/ SF Pro Display（≥20pt）；SF Pro Variable 后已过渡为连续轴（17-28pt 间渐变）
- **动态字体 (Dynamic Type)**：7 个标准档位（xSmall – xxxLarge）+ 5 个无障碍档位（AX1–AX5）；Body 从 14pt (xSmall) 到 28pt (AX1) 不等
- **Tracking**：12pt = 0；小于 12pt 正 tracking（疏松）；大于 12pt 负 tracking（紧凑）；17pt Body 约 -24/1000 em

### 2.2 颜色系统（语义色 + 深浅模式）

**背景层级（3 级分组背景 + 3 级内容背景）**：

| Token | 浅色 (Light) | 深色 (Dark) | 用途 |
|---|---|---|---|
| systemBackground | #FFFFFF | #000000 | 基础画布 |
| secondarySystemBackground | #F2F2F7 | #1C1C1E | 分组列表/卡片底 |
| tertiarySystemBackground | #FFFFFF | #2C2C2E | 卡片内分组 |
| systemGroupedBackground | #F2F2F7 | #000000 | 分组式页面底 |
| secondarySystemGrouped | #FFFFFF | #1C1C1E | 分组卡片 |
| tertiarySystemGrouped | #F2F2F7 | #2C2C2E | 卡片内嵌 |

**文本层级**：

| Token | 浅色 | 深色 |
|---|---|---|
| label | #000000 (1.0) | #FFFFFF (1.0) |
| secondaryLabel | #3C3C43 (60% α) | #EBEBF5 (60% α) |
| tertiaryLabel | #3C3C43 (30% α) | #EBEBF5 (30% α) |
| separator | #3C3C43 (29% α) | #545458 (60% α) |
| opaqueSeparator | #C6C6C8 | #38383A |

**系统主色**：

| Token | 浅色 | 深色 |
|---|---|---|
| systemBlue | #007AFF | #0A84FF |
| systemGreen | #34C759 | #30D158 |
| systemRed | #FF3B30 | #FF453A |
| systemOrange | #FF9500 | #FF9F0A |
| systemYellow | #FFCC00 | #FFD60A |
| systemPurple | #AF52DE | #BF5AF2 |
| systemIndigo | #5856D6 | #5E5CE6 |
| systemGray | #8E8E93 | #8E8E93 |
| systemGray2 | #AEAEB2 | #636366 |
| systemGray3 | #C7C7CC | #48484A |
| systemGray4 | #D1D1D6 | #3A3A3C |
| systemGray5 | #E5E5EA | #2C2C2E |
| systemGray6 | #F2F2F7 | #1C1C1E |

*来源：HIG Color + Dark Mode 文档。二手校验：noahgilmore.com/blog/dark-mode-uicolor-compatibility、themeandcolor.com/blog/ios-dark-mode-colors。双源一致。*

### 2.3 圆角（连续曲率）

- 官方 API：`RoundedCornerStyle.continuous`（连续曲率圆角，区别于简单圆弧 `circular`）
- 系统卡片常见圆角：`16pt`（如 sheet）、`12pt`（分组列表）、`10pt`（按钮）、`8pt`（小控件）
- **未找到** Apple 官方硬性规定的圆角数值表；上述为社区观测值，非官方标准

### 2.4 间距网格

- 基准单元：**8pt** 网格（Apple 推荐，HIG Layout 章节）
- 常见间距：4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 pt
- 安全区内边距：iOS 横向 16–20pt，macOS 遵循 8pt 网格

---

## 3. 材质层

### 3.1 五级材质（按模糊强度）

| 层级 | UIKit Style | 视觉特征 | 典型用法 |
|---|---|---|---|
| Ultra Thin | .systemUltraThinMaterial | 轻微模糊，几乎透明 | 轻量浮层 |
| Thin | .systemThinMaterial | 轻度模糊 | 次要浮层 |
| Regular | .systemMaterial / .regular | 中度模糊，饱和度调整 | 导航栏/标准浮层 |
| Thick | .systemThickMaterial | 较厚模糊，背景失色 | 强调卡片 |
| Chrome | .systemChromeMaterial | 最厚，类 chrome 质感 | 工具栏/菜单栏 |

- 每套材质都有 Light / Dark 变体，系统自动切换
- **模糊半径/饱和度具体数值未公开**（Apple 不开放参数，只能用预设样式）

### 3.2 Vibrancy（活力前景）

- 与毛玻璃配套使用：前景文本/图标在模糊背景上通过 vibrancy 保持可读性与色彩通透
- 样式：`UIVibrancyEffectStyle.label` / `.secondaryLabel` / `.tertiaryLabel` / `.fill`
- **vibrancy 的颜色算法未公开**，只能通过系统 API 调用

*来源：HIG Materials + UIBlurEffect 文档。二手校验：nutrient.io/blog/blur-effect-materials-on-ios。*

---

## 4. 声音与反馈

### 4.1 设计原则（HIG Sound and Haptics）

1. **补充而非替代**：声音/触觉是视觉反馈的增强，不是唯一渠道
2. **可自定义**：用户可在系统设置关闭，不影响功能
3. **与动效强度匹配**：反馈强度 ∝ 动画强度
4. **克制使用**：避免频繁/无意义的反馈

### 4.2 触觉反馈层级（Core Haptics）

| 维度 | 参数 | 范围 | 典型值 |
|---|---|---|---|
| 类型 | Transient（短暂）/ Continuous（持续） | — | 点击=Transient，拖拽=Continuous |
| Intensity（强度） | 0.0 – 1.0 | 0.0–1.0 | 点击≈0.3–0.5，错误≈0.7 |
| Sharpness（锐度） | 0.0 – 1.0 | 0.0–1.0 | 确认≈0.5，警告≈0.8 |

### 4.3 系统音效

- 标识符：`UISoundID` / `AudioServicesPlaySystemSound`
- **系统音效的完整列表与参数未在公开文档中列出**，需在 Xcode 中查阅

---

## 5. SF Symbols 图标设计语言

| 维度 | 规范 |
|---|---|
| 网格 | 基于 SF 字体 cap height 对齐；模板含 27 个变体（3 尺度 × 9 字重） |
| 尺度 | Small / Medium（默认）/ Large，对应字体光学尺寸 |
| 字重 | 9 级：Ultralight → Thin → Light → Regular → Medium → Semibold → Bold → Heavy → Black |
| 描边 | 字重变化 = 描边粗细变化，路径骨架不变（variable template 三源插值） |
| 渲染模式 | Monochrome / Hierarchical / Palette / Multicolor |
| 语义 | 图标与文本共享字重系统，自动跟随 Dynamic Type 缩放 |
| 数量 | SF Symbols 6：6,000+ 图标（2024） |

*来源：HIG SF Symbols + Apple 文档 "Creating custom symbol images for your app"。二手校验：glyphsapp.com/learn/creating-an-sf-symbol。*

---

## 6. 动效 Token 化

### 6.1 时长

| Token | Apple 值 | 场景 |
|---|---|---|
| duration-quick | 0.2s | 状态切换 / 微交互 |
| duration-default | **0.35s** | SwiftUI 默认动画时长 |
| duration-standard | 0.5s | 转场 / 较大变化 |
| duration-long | 0.6 – 1.0s | 页面级转场 |

*来源：SwiftUI Animation easeInOut 文档（默认 0.35s）。快速/长时值为社区观测值。*

### 6.2 缓动曲线

| 预设 | 控制点 (P1, P2) | 说明 |
|---|---|---|
| easeInOut | 未找到官方公布值 | SwiftUI 内置预设；默认 0.35s |
| easeIn | 未找到 | — |
| easeOut | 未找到 | — |
| default (UIKit) | 未找到 | `UICubicTimingParameters.init()` 系统默认 |

*注意：Apple **未公开** easeInOut / default 曲线的具体 cubic-bezier 控制点数值。社区有反推值（如 (0.25, 0.1, 0.25, 1.0) 类 Material），但非官方。*

### 6.3 弹簧动画（Spring）

**物理模型参数（UISpringTimingParameters）**：
- `mass`（质量）> 0
- `stiffness`（刚度）
- `damping`（阻尼）
- `initialVelocity`（初速度）

**WWDC23 新两参数模型**（duration + bounce，SwiftUI `.spring`）：
- `duration`：感知时长（perceptual duration）
- `bounce`：弹跳量（正值=过冲弹跳，负值=过阻尼）

**换算公式**（WWDC23 "Animate with springs"，社区校验正确）：
```
mass = 1
stiffness = (2π / perceptualDuration)²
damping = (1 - bounce) × 4π / perceptualDuration   （bounce ≥ 0）
damping = 4π / (perceptualDuration × (1 + bounce))  （bounce < 0）
```

**SwiftUI 弹簧预设**：
| 预设 | 典型时长 | 说明 |
|---|---|---|
| .spring() | 默认 | 通用弹簧 |
| .snappy | 较短（~0.3s） | 快速响应，微弹 |
| .smooth | 中等 | 平滑过渡，少弹 |

*来源：UISpringTimingParameters 文档 + WWDC23 "Animate with springs" (10158)。公式校验：kvin.me/posts/effortless-ui-spring-animations。*

---

## 7. knot 设计系统对标建议

> 结合 knot 审美方向（疏离/克制/低信息密度/非中心构图/留白），在 Apple 基准上做减法与微调。

### 7.1 必补 Token 维度（优先级）

| 维度 | Apple 基准 | knot 取值建议 | 理由 |
|---|---|---|---|
| **动效 token 表** | 0.35s 默认 / spring(duration+bounce) | 默认时长压到 0.25–0.3s；bounce 偏小（0.0–0.1）；增加 instant(0.1s) 微交互档 | 疏离感需要动效干脆、不拖泥带水；减少弹性过冲，多一点干脆的线性尾段 |
| **语义色阶** | 3 级背景 + 4 级文本 + 12 系统色 | 背景级增至 4 级（增加一层"画布外"低对比底）；文本减为 3 级（去掉 tertiaryLabel）；主色仅保留 1–2 个（红绿灯状态色） | 低信息密度靠层级少而清晰实现；颜色越少越克制 |
| **材质 token** | 5 级毛玻璃 + vibrancy | 仅保留 2–3 级（thin / regular / none）；vibrancy 默认关，仅在高信息量浮层启用 | 疏离审美避免玻璃拟态堆砌；大面积留白用纯色背景 + 少量薄材质点缀 |

### 7.2 全量 Token 清单

**A. 视觉 Token**

| Token 名 | Apple 基准 | knot 建议 |
|---|---|---|
| 字号阶梯 | 11 档（11–34pt） | 8 档（去掉 caption2/large title 等极端档，聚焦 12/14/16/18/20/24/28/32） |
| 字重 | 9 级 | 5 级（Light/Regular/Medium/Semibold/Bold），日常只用 Regular + Semibold 两档 |
| 行高 | Body 17/22 ≈ 1.29 | 1.4–1.5（桌面端阅读更舒适，松一点=留白） |
| 圆角 | 连续曲率 + 多档 | 2–3 档（small: 6 / medium: 12 / large: 20），连续曲率不变 |
| 间距 | 8pt 网格，多档 | 8pt 网格保留，但常用档跳一级（16/24/40/64），留白更大 |
| 栅格列数 | 自适应 | 12 列桌面 / 6 列平板 / 4 列移动，gutter 24–32 |
| 颜色-背景 | 3 级分组 + 3 级内容 | 4 级（canvas/page/card/inset），色阶差更小，层次更细腻 |
| 颜色-文本 | 4 级 label | 3 级（primary/secondary/tertiary），弱化第三级 |
| 颜色-状态色 | 12 系统色 | 3 色（红绿灯：成功/警告/错误）+ 1 主色（品牌） |
| 深浅模式 | 语义色自动切换 | 深色模式下背景用 #0A0A0A（非纯黑，降对比度），更柔和 |

**B. 动效 Token**

| Token 名 | Apple 基准 | knot 建议 |
|---|---|---|
| duration-instant | —（无） | 100ms / 0.1s — 悬停/微反馈 |
| duration-fast | ~0.2s | 200ms / 0.2s — 状态切换 |
| duration-default | 350ms / 0.35s | **250ms / 0.25s** — 常规动画（更快更干脆） |
| duration-slow | 500ms | 400ms / 0.4s — 转场 |
| easing-default | 未公开 | cubic-bezier(0.2, 0.0, 0.0, 1.0) — 缓出为主，进场快 |
| easing-inOut | 未公开 | cubic-bezier(0.4, 0.0, 0.2, 1.0) — 对称缓动 |
| spring-snappy | .snappy 预设 | duration: 0.3s, bounce: 0.05（几乎不弹） |
| spring-default | .spring() 预设 | duration: 0.4s, bounce: 0.1（轻微弹性） |
| spring-bouncy | — | duration: 0.5s, bounce: 0.2（仅正向反馈用） |

**C. 材质 Token**

| Token 名 | Apple 基准 | knot 建议 |
|---|---|---|
| material-none | — | 纯色，无模糊（默认） |
| material-thin | .systemThinMaterial | 低模糊 + 低饱和，用于次要浮层 |
| material-regular | .systemMaterial | 中模糊，用于主要浮层/面板 |
| material-thick | .systemThickMaterial | 暂不引入（避免玻璃拟态堆砌） |
| vibrancy-enabled | 默认开 | **默认关**，仅在模糊层上有前景文本时按需开 |

**D. 声音/反馈 Token**

| Token 名 | Apple 基准 | knot 建议 |
|---|---|---|
| feedback-none | — | 静音（默认，桌面端无声） |
| feedback-subtle | Transient, intensity 0.3 | 极弱点击反馈（可选，默认关） |
| feedback-notice | Transient, intensity 0.5 | 重要状态变化提示（如节点创建成功） |
| feedback-error | Transient, intensity 0.7, sharpness 0.8 | 错误告警（克制使用） |

### 7.3 实施优先级

1. **P0 立即建**：颜色 token（语义色阶 + 深浅模式）+ 动效 token（时长 + 缓动 + 弹簧）
2. **P1 紧随**：字号阶梯 + 间距网格 + 圆角 token
3. **P2 迭代**：材质 token + 图标规范 + 反馈 token

---

## 来源索引

| # | 源 | URL | 级别 | 获取时间 |
|---|---|---|---|---|
| 1 | HIG 首页 | developer.apple.com/design/human-interface-guidelines | 一手 | 2026-08-30 |
| 2 | HIG Typography | developer.apple.com/design/human-interface-guidelines/typography | 一手 | 2026-08-30 |
| 3 | HIG Color | developer.apple.com/design/human-interface-guidelines/color | 一手 | 2026-08-30 |
| 4 | HIG Dark Mode | developer.apple.com/design/human-interface-guidelines/dark-mode | 一手 | 2026-08-30 |
| 5 | HIG Materials | developer.apple.com/design/human-interface-guidelines/materials | 一手 | 2026-08-30 |
| 6 | HIG Motion | developer.apple.com/design/human-interface-guidelines/motion | 一手 | 2026-08-30 |
| 7 | HIG SF Symbols | developer.apple.com/design/human-interface-guidelines/sf-symbols | 一手 | 2026-08-30 |
| 8 | HIG Sound and Haptics | developer.apple.com/design/human-interface-guidelines/sound-and-haptics | 一手 | 2026-08-30 |
| 9 | UIBlurEffect.Style | developer.apple.com/documentation/uikit/uiblureffect/style | 一手 | 2026-08-30 |
| 10 | UISpringTimingParameters | developer.apple.com/documentation/uikit/uispringtimingparameters | 一手 | 2026-08-30 |
| 11 | UICubicTimingParameters | developer.apple.com/documentation/uikit/uicubictimingparameters | 一手 | 2026-08-30 |
| 12 | SwiftUI Animation easeInOut | developer.apple.com/documentation/swiftui/animation/easeinout | 一手 | 2026-08-30 |
| 13 | SwiftUI timingCurve | developer.apple.com/documentation/swiftui/animation/timingcurve(_:_:_:_:duration:) | 一手 | 2026-08-30 |
| 14 | 自定义 SF Symbols | developer.apple.com/documentation/uikit/creating-custom-symbol-images-for-your-app | 一手 | 2026-08-30 |
| 15 | WWDC23 Animate with springs | developer.apple.com/videos/play/wwdc2023/10158 | 一手 | 2026-08-30 |
| 16 | iOS Dark Mode 色值校验 | themeandcolor.com/blog/ios-dark-mode-colors | 二手 | 2026-08-30 |
| 17 | iOS 系统色兼容性表 | noahgilmore.com/blog/dark-mode-uicolor-compatibility | 二手 | 2026-08-30 |
| 18 | UIBlurEffect 材质详解 | nutrient.io/blog/blur-effect-materials-on-ios | 二手 | 2026-08-30 |
| 19 | SF Pro 字体体系详解 | blakecrosley.com/blog/sf-pro-typography-system | 二手 | 2026-08-30 |
| 20 | 弹簧动画换算公式校验 | kvin.me/posts/effortless-ui-spring-animations | 二手 | 2026-08-30 |
| 21 | SF Symbols 设计网格 | glyphsapp.com/learn/creating-an-sf-symbol | 二手 | 2026-08-30 |

*标注「未找到」的参数：cubic-bezier 缓动曲线控制点官方值、毛玻璃模糊半径/饱和度具体值、系统音效完整列表、官方圆角数值表。均已在正文中明确标注。*
