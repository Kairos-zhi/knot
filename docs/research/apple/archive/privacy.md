> 历史研究归档 · 来源 H09 · 整理入库 2026-10-18。
> 本文保留原论证与原日期；“当前／已完成／待办”指原文时点，厂商价格、指标、竞品判断与推断未在本轮重新全面核验。
> 本机路径和内部链接已归一，图片及内部运行明细未迁入。现行入口：[文档地图](../../../README.md)；来源与变换：[登记](../../../history/sources.md)。

---

# knot 隐私对标 Apple 调研报告

> Seeker · 2026-08-30 · 一手源（Apple 官方）为主
> 背景：knot 存的是之的思考链资产——最私密的数据本身。对标 Apple 隐私设计，建立 knot 的隐私默认原则。

---

## 一、Apple 隐私设计四支柱（原则层）

Apple 的核心声明：**「Privacy is a fundamental human right.」**（隐私是基本人权）。隐私不是功能，是设计默认（privacy by design / privacy by default）。

四大支柱（WWDC21 官方定义，双源印证）：

| 支柱 | Apple 定义 | 设计含义 |
|------|-----------|----------|
| **数据最小化** (Data Minimization) | 只请求、只使用真正需要的数据 | 反问自己：「我真的需要这个数据吗？」 |
| **端侧处理** (On-device Processing) | 本地处理数据，不发送到服务器 | 反问：「服务器为什么需要看到这个数据？」 |
| **透明与控制** (Transparency and Control) | 用户清楚知道数据被如何使用，且能控制 | 反问：「我们要用这个数据做什么？怎么告诉用户？」 |
| **安全保障** (Security Protections) | 传输中与静止时的数据安全 | 反问：「这个数据在传输和存储时怎么保护？」 |

> 来源 [1][2][3]：Apple Developer WWDC21 Session 10085、Apple Privacy Governance、Apple Newsroom Siri 隐私声明
> 设计方法论：不是先收集再保护，而是先问「能不能不收」「能不能本地算」。

**补充技术：差分隐私 (Differential Privacy)**
当 Apple 确实需要群体层面的洞察（如热门 emoji、Safari 高耗能域名），使用本地差分隐私——数据离开设备前加入数学噪声，保证个体不可识别，同时群体统计仍然有效。有隐私预算（epsilon）约束。[6][7]

---

## 二、权限模型（机制层）

### 2.1 iOS 三级权限体系

iOS 对敏感数据（位置、相机、麦克风、照片等）采用**渐进式授权**，默认不授权，用户主动授予：

| 权限等级 | 行为 | 适用场景 |
|---------|------|---------|
| **一次性 (Allow Once)** | 本次使用授权，App 退出后失效，回到未决定状态 | 临时任务（如分享位置、拍一张照） |
| **使用时 (While In Use)** | App 在前台/活跃使用时可访问 | 大多数场景的默认推荐 |
| **始终 (Always)** | 后台也可访问；需二次提示确认，且每个 App 只能请求一次 | 需后台自动化的场景（如地理围栏） |

关键设计：
- **Provisional Always**：用户选了「使用时」但 App 申请的是「始终」，系统先给「临时始终」状态，后续在实际后台使用时再弹第二次确认——把授权决策推后到用户真正看到行为时。[4]
- **功能级权限而非全量授权**：照片可以只授权部分照片、联系人可以只从系统 picker 选一个而不给全通讯录——数据最小化落实到每次交互。
- **权限请求必须伴随用途说明**（Usage Description）：系统级强制，不写就直接 crash。[5]

### 2.2 App Tracking Transparency (ATT)

ATT 是 Apple 对**跨应用追踪**的默认关闭机制（iOS 14.5+）：
- IDFA（广告标识符）默认全零，App 必须弹窗显式请求用户同意才能获取。
- 一次性决定，系统记住，卸载重装才会再问。
- 追踪定义：将本 App 数据与其他公司 App/网站/线下数据关联，用于定向广告或广告归因，或共享给数据代理。[8][9]
- 设计本质：**把「默认被追踪」翻转为「默认不追踪」，选择权交还给用户**。

> 来源 [4][5][8][9]：Core Location 官方文档、AVFoundation 授权文档、ATT 官方文档、App Store User Privacy and Data Use

---

## 三、端侧智能与隐私（智能层）

### 3.1 On-device Processing = Apple Intelligence 的基石

Apple Intelligence 的架构原则：**能本地算就本地算，本地算不了才上云，上云也不存。**

> 「The cornerstone of Apple Intelligence is on-device processing, so it is aware of your personal information without collecting your personal information.」——Apple 官方 [10][11]

