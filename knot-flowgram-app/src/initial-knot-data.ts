/**
 * Initial Knot Data
 * 示例数据：3 个结 + 2 条绳
 * 演示 knot 思考链资产化的基本形态
 */

import {
  KnotFlowDocument,
  createKnotNode,
  createKnotEdge,
} from './knot-model';

export const initialKnotData: KnotFlowDocument = {
  nodes: [
    // 第一个结：问题定义
    createKnotNode(
      'knot_1',
      '问题定义',
      '用户希望构建一个对话思考链资产化工具，把零散的对话节点转换为可编排的资产',
      128,
      'session:20260830-001',
      'chain_knot_v1',
      200,
      150
    ),

    // 第二个结：技术方案
    createKnotNode(
      'knot_2',
      '技术方案',
      '选择 FlowGram.AI 作为画布基底，提供节点编排 + 路径执行的核心能力，支持 Free Layout 模式自由排列',
      256,
      'session:20260830-001',
      'chain_knot_v1',
      600,
      150
    ),

    // 第三个结：实现路线
    createKnotNode(
      'knot_3',
      '实现路线',
      '地基阶段：搭建最小骨架（FlowGram 集成 + knot 数据模型）；第二阶段：UI 交互设计（节点操作、路径可视化）；第三阶段：社区特性（分享、协作）',
      384,
      'session:20260830-001',
      'chain_knot_v1',
      1000,
      150
    ),
  ],
  edges: [
    // 绳 1：问题定义 -> 技术方案
    createKnotEdge('knot_1', 'knot_2', 'out_solution', 'in_problem'),

    // 绳 2：技术方案 -> 实现路线
    createKnotEdge('knot_2', 'knot_3', 'out_roadmap', 'in_approach'),
  ],
};

/**
 * 示例二：更复杂的多链场景
 * 可选：展示多个思考链的分支合并
 */
export const complexKnotData: KnotFlowDocument = {
  nodes: [
    createKnotNode(
      'knot_a1',
      '需求收集',
      '从用户反馈和市场调研中提取核心需求',
      100,
      'workshop:design-sprint-1',
      'chain_design',
      100,
      100
    ),
    createKnotNode(
      'knot_a2',
      '概念设计',
      '绘制原型和交互流程',
      200,
      'workshop:design-sprint-1',
      'chain_design',
      400,
      100
    ),
    createKnotNode(
      'knot_b1',
      '技术评审',
      '评估技术可行性和性能约束',
      150,
      'tech-review:arch-01',
      'chain_tech',
      100,
      300
    ),
    createKnotNode(
      'knot_b2',
      '架构设计',
      '定义系统架构和模块划分',
      250,
      'tech-review:arch-01',
      'chain_tech',
      400,
      300
    ),
    createKnotNode(
      'knot_merge',
      '综合决策',
      '结合设计和技术方案，制定最终的执行计划',
      300,
      'steering-committee:20260830',
      'chain_merged',
      700,
      200
    ),
  ],
  edges: [
    // 设计链
    createKnotEdge('knot_a1', 'knot_a2', 'out', 'in'),
    // 技术链
    createKnotEdge('knot_b1', 'knot_b2', 'out', 'in'),
    // 合并点
    createKnotEdge('knot_a2', 'knot_merge', 'out_design', 'in_design'),
    createKnotEdge('knot_b2', 'knot_merge', 'out_tech', 'in_tech'),
  ],
};
