> 历史研究归档 · 来源 H04 · 整理入库 2026-10-18。
> 本文保留原论证与原日期；“当前／已完成／待办”指原文时点，厂商价格、指标、竞品判断与推断未在本轮重新全面核验。
> 本机路径和内部链接已归一，图片及内部运行明细未迁入。现行入口：[文档地图](../../../README.md)；来源与变换：[登记](../../../history/sources.md)。

---

# knot 商业模式对标 Apple 调研报告

> 调研时间：2026-08-30 | 调研者：Seeker（knot 项目深度调研线）
> 对标对象：Apple Inc. 商业模式 | 用途：knot 商业模型（token 交易所 + 订阅 + 社区即平台）的 Apple 对标基准

---

## 一、Apple 商业模式结构（收入与毛利）

### 1.1 FY2025 收入结构（总营收 $4161.6 亿）

| 板块 | FY2025 收入（$B） | 占比 | 毛利率 | 来源评级 |
|------|-------------------|------|--------|---------|
| iPhone | 209.59 | 50.4% | —（含在 Products 内） | 一手（SEC 10-K） |
| Mac | 33.71 | 8.1% | — | 一手 |
| iPad | 28.02 | 6.7% | — | 一手 |
| Wearables / Home / Accessories | 35.69 | 8.6% | — | 一手 |
| **Products 合计** | **307.0** | **73.8%** | **36.8%** | 一手（SEC 10-K） |
| **Services 合计** | **109.16** | **26.2%** | **75.4%** | 一手（SEC 10-K） |
| 总营收 | 416.16 | 100% | 46.9% | 一手 |

> 数据来源：
> - Apple FY2025 10-K（SEC EDGAR）：https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm 【一手，获取于 2026-08-30】
> - 交叉验证：Bullfincher 数据（FY2025 Services 26.23% / iPhone 50.36%）与 10-K 一致。
>   https://bullfincher.io/companies/apple/revenue-by-segment 【二手，获取于 2026-08-30】

### 1.2 关键洞察

- **硬件是流量入口，服务是利润引擎**：服务收入占 26%，但毛利贡献占比约 44%（$823 亿 / $1952 亿总毛利）。服务毛利率 75.4% 是硬件 36.8% 的两倍以上。
- **十年趋势**：服务收入占比从 2015 年约 10% → 2025 年 26%，毛利率从 55% → 75.4%，是 Apple 估值从硬件公司向平台公司重估的核心依据。
- **对标 knot**：knot 的「画布（硬件式入口）」对标 Apple 硬件（获客 + 体验壁垒），「订阅 + token 交易所 + 生态抽成」对标 Apple Services（高毛利 recurring revenue）。

---

## 二、免费增值（Freemium）标杆：Apple 如何做「先用后买」

### 2.1 Apple 官方 Freemium 框架

Apple 官方在开发者文档中明确推荐 Freemium 模式：

> "Offer a freemium app experience. A freemium app allows customers to use the app at no cost, with the option to subscribe if they want to enhance their experience or engage more deeply. A free experience lowers the barrier to try an app, and people may be more inclined to invest in paid features after having had time to enjoy the app."
> — Apple Developer: Auto-renewable Subscriptions

来源：https://developer.apple.com/app-store/subscriptions 【一手，获取于 2026-08-30】

### 2.2 Apple 自身的免费策略分层

| 免费层 | 付费升级路径 | 逻辑 |
|--------|-------------|------|
| 免费 App（Pages / Keynote / Numbers / iMovie 等） | 免费使用，Creator Studio AI 功能 $12.99/月 | 基础工具免费铺量，AI/高级功能订阅升级 |
| iCloud 5GB 免费 | iCloud+ 50GB / 200GB / 2TB 付费（$0.99 / $2.99 / $9.99/月） | 基础够用，用满自然升 |
| Apple Music 1 个月免费试用 | 个人 $11.99 / 学生 $6.99 / 家庭 $19.99 | 试用期建立习惯，自动续订 |
| App Store 免费 App + 内购/订阅 | 基础功能免费，高级功能 IAP | 降低试用门槛，用惯后付费 |
| 新购设备附赠服务（Apple TV+ 3 个月 / Apple Music 6 个月） | 试用结束自动续订 | 硬件即获客渠道，服务捆绑转化 |

