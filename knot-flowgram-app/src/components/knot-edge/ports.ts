/**
 * knot 端口定义
 * 绳线渲染的前提：两端端口必须在节点 meta.defaultPorts 注册，
 * 且 portID 与 KnotEdge 的 sourcePortID/targetPortID 一一对应
 * （FreeLinesPlugin 内部经 node.ports.getPortEntityByKey('output'/'input', portID) 解析）
 */
import { WorkflowPort } from '@flowgram.ai/free-layout-core';

/** 输入端口：左侧，小热区（克制小圆点） */
export const KNOT_INPUT_PORT: WorkflowPort = {
  portID: 'in',
  type: 'input',
  location: 'left',
  size: { width: 8, height: 8 },
};

/** 输出端口：右侧，小热区 */
export const KNOT_OUTPUT_PORT: WorkflowPort = {
  portID: 'out',
  type: 'output',
  location: 'right',
  size: { width: 8, height: 8 },
};
