# KONT-DESKTOP-015 · 旧已安装代码回滚候选

授权：之“快步推进”接续DESKTOP-014的下一步。基线338ef08；本卡只读捕获旧安装代码、原安装spec与选择状态，并在新临时profile隔离验证可重装。不更新／重启在用Desktop，不读凭据／会话／用户资产，不调用模型，不推送或合并。

既查：开发基准、STATE／QUEUE、DESKTOP-014部署方案与官方PluginManager 0.2.1-rc.2源码。成熟机制复用官方manager的本地bundle解析、兼容闸门与安装；补缺为旧已安装字节留存和可信hash，不能把已变化repo上的旧file spec当回滚代码。无新UI，沿用Apple与共用内核基准。

实际源：D:/DSH-Desktop/home/profiles/desktop/node_modules/@kont/{desktop-bundle,dsh-plugin}。初查12个代码文件；bundle现有file:../dsh-plugin、plugin无额外dependencies，原peer同时支持0.1.7-rc.2与0.2.1-rc.2。本次保留原package与代码字节，不扩大兼容范围。原spec与选择状态只作为持久配置证据，不能称本轮查询了live active fiber。

拆卡：A=prepare-desktop-rollback.mjs及必要测试，源与候选逐项hash、拒绝输出覆盖／路径逃逸／额外依赖／漂移；B=verify-desktop-rollback.cjs及官方离线隔离安装／复制字节／旧runtime与renderer验证；根=窄元数据捕获与中控记录；独立Checker在冻结后复核。允许文件为上述scripts/tests、本卡、STATE／QUEUE、research方案及evidence/local/20261024-desktop-rollback。旧014证据不改写。

验收方法：原安装12项→回滚候选→官方manager临时profile复制包三方逐字节核对；官方版本闸门保持；旧kernel/auth/SSE/disposal/durable读回和renderer工厂验证。聚焦测试足够，不重复全量或截图点击。archive_id=kont-desktop-rollback-20261024。

边界：代码回滚包不含用户数据回滚。隔离安装／runtime apply不等于在用Desktop降级、真实ReactDOM或人的体验接受；实际更新与正常重启另行授权后执行。RUN-011单次模型授权已消费，新增模型调用0。

制作回收：A build0＋4/4；B指定实际旧candidate官方离线隔离3/3。12项旧安装字节及2项原package均保留；manifest SHA256=d5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336，实际包无需转换，代码／package／peer字节不变。源完整库存与12项字节二次核验，profile metadatahash稳定。

七格收口：目标＝真实旧installed代码留样与隔离可重装；回收＝A/B冻结、独立Checker完成；证据＝evidence/DESKTOP-015-INDEX.json与Z/checker/final-review.json；验收＝ACCEPT_INSTALLED_CODE_ROLLBACK_CANDIDATE_LIMITED，无阻断，15冻结项／旧12项／原package2项一致，独立指定候选7/7；入档＝本卡与STATE／QUEUE；记录＝一次本地提交，无模型／在用profile写／桌面启停／push／合并；未决＝持久配置不是live active证明，旧代码可重装不是新数据降级或生产回滚。下一步适配管理工具的已审候选spec和数据兼容预检，正式安装另行核准；人的UI体验仍未接受。
