import { DAG, DefaultDataService } from '@secretflow/dag';
import type { GraphNode } from '@secretflow/dag';
import { ref } from 'valtio';

import { SandboxGraphRequestService } from './sandbox-request-service';
import { SandboxHookService } from './sandbox-hook-service';

/**
 * 沙箱数据服务：addNode 动作会丢失 params，这里在 addNodes 时
 * 从 X6 cell 上补回 params，保证节点参数随结构变化一起落库。
 */
class SandboxDataService extends DefaultDataService {
  async addNodes(nodes: GraphNode[]) {
    const graph = this.context.graphManager.getGraphInstance();
    nodes.forEach((node) => {
      const meta = node as GraphNode & { params?: Record<string, unknown> };
      if (!meta.params && graph) {
        const cell = graph.getCellById(node.id);
        const data = cell?.getData?.();
        meta.params = data?.params || {};
      }
    });
    return super.addNodes(nodes);
  }
}

/** 沙箱可视化建模画布实例：请求/端口/数据服务全部指向 data-compute canvas 端点。 */
class SandboxDag extends DAG {
  dataService: SandboxDataService = new SandboxDataService(this);
  requestService: SandboxGraphRequestService = new SandboxGraphRequestService(this);
  hookService: SandboxHookService = new SandboxHookService(this);
}

export const sandboxDag = ref(new SandboxDag());