两层架构：

| 层级 | 处理位置 | 适用场景 | 隐私保证 |
|------|---------|---------|---------|
| **端侧模型** | 本机芯片 (Apple Silicon) | 大多数日常请求（写作、总结、问答等） | 数据不出设备，天然无中心化攻击面 |
| **Private Cloud Compute (PCC)** | Apple 自研服务器 | 复杂请求（需要更大模型） | 端到端加密、数据不存储、只用于响应当次请求、独立专家可审计服务器代码 |

PCC 的设计细节（Apple Security Blog 官方）[12]：
- 设备端先验证服务器节点的加密证书，请求直接加密到 PCC 节点公钥——端到端加密
- 数据只用当次请求完成即销毁，Apple 无法访问
- 服务器运行的软件可被独立安全专家审计验证——用可验证性建立信任，而非「相信我们」

### 3.2 Siri 隐私承诺

- Siri 尽可能在设备上处理（on-device dictation、on-device Siri 命令）
- 从不将 Siri 数据用于构建营销画像、从不提供给广告、从不售卖给任何人 [3]
- 即使上云，也使用随机标识符而非 Apple ID 关联

> 来源 [3][10][11][12]：Apple Newsroom、Apple Privacy Features、Apple Security Blog、support.apple.com

---

## 四、透明与信任（沟通层）

### 4.1 App Privacy Nutrition Labels（隐私营养标签）

App Store 每个 App 页面展示的隐私标签，类似食品营养成分表：
- 开发者自报收集了哪些数据类型（30+ 类：位置、联系信息、用户内容、浏览历史、搜索历史、标识符、使用数据、敏感信息等）
- 分类展示：用于追踪的数据 / 关联到你的数据 / 不关联的数据 [13][14]
- 是 App Store 上架的强制要求，开发者必须如实填写
- 设计目标：用户下载前就能一眼看懂「这个 App 会拿我什么数据」

### 4.2 App Privacy Report（隐私报告）

iOS 系统级功能（iOS 15.2+）：
- 显示过去 7 天各 App 访问敏感数据（位置、照片、相机、麦克风、通讯录）的频率和时间
- 显示各 App 的网络活动、联系过的域名
- 与隐私营养标签配合：前者是「下载前的承诺」，后者是「使用中的审计」[15][16]
- 设计本质：**给用户一个事后核查的工具，让承诺可验证**

> 来源 [13][14][15][16]：Apple App Privacy Details 官方文档、Apple Support、Apple Privacy Features

---

## 五、knot 隐私对标建议

### 5.1 设计哲学对位

knot 存的是**思考链资产**——比位置、照片更私密的是「你在想什么」。Apple 对健康数据、Siri 请求的保护级别，是 knot 的底线。

**knot 隐私第一原则：思考数据默认私有，默认不出本地。**

### 5.2 权限模型对标（默认私有 + 最小化）

| Apple 机制 | knot 对标设计 |
|-----------|--------------|
| 默认不授权 | 每个文档/思考链/资产默认=私有（之 8/29 原话：「默认给我开权限好嘛宝宝。。。不要默认所有人可看」） |
| 三级授权（一次/使用时/始终） | 三级分享粒度：①一次性链接（阅后即焚/限时）②协作时授权（某条思考链共享给某 agent，协作结束自动回收）③长期授权（特定 agent 对特定域的持续访问） |
| Provisional Always（先给再确认） | 新 agent 接入时先给「试用权限」（只读+限次），实际产生价值后之再决定是否升级为长期权限 |
| 功能级最小授权（选一张照片≠给整个相册） | 分享一个思考节点≠共享整个空间；引用一条对话≠开放整个上下文；精确到节点/链/域的授权粒度 |
| 用途说明强制（Usage Description） | 任何权限请求必须附带「为什么需要」说明，agent 申请访问数据时要解释用途，用户可据此判断 |
| ATT 默认不追踪 | 默认不向任何第三方 agent / 云服务 / 分析系统发送思考数据；接入任何外部服务都需之显式同意 |

### 5.3 端侧处理对标（数据上云不读取 + 个人自建云）

| Apple 机制 | knot 对标设计 |
|-----------|--------------|
| On-device processing 优先 | knot 本地模型优先（思考链整理、关联发现、摘要等能本地算的全本地算），不上云 |
| Private Cloud Compute | 个人自建云（之的私有部署）= knot 的 PCC：①数据端到端加密 ②服务器只处理当次请求不存储 ③日志可审计 ④之拥有完全控制权 |
| 数据不用于训练模型 | 之的思考链数据**绝不**用于训练任何公共模型；如果用个人数据微调个人模型，也是本地微调、权重不离开之的设备 |
| 差分隐私（群体洞察） | 如果未来 knot 需要跨用户统计改进产品，使用差分隐私技术，确保个体思考链不可识别 |