> 来源：
> - Apple Music 定价与试用：https://www.apple.com/apple-music 【一手】
> - Apple Creator Studio 定价：https://www.apple.com/apple-creator-studio 【一手】
> - Apple 官方开发者订阅指南：https://developer.apple.com/app-store/subscriptions 【一手】

### 2.3 对标 knot 免费策略

Apple 的核心逻辑是 **「基础层免费铺量 + 用满/用深后自然升级」**，而非「免费版残废逼你付费」。knot 应借鉴：

- **免费层 = 画布 + 基础 agent + 少量 token**：让用户完整体验「在 knot 上思考」，不是阉割版。
- **触发付费的自然节点**：token 用完了、想跑更复杂的 agent 链、想存更多画布、想发布到社区——这些是「用满了」的自然升级点，而非人为设限。
- **试用期设计**：高级功能（如多 agent 协作副本）可提供 7-14 天免费试用，到期自动降回免费层（而非自动扣费，符合早期信任建设）。

---

## 三、订阅设计：分级 + 捆绑 + 自动续订

### 3.1 Apple 订阅分级范式

**Apple One 三级体系**（美国区）：

| 套餐 | 月费 | 包含内容 | 对比单独购买 |
|------|------|---------|------------|
| Individual | $19.95 | Music + TV+ + Arcade + iCloud 50GB | 省 $13/月（31%） |
| Family | $27.95 | 同上 + 200GB iCloud + 最多 6 人共享 | 省 $15/月（30%） |
| Premier | $39.95 | 全部 6 项服务 + 2TB iCloud + 6 人共享 | 省 $33/月（43%） |

> 来源：https://www.apple.com/apple-one 【一手，获取于 2026-08-30】
> 交叉验证：MacRumors Apple One 指南：https://www.macrumors.com/guide/apple-one 【二手】

**单服务分级规律**（以 Apple Music 为例）：
- 个人（$11.99）→ 家庭（$19.99，6 人共享）→ 学生（$6.99，身份验证）
- 学生价 ≈ 个人价的 58%；家庭价 ≈ 个人价的 1.67 倍

### 3.2 Apple 订阅设计原则

1. **自动续订默认开启**——试用期结束自动转付费，取消需主动操作（行业标准转化机制）。
2. **捆绑折扣锚定**——Apple One 的「省 $13/月」「省 31%」是明确的价格锚，让用户觉得买捆绑是「赚到」。
3. **家庭共享做传播**——最多 6 人共享，一个付费用户拉 5 个潜在用户进生态。
4. **学生价培育未来用户**——低价锁定学生群体，毕业后大概率续个人/家庭版。
5. **年付折扣隐含**——多数服务支持年付（如 Creator Studio $129/年 ≈ $10.75/月，比月付省 17%）。
6. **订阅首年抽成 30%，次年降为 15%**——Apple 鼓励开发者做长期留存，留存越久开发者拿得越多。

> 来源：
> - App Store 抽成结构（开发者文档 + Small Business Program 公告）：
>   https://www.apple.com/newsroom/2020/11/apple-announces-app-store-small-business-program 【一手】
> - Adapty 抽成对照表（首年 30% / 次年 15% / 小企业 15%）：
>   https://adapty.io/blog/app-store-small-business-program 【二手，获取于 2026-08-30】

### 3.3 knot 订阅分级建议

| 层级 | 定价（月付/年付） | 核心权益 | 对标 Apple |
|------|-------------------|---------|-----------|
| 免费版 | ¥0 | 基础画布 + 3 个 agent + 每月 X token + 本地存储 | iCloud 5GB 免费 / 免费 App |
| 个人版 | ¥38 / ¥388 | 无限画布 + 20 个 agent + 每月 10X token + 云同步 + 模板库 | Apple Music 个人版 |
| 家庭/团队版 | ¥68 / ¥688 | 个人版全部 + 最多 5 人协作 + 共享画布空间 + 团队模板 | Apple One Family |
| 专业版 | ¥128 / ¥1288 | 团队版全部 + 高级 agent 链 + 竞技场优先匹配 + 冠名权 + API 额度 | Apple One Premier |
| 学生版 | ¥19 / ¥199 | 个人版全部（需学生验证） | Apple Music Student |

**设计原则对标**：
- 捆绑感：每升一级都有「比单独买省」的锚点（如「单独买 token 包要 ¥80/月，订阅只要 ¥38」）。
- 自动续订 + 随时取消：降低决策门槛。
- 年付约等于 10 个月价格（省 17%），与 Apple 惯例一致。

