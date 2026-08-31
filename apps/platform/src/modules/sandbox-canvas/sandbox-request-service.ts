import type { GraphModel } from '@secretflow/dag';
import { DefaultRequestService, NodeStatus } from '@secretflow/dag';
import { message } from 'antd';

import {
  DataComputeApi,
  responseData,
  type DataSandboxRecord,
} from '@/services/data-sandbox';
import { getModel } from '@/util/valtio-helper';

import { SandboxCanvasView } from './sandbox-canvas.view';

const statusToNodeStatus: Record<string, NodeStatus> = {
  PENDING: NodeStatus.pending,
  RUNNING: NodeStatus.running,
  SUCCEEDED: NodeStatus.success,
  FAILED: NodeStatus.failed,
  CANCELLED: NodeStatus.stopped,
};

const RUNNING_STATUSES = ['PENDING', 'RUNNING'];

export type SandboxGraphNode = GraphModel['nodes'][number] & {
  params?: Record<string, unknown>;
};

/**
 * 沙箱可视化画布的请求服务（@secretflow/dag RequestService 协议实现）。
 * dagId 即 computeCanvasId：queryDag/saveDag 读写 ds_compute_canvas.graph_json，
 * 运行/状态/节点输出/日志全部走 /data-compute/canvas/* 端点。
 */
export class SandboxGraphRequestService extends DefaultRequestService {
  private get view() {
    return getModel(SandboxCanvasView);
  }

  async queryDag(canvasId: string): Promise<GraphModel> {
    if (!canvasId) return { nodes: [], edges: [] };
    const list = responseData(await DataComputeApi.canvases(this.view.sandboxId), []);
    const canvas = list.find((c) => c.id === canvasId);
    if (!canvas) {
      return { nodes: [], edges: [] };
    }
    this.view.setCanvas(canvas);
    const model = graphJsonToModel(canvas.graph_json);
    this.view.recordHistory(model);
    return model;
  }

  async saveDag(canvasId: string, model: GraphModel): Promise<void> {
    const canvas = this.view.canvas;
    const graph = modelToGraphJson(model);
    await DataComputeApi.saveCanvas({
      id: canvasId,
      sandboxId: this.view.sandboxId,
      name: canvas?.name || '未命名画布',
      description: canvas?.description || '',
      graph,
      // 画布自动保存（拖拽/连线/配置）不生成版本快照；显式「保存」按钮 snapshot=true
      snapshot: false,
    });
    const version = Number(canvas?.version) || 0;
    this.view.setCanvas({ ...canvas, version: version + 1 });
    this.view.recordHistory(model);
    this.view.loadVersions();
  }

  /** 显式保存画布（生成版本记录）。 */
  async explicitSave() {
    const graph = this.context.graphManager.getGraphInstance();
    if (!graph) return;
    const model = x6GraphToModelSafe(graph);
    const canvas = this.view.canvas;
    const { status } = await DataComputeApi.saveCanvas({
      id: this.view.canvasId,
      sandboxId: this.view.sandboxId,
      name: canvas?.name || '未命名画布',
      description: canvas?.description || '',
      graph: modelToGraphJson(model),
      snapshot: true,
    });
    if (status?.code === 0) {
      message.success('画布已保存，版本 +1');
      this.view.setCanvas({
        ...canvas,
        version: (Number(canvas?.version) || 0) + 1,
      });
      this.view.loadVersions();
    } else {
      message.error(status?.msg || '保存失败');
      throw new Error(status?.msg || '保存失败');
    }
  }

  async startRun(canvasId: string, componentIds: string[]): Promise<void> {
    if (!canvasId || !componentIds || componentIds.length === 0) return;
    const graph = this.context.graphManager.getGraphInstance();
    const allNodeIds = graph?.getNodes().map((n) => n.id) || [];
    const isAll = componentIds.length === allNodeIds.length;
    const { status, data } = await DataComputeApi.canvasRun({
      canvasId,
      mode: isAll ? 'ALL' : 'ALL',
      nodeId: isAll ? '' : componentIds[0],
      nodeIds: componentIds,
    });
    if (status?.code === 0) {
      this.view.latestRun = data || null;
      this.view.loadRuns();
    } else {
      message.error(status?.msg || '执行失败');
    }
  }

  async stopRun(canvasId: string, componentId?: string): Promise<void> {
    const view = this.view;
    const runId = view.latestRun?.id || '';
    if (runId) {
      const { status } = await DataComputeApi.canvasStopRun({ runId });
      if (status?.code === 0) message.success('已停止执行');
      else message.error(status?.msg || '停止失败');
    }
    view.loadRuns();
  }

  async continueRun(canvasId: string, componentId?: string): Promise<void> {
    if (!componentId) return;
    const graph = this.context.graphManager.getGraphInstance();
    if (!graph) return;
    const nodeIds = collectDownstream(graph, componentId);
    await this.startRun(canvasId, nodeIds);
  }

