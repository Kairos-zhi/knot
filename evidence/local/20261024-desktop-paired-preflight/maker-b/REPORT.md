# DESKTOP-018 Maker B

根仅新增固定文件只读数据预检与必要测试，没有改产品store或已有候选。入口固定D:/DSH-Desktop/kont-data/worksites.json，原路径只lstat/realpath/readFile；原锁存在即拒绝。未初始化原store，未写原文件／锁，未读DSH Session／凭据，不启停或更新Desktop。

独立Checker先审代码安全性无阻断后，根实际执行一次fixed-file probe。当前schema4、资产2项、Run0条；source SHA256=e0359bb66a44a41c082ab12c845cbea6a70435e5c9d6f7bc641277a16c3c79ac。报告仅hash／数量／固定标志，没有正文、对象ID或Run请求内容。完整报告见installed-data-report.json，生产迁移接受为false。

实际存储操作只在新建D:/Temp私人副本：014打开无损比较→普通draft编辑→017打开无损比较／编辑→014重开。完整canonical状态比较，只有副本刻意修改的单一draft及revision／seq被排除，其余asset/workspace/title/Run数据都须精确相等。源文件前双读及结束hash重核未变；临时副本关闭后安全核根清理。当前真实样本无Run，不能称真实Run恢复已验；含Run与五阶段保护分别由本卡合成测试和017覆盖。

聚焦3/3：有Run的合成样本副本往返／输出脱敏；unknown字段、坏journal或未来schema拒绝且不泄内容；空输入／非法JSON默认拒绝。所有断言不对真实state做值diff。没有model或网络请求，没有生产部署许可。Maker不能自验收，待live_runner_maker独立最终复核。