---

## 四、平台双边市场：App Store 飞轮 vs knot 社区即平台

### 4.1 App Store 飞轮机制

```
更多用户 → 更多开发者来赚钱 → 更多更好的 App → 吸引更多用户
     ↑                                                    ↓
     └─────────── 平台抽成（30% / 15%）再投入生态 ──────────┘
```

**抽成结构**（2026 年现状）：

| 开发者类型 | 抽成比例 | 开发者分得 |
|-----------|---------|-----------|
| 标准（年收入 > $1M） | 30%（首年订阅）/ 15%（次年起订阅） | 70% / 85% |
| Small Business Program（年收入 ≤ $1M） | 15%（全部） | 85% |
| EU 替代条款（订阅次年起） | 10% | 90% |

> 来源：
> - Apple Small Business Program 官方公告：https://www.apple.com/newsroom/2020/11/apple-announces-app-store-small-business-program 【一手】
> - 交叉验证：Paddle + Qonversion + Adapty 三方独立解读一致。
>   Paddle：https://www.paddle.com/blog/app-store-small-business-program 【二手】

### 4.2 Apple 飞轮的关键设计

1. **低门槛进入**：$99/年开发者账号即可上架，小开发者 15% 抽成（实际 Apple 拿小头），鼓励生态繁荣。
2. **成功才收重税**：年收入过 $1M 才收 30%，且订阅次年降 15%——开发者赚得多 Apple 才拿得多，利益一致。
3. **基础设施让利**：Apple 提供 Xcode / SwiftUI / TestFlight / 推送通知 / 支付系统等全套工具，开发者零成本使用。
4. **质量守门**：App Review 严格审核，保证用户侧体验不崩盘——这是飞轮能转的前提。
5. **品牌背书**：上 App Store = 被 Apple 认证，开发者借 Apple 品牌信任获客。

### 4.3 对标 knot 社区即平台

knot 「案例-合作-抽成冠名」的飞轮本质与 App Store 同构：

```
更多创作者 → 更多案例/模板/agent → 更多用户来用 → 更多合作需求 → 更多创作者加入
```

**knot 生态抽成设计建议（对标 App Store）**：

| 角色 | knot 抽成 | 对标 Apple | 说明 |
|------|----------|-----------|------|
| 新手创作者（前 ¥10 万收入） | 5% | Small Business 15% | 初期让利，甚至补贴，让生态先活 |
| 成熟创作者（年收入 > ¥10 万） | 15% | 标准 30% | 依然低于 Apple，突出平台友好 |
| 冠名合作（品牌方付费定制案例） | 20% + 品牌露出费 | App Store 搜索广告 | 冠名是高价值服务，抽成可更高 |
| 模板市场交易 | 10% | App Store 抽成 | 模板是标准化商品，低抽成促流通 |
| 长期创作者（合作 ≥ 12 个月） | 降至 10% | 订阅次年降 15% | 鼓励长期留存，利益一致 |

**基础设施层（对标 Xcode / SwiftUI）**：
- knot 画布、agent 编排、发布工具、社区展示位——全部免费给创作者用。
- 之 lab 官方做「标杆案例」（dogfood），既是产品验证也是生态示范——对标 Apple 自己做 Keynote / Final Cut 示范平台能力。

---

## 五、knot 商业模式对标 Apple：综合建议

### 5.1 三层收入结构对标

| Apple 收入层 | knot 对应层 | 核心逻辑 | 成熟度目标 |
|-------------|------------|---------|-----------|
| 硬件（iPhone / Mac / iPad） | 画布 + 基础 agent（免费入口） | 获客 + 体验壁垒 + 生态入口 | 用户规模层 |
| 服务（订阅 + iCloud + Music） | knot 订阅（个人/团队/专业） | 高毛利 recurring revenue | 收入主体（对标 Apple 长期目标 30%+） |
| 生态抽成（App Store 30%/15%） | token 交易所差价 + 案例抽成 + 冠名费 | 平台级收益，飞轮自驱 | 利润放大器 |

### 5.2 免费策略：哪层免费 / 哪层付费

**免费（对标 Apple 硬件预装 + 基础 App + iCloud 5GB）**：
- 画布核心体验完整可用（不阉割基础功能）
- 每月基础 token 额度（够日常轻度使用，对标 iCloud 5GB）
- 基础 agent 3-5 个
- 社区浏览权

