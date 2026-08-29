/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { nanoid } from 'nanoid';

import { FlowNodeRegistry } from '../../typings';
import { KnotNodeRender } from './render';
import { KNOT_INPUT_PORT, KNOT_OUTPUT_PORT } from '../../components/knot-edge/ports';

const KNOT_NODE_TYPE = 'knot';

let index = 0;

export const KnotNodeRegistry: FlowNodeRegistry = {
  type: KNOT_NODE_TYPE,
  meta: {
    size: {
      width: 280,
      height: 60,
    },
    renderKey: 'knot',
    defaultPorts: [KNOT_INPUT_PORT, KNOT_OUTPUT_PORT],
  },
  onAdd() {
    return {
      id: `knot_${nanoid(5)}`,
      type: KNOT_NODE_TYPE,
      data: {
        title: `结_${++index}`,
        summary: '摘要内容待补充',
        token: 0,
        src: 'user',
        chain_id: `chain_${nanoid(5)}`,
      },
      meta: {
        position: {
          x: 0,
          y: 0,
        },
      },
    };
  },
  formMeta: {
    render: () => <></>,
  },
  getInputPoints: () => [],
  getOutputPoints: () => [],
  renderComponent: KnotNodeRender,
};
