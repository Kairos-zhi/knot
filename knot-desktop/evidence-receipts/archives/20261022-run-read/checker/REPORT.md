# RUN-005 独立复核

结论：`ACCEPT_DSH_READ_AUDIT_LIMITED`，仅接受单会话只读接缝及窄请求边界审计。未发现本卡范围内阻断。

- 独立`npm test` 51/51，失败0、跳过0；原44项＋新增7组。另直接用官方Electron RunAsNode重跑worker：14条官方Session生成的合成事件经实际JSONL落盘、点读、重放，三次观察分别缺批准／错批准／正确指纹批准，3句柄均关闭；Session物理字节和Knot字节不变，Run仍prepared。独立expected指纹与actual相同。
- 新5候选文件、RUN-004旧4冻结文件及10份新ASAR成员哈希一致；官方ASAR全档仍`47874618bf5b3011fcaac10cd4c85f69da333e70d4f99b921207c78d0999512a`。Checker未改产品源码。
- 自有5项负例通过：错Run绑定及授权时取消均在persistence前拒绝；错access句柄关闭且不读；读异常路径／正文不泄露且关闭；developer正文变化使旧批准失效，不输出正文、不授予执行。详见`independent-result.json`与脚本。
- 直接审查确认默认拒绝、四元绑定、current/header/revision/handle校验、返回逻辑日志上限与冻结、窄字段／顺序检查、官方Session全日志与assistant前缀重放；有效header/config/route、context、完整派生messages、permission事实和初始metadata均进入指纹。读许可与指纹批准分离，工厂无HTTP路由、Agent/LLM调用或资产回流；所有观察结果executionAuthorized=false、modelRunVerified=false。

必须保留限定：真实性依赖受信宿主composition，尚未接入在用Desktop或绑定真实用户Session。实际库夹具仍为合成Session，不能称真实模型Run。runtime-required replay＋本卡窄schema不是完整DSH validator；审计覆盖该首turn／单step／纯文本无工具的DSH请求边界，不证明Provider转换后HTTP字节／所有插件或stream语义。下层可能扫描目录元数据、解析完整物理artifact并隐藏torn尾；此处只有有效连续逻辑前缀观察，不是物理完备取证或严格流式内存上限。没有成本／执行授权、真实取消／恢复、桌面部署或产品验收。

证据：`regression.log`、`hash-check.json`、`official-library-result.json`、`official-library-stderr.log`、`independent-probes.mjs`、`independent-probes.log`、`independent-result.json`。未读真实用户Session、Provider配置或凭据，未启停／安装Desktop、push或合并。
