# 导入契约与操作（当前实现）

在仓库根运行CLI，先准备单独的来源目录（含MANIFEST.sha256）与一个明确的候选库。
完整研究包按交接材料取得，不会从冻结参考脚本自动生成或解包。
逐条出处见[断言与代码映射](W1D7-CLAIM-MAP.md)，数据库说明见[SCHEMA](SCHEMA.md)。

## 从建库到导入

在安装了requirements-dev.txt的Python环境中，以下baseline目录指你准备好的来源根；
candidate/knot.db须位于来源树外。初始化只用于新库：已有文件、目录或软链一律非交互拒绝，
没有覆盖开关；同目录临时建库并自验后以硬链接发布，失败清理临时残留。
stdout输出created/refused/failed的单行JSON，退出码分别为0/1/1，人话写stderr。
已有库按SCHEMA文档迁移，不用初始化命令替换。[I01]

```sh
python -m mvp.backend.init_db candidate/knot.db
python -m mvp.backend.import_baseline --source baseline --db candidate/knot.db
```

CLI无默认源或默认库。导入先核manifest及源快照，再检查库中是否存在1.1版本记录；
当前1.2新库保留该记录，因此可导入。不能仅凭“版本数字大于1.1”就假定通过：
实际查询是`WHERE version='1.1'`，缺少该行会报
`schema 1.1 required; migrate explicitly before importing`，不自动建库或迁移。[I02]

## 文件类型与十进制阈值

先按下面受支持的扩展名映射media_type，不支持的后缀计入failed：[I03]

| 后缀（不区分大小写） | media_type |
|---|---|
| .md | text/markdown |
| .py | text/x-python |
| .json | application/json |
| .sha256 | text/plain |
| .zip | application/zip |

实际内嵌条件精确为：后缀小写化后**不是`.zip`且`len(content) <= TEXT_LIMIT`**，
其中`TEXT_LIMIT = 1_000_000`原始字节，是十进制1MB，**不是1MiB（1,048,576字节）**。
这里JSON也属于可内嵌类型，不能改写成“仅text/*才内嵌”。[I04]

内嵌正文按原字节保存到content_blob，不做编码或换行转换；content_hash是原始字节
SHA256的小写十六进制。判断前会把内容与前置快照的hash、mtime_ns重比。[I05]

不内嵌的文件写到库同级`objects/<hash前2位>/<完整hash>`，file_path保存这个相对路径，
blob为NULL；zip不解包，不递归导入归档内成员。[I06]
对象先写临时文件、flush/fsync，再硬链接原子发布；既有同名对象hash不符则失败，
不覆盖。文件系统需支持该硬链接操作；异常按失败处理。[I07]

file_path正文不进入全文索引，调用list_unindexed()可见。**空正文不等于缺失正文**：
`b""`是非NULL blob，有FTS内容行但无token；NULL blob没有该行。list_unindexed只按
NULL判断，不读取文件或诊断索引损坏。[I08]

## MANIFEST、hash与mtime

MANIFEST.sha256为UTF-8文本，每行由SHA256和相对路径组成，路径可含空格；
解析器按首个空白分开两部分，允许路径前的`*`标志。manifest通常不列自身。[I09]

校验成员hash、重复/越界路径及软链接；再递归快照全目录，要求成员集恰覆盖所有文件
（加manifest自身），并与首次manifest期望hash逐项相等。manifest自身以其原始字节
计算hash参与快照，防止两次读取间变化被当成新基准。[I10]

快照包含相对path、sha256、bytes、mtime_ns。**mtime_ns不在manifest文件中**，
它在首次验证后的内存快照中留存；逐文件读入后复比hash与mtime_ns，末尾再次校验
manifest及完整快照。`source changed after manifest verification`表示该文件在预检后
内容或mtime改变，当前文件不会入库；末尾发现变化也会记failed，不宣称源完整性通过。[I11]

未来mtime被拒绝。事件时间和资产created_at来自`mtime_ns // 1_000_000`，以Unix毫秒
计；不把文件的本地时间字符串当事件时间。来源URI为file://加百分号编码的相对路径，
metadata_json保留origin=v0.4和原始相对path。[I12]

## 一文件一资产一事件、幂等与失败

with repo.session()复用连接，每文件在单独transaction内插入资产和import事件；
该对中任一步失败会回滚该文件，之前成功文件保留，不是整批原子事务。[I13]
每个新资产恰一条import事件：subject为asset_id，target_assets=[asset_id]，
evidence_refs=[]；payload包括bytes、media_type、origin。此处不是原子主张抽取，
不会同时填event_atom_map或eligible_snapshots。[I14]

同hash已存在时跳过，不重复事件。它不会检查或补救外部SQL先前制造的不配对资产。
重复内容的不同来源文件也按同一个hash去重，不保证每个文件路径各占一行。[I15]
失败文件可能留有未被引用的正确对象；它不被当作成功资产，下次重跑可复用，
导入器不会擅自删除历史对象。[I16]

正常运行输出一行JSON，字段如下；indexed/unindexed只统计**本次新增**：[I17]

```json
{"imported":22,"skipped":0,"indexed":19,"unindexed":3,"failed":[]}
```

对受支持的操作/数据/SQLite错误，stdout仍输出该JSON结构；failed非空时退出1，
无失败退出0。每个失败含path/error。命令行参数缺失由argparse处理，不能把其用法错误、
进程被杀等情况也承诺为JSON结果。[I18]

## 全文检索与重建

FTS由INSERT trigger维护，查询使用MATCH索引与rowid JOIN返回assets原列。
非空query接受FTS5语法，非法语法直接报SQLite错误；None/空白query是资产列表，
不是全文匹配。现有unicode61不承诺任意中文子串分词。[I19]

需要从**现有FTS自持内容**重建倒排时，按[SCHEMA的rebuild代码](SCHEMA.md)执行。
rebuild不读取file_path，也不从assets补回缺失的FTS内容；新库正常经Repo导入后无需
额外手工rebuild。旧1.0库升级须先用FTS迁移器重建并重灌；当前1.2库不能倒跑该迁移。[I20]

## v0.4基线实数与读回

本轮用交接来源包、全新临时候选库重新导入，未操作实际业务库；源hash/mtime未变。
22个不同hash文件中，19内嵌、3个zip外置；assets=22、import事件=22、FTS=19，
event_atom_map=0。二次运行imported=0/skipped=22，行数不变。[I21]
命令和实际输出见[本轮数字与证据](W1D7-EVIDENCE.md)，不是产品库应硬编码成22行。[I22]

读回候选库（已经初始化且导入完成）可执行：[I23]

```sql
SELECT COUNT(*) FROM assets;
SELECT COUNT(*) FROM history_events WHERE event_type='import';
SELECT COUNT(*) FROM assets_fts;
SELECT COUNT(*) FROM assets WHERE content_blob IS NULL;
```

本包预期依次22、22、19、3。用AssetRepo.list_unindexed()读原metadata_json.path，
可看到三个历史zip的原相对文件名。[I24]

## 计划与未覆盖

导入器不负责所有文件类型识别、zip展开、原子主张提取、可信状态判定、对象垃圾回收，
也不把当前支持族查询当成候选关系/前端/真实协作已经交付。
本轮只修测试子进程cwd：从仓库外运行测试时让被测CLI从仓库根启动，
不表示CLI已安装为可从任意目录导入的系统包。[I25]