> 之的倾向（档案）：「数据上云不读取」——与 Apple PCC 的「数据只用于响应当次请求、不存储、不用于其他目的」完全一致。个人自建云比 Apple PCC 更进一步：之拥有物理控制权，而不只是信任承诺。

### 5.4 透明与信任对标（可核查的隐私）

| Apple 机制 | knot 对标设计 |
|-----------|--------------|
| 隐私营养标签（下载前承诺） | knot 每个 agent / 服务接入时展示「隐私标签」：会访问什么数据、用来做什么、数据是否离开本地、是否存储 |
| App Privacy Report（使用中审计） | knot 内置「隐私审计面板」：哪些 agent 在什么时间访问了哪些思考链、哪些数据被发送到了哪里、外部 API 调用记录——7天可查，之可随时吊销权限 |
| 可验证性（独立专家审计 PCC） | 之作为最终控制者，可随时查看完整的数据流日志；关键操作（数据导出、外部共享、模型训练）需要二次确认 |

### 5.5 优先级建议（先做什么）

1. **P0：默认私有** — 所有思考链/资产默认私有，分享必须之主动操作。这是地基，对应 Apple 的 privacy by default。
2. **P0：本地优先** — 思考链的索引、关联、摘要等基础能力先做本地版本，云同步是可选功能而非强制。
3. **P1：三级授权模型** — 一次性 / 协作期 / 长期，精确到节点粒度，而不是「整个空间共享」。
4. **P1：隐私审计面板** — 让之看到「谁在什么时候碰了我的什么数据」，可随时吊销。
5. **P2：个人自建云的 PCC 模式** — 上云不存、端到端加密、只用于当次请求。
6. **P2：Agent 隐私标签** — 每个接入的 agent 都有一份「它会拿什么数据、用来干什么」的声明。

---

## 引用来源（一手源，获取时间 2026-08-30）

[1] Apple Developer, "Apple's privacy pillars in focus" (WWDC21 Session 10085) — https://developer.apple.com/videos/play/wwdc2021/10085
[2] Apple Legal, "Privacy Governance" — https://www.apple.com/legal/privacy/en-ww/governance
[3] Apple Newsroom, "Our longstanding privacy commitment with Siri" (2025-01) — https://www.apple.com/newsroom/2025/01/our-longstanding-privacy-commitment-with-siri
[4] Apple Developer, "Choosing the Location Services Authorization to Request" — https://developer.apple.com/documentation/bundleresources/choosing-the-location-services-authorization-to-request
[5] Apple Developer, "Requesting authorization to capture and save media" — https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media
[6] Apple, "Differential Privacy Overview" (PDF) — https://www.apple.com/privacy/docs/Differential_Privacy_Overview.pdf
[7] Apple Machine Learning Research, "Understanding Aggregate Trends for Apple Intelligence" — https://machinelearning.apple.com/research/differential-privacy-aggregate-trends
[8] Apple Developer, "App Tracking Transparency" — https://developer.apple.com/documentation/apptrackingtransparency
[9] Apple Developer, "User Privacy and Data Use - App Store" — https://developer.apple.com/app-store/user-privacy-and-data-use
[10] Apple, "Privacy - Features" — https://www.apple.com/privacy/features
[11] Apple Support, "Apple Intelligence and privacy on iPhone" — https://support.apple.com/guide/iphone/apple-intelligence-and-privacy-iphe3f499e0e/ios
[12] Apple Security Blog, "Private Cloud Compute: A new frontier for AI privacy in the cloud" — https://security.apple.com/blog/private-cloud-compute
[13] Apple Developer, "App Privacy Details - App Store" — https://developer.apple.com/app-store/app-privacy-details
[14] Apple Developer, "Create your Privacy Nutrition Label" (WWDC22 Session 10167) — https://developer.apple.com/videos/play/wwdc2022/10167
[15] Apple Support, "About App Privacy Report" — https://support.apple.com/en-us/102188
[16] Apple, "Privacy - Control" — https://www.apple.com/privacy/control

---

*全文约 2,900 字。双源核对项：四支柱定义（[1]+[2]+[3] 三源印证）、端侧+PCC 架构（[10]+[11]+[12] 三源印证）、ATT 机制（[8]+[9] 双源印证）、隐私标签+报告（[13]+[15] 双源印证）。*
