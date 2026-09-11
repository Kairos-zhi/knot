import {
  definePluginCreator,
  FreeLayoutPluginContext,
  PluginCreator,
} from '@flowgram.ai/free-layout-editor';

import {
  KnotCanvasBridgeConfig,
  KnotCanvasBridgeService,
} from '../../services/knot-canvas-bridge-service';

export type CanvasBridgePluginOptions = KnotCanvasBridgeConfig;

export const createCanvasBridgePlugin: PluginCreator<CanvasBridgePluginOptions> =
  definePluginCreator<CanvasBridgePluginOptions, FreeLayoutPluginContext>({
    onReady(ctx, options) {
      const bridge = ctx.get(KnotCanvasBridgeService);
      bridge.startFromHostConfig(options);
      ctx.playground.toDispose.push({
        dispose: () => bridge.stop(),
      });
    },
  });