  async queryStatus(canvasId: string) {
    if (!canvasId) return { nodeStatus: [], finished: true };
    const { status, data } = await DataComputeApi.canvasRunStatus(canvasId);
    if (status?.code !== 0 || !data) {
      return { nodeStatus: [], finished: true };
    }
    const run = data.run as DataSandboxRecord | null;
    this.view.latestRun = run;
    const nodes = (data.nodes || {}) as Record<string, DataSandboxRecord>;
    const nodeStatus = Object.entries(nodes).map(([nodeId, nr]) => ({
      nodeId,
      status: statusToNodeStatus[String(nr.status)] ?? NodeStatus.default,
      statusProcess: 0,
    }));
    const finished = !run || !RUNNING_STATUSES.includes(String(run.status));
    return { nodeStatus, finished };
  }

  async getMaxNodeIndex(dagId: string): Promise<number> {
    const graph = this.context.graphManager.getGraphInstance();
    const indices: number[] = [];
    if (graph) {
      graph.getNodes().forEach((n) => {
        const match = n.id.match(/^.*-node-(\d+)$/);
        if (match) indices.push(parseInt(match[1], 10));
      });
    }
    return indices.length ? Math.max(...indices) : 32;
  }
}

const x6GraphToModelSafe = (graph: any): GraphModel => {
  const nodes = graph.getNodes().map((node: any) => {
    const data = node.getData() || {};
    const pos = node.position();
    return {
      id: data.id,
      taskId: data.taskId || '',
      codeName: data.codeName,
      label: data.label,
      x: pos.x,
      y: pos.y,
      status: data.status,
      statusProcess: data.statusProcess || 0,
      params: data.params || {},
    } as unknown as GraphModel['nodes'][number];
  });
  const edges = graph.getEdges().map((edge: any) => ({
    id: `${edge.getSourceCellId()}-output-0__${edge.getTargetCellId()}-input-0`,
    source: edge.getSourceCellId(),
    sourceAnchor: `${edge.getSourceCellId()}-output-0`,
    target: edge.getTargetCellId(),
    targetAnchor: `${edge.getTargetCellId()}-input-0`,
  }));
  return { nodes, edges };
};

const collectDownstream = (graph: any, nodeId: string): string[] => {
  const result = new Set<string>([nodeId]);
  const frontier = new Set<string>([nodeId]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    graph.getEdges().forEach((edge: any) => {
      if (frontier.has(edge.getSourceCellId()) && !result.has(edge.getTargetCellId())) {
        result.add(edge.getTargetCellId());
        next.add(edge.getTargetCellId());
      }
    });
    frontier.clear();
    next.forEach((n) => frontier.add(n));
  }
  return Array.from(result);
};

/** 后端 graph_json（{nodes:[{id,data:{componentCode,name,params},position}],edges:[{source,target}]}）→ X6 模型。 */
export const graphJsonToModel = (graphJson: unknown): GraphModel => {
  const graph =
    typeof graphJson === 'string'
      ? (JSON.parse(graphJson || '{}') as Record<string, unknown>)
      : ((graphJson || {}) as Record<string, unknown>);
  const nodes = ((graph.nodes as unknown[]) || []).map((raw) => {
    const n = raw as Record<string, unknown>;
    const data = (n.data as Record<string, unknown>) || {};
    const pos = (n.position as Record<string, unknown>) || {};
    return {
      id: String(n.id || ''),
      taskId: '',
      codeName: String(data.componentCode || n.componentCode || ''),
      label: String(data.name || data.componentCode || n.id || ''),
      x: Number(pos.x) || 0,
      y: Number(pos.y) || 0,
      status: NodeStatus.default,
      statusProcess: 0,
      params: (data.params as Record<string, unknown>) || {},
      styles: { variant: 'sandbox' },
    } as unknown as GraphModel['nodes'][number];
  });
  const edges = ((graph.edges as unknown[]) || []).map((raw) => {
    const e = raw as Record<string, unknown>;
    const source = String(e.source || '');
    const target = String(e.target || '');
    return {
      id: `${source}-output-0__${target}-input-0`,
      source,
      sourceAnchor: `${source}-output-0`,
      target,
      targetAnchor: `${target}-input-0`,
    } as GraphModel['edges'][number];
  });
  return { nodes, edges };
};

/** X6 模型 → 后端 graph_json。 */
export const modelToGraphJson = (model: GraphModel) => ({
  nodes: model.nodes.map((n) => {
    const node = n as SandboxGraphNode;
    return {
      id: n.id,
      data: {
        componentCode: n.codeName,
        name: node.label || n.codeName,
        params: node.params || {},
      },
      position: { x: n.x, y: n.y },
    };
  }),
  edges: model.edges.map((e) => ({ source: e.source, target: e.target })),
});