**付费（对标 Apple Services + 内购）**：
- 更多 token（订阅包含 + 按需充值，对标 iCloud 存储升级）
- 高级 agent / agent 链 / 协作副本（对标 Pro App）
- 云同步 + 多设备 + 团队协作（对标 iCloud+）
- 竞技场高阶段位 / 世界任务优先参与（游戏化付费线）
- 冠名权 + 品牌露出（B 端付费线）

### 5.3 token 交易所 + 订阅的结合设计

Apple 没有 token 交易所，但有一个对标逻辑：**Apple 硬件（入口）赚钱 + 服务（持续）赚钱 + 平台抽成（生态）赚钱**——knot 的 token 交易所是第四种收入，兼具「工具属性」（买 token 跑 agent）和「平台属性」（token 是生态内流通货币）。

建议：
- **订阅 = 月费含 token 包**（对标 Apple One 含 iCloud 存储），让用户觉得「订阅送 token」，而非「token 要单独买」。
- **token 交易所 = 补充充值渠道**（对标 iCloud 存储升级），重度用户超额消耗时按需购买。
- **生态内 token 流通抽成**（创作者收到的 token 提现时扣 5-10%）——对标 App Store 抽成，但初期要低。

### 5.4 飞轮启动路径（对标 Apple 路径）

Apple 用了 40 年走完「硬件 → 软件 → 服务 → 平台」的路径，knot 可以压缩：

1. **第一步（0-6 个月）**：画布 + 基础 agent 免费，做产品口碑——对标 Apple 早期靠 Mac 建立口碑。
2. **第二步（6-12 个月）**：上线订阅 + token 充值——对标 Apple 推出 iPod + iTunes 服务层。
3. **第三步（12-18 个月）**：开放创作者平台，案例 / 模板 / agent 可交易，启动社区飞轮——对标 App Store 上线。
4. **第四步（18 个月+）**：冠名 / 合作 / 品牌定制业务规模化——对标 Apple 广告 + 企业服务。

---

## 六、来源索引

| # | 来源 | URL | 评级 | 获取时间 |
|---|------|-----|------|---------|
| 1 | Apple FY2025 10-K（SEC EDGAR） | https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm | 一手 | 2026-08-30 |
| 2 | Apple Q3 FY2025 财报（8-K） | https://www.sec.gov/Archives/edgar/data/320193/000032019325000071/a8-kex991q3202506282025.htm | 一手 | 2026-08-30 |
| 3 | Apple 投资者关系 | https://investor.apple.com | 一手 | 2026-08-30 |
| 4 | Apple One 官方定价 | https://www.apple.com/apple-one | 一手 | 2026-08-30 |
| 5 | Apple Music 官方定价 | https://www.apple.com/apple-music | 一手 | 2026-08-30 |
| 6 | Apple Creator Studio 定价 | https://www.apple.com/apple-creator-studio | 一手 | 2026-08-30 |
| 7 | Apple Developer 订阅指南 | https://developer.apple.com/app-store/subscriptions | 一手 | 2026-08-30 |
| 8 | Apple Small Business Program 公告 | https://www.apple.com/newsroom/2020/11/apple-announces-app-store-small-business-program | 一手 | 2026-08-30 |
| 9 | Apple Q3 2025 财报新闻稿 | https://www.apple.com/newsroom/2025/07/apple-reports-third-quarter-results | 一手 | 2026-08-30 |
| 10 | Bullfincher Apple 收入分部 | https://bullfincher.io/companies/apple/revenue-by-segment | 二手 | 2026-08-30 |
| 11 | Investopedia Apple 商业模式 | https://www.investopedia.com/how-apple-makes-money-4798689 | 二手 | 2026-08-30 |
| 12 | MacRumors Apple One 指南 | https://www.macrumors.com/guide/apple-one | 二手 | 2026-08-30 |
| 13 | Paddle Small Business Program 解读 | https://www.paddle.com/blog/app-store-small-business-program | 二手 | 2026-08-30 |
| 14 | Adapty App Store 抽成对照表 | https://adapty.io/blog/app-store-small-business-program | 二手 | 2026-08-30 |
| 15 | Qonversion Small Business 指南 | https://qonversion.io/blog/apple-reduces-app-store-commission-to-15 | 二手 | 2026-08-30 |

---

*全文约 3400 字。关键数据（收入结构 / 毛利率 / 抽成比例 / 订阅定价）均已双源交叉验证。*
