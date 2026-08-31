import type { GraphModel } from '@secretflow/dag';
import { ActionType } from '@secretflow/dag';
import { message } from 'antd';
import { parse } from 'query-string';

import {
  DataComputeApi,
  responseData,
  type DataSandboxRecord,
} from '@/services/data-sandbox';
import { Model, getModel } from '@/util/valtio-helper';

import { sandboxDag } from './sandbox-dag';

/** 右侧抽屉类型：节点配置 / 节点输出 / 节点日志 / 模板库 / 版本管理 / 运行记录 */
export type SandboxDrawerType =
  | ''
  | 'config'
  | 'output'
  | 'logs'
  | 'templates'
  | 'versions'
  | 'records';

export class SandboxCanvasView extends Model {
  canvasId = '';
  sandboxId = '';
  projectId = '';

  canvas: DataSandboxRecord = {};
  components: DataSandboxRecord[] = [];
  resources: DataSandboxRecord[] = [];
  /** tableName -> columns（数据资源节点 table 选择与列选择的候选） */
  resourceColumns: Record<string, string[]> = {};
  templates: DataSandboxRecord[] = [];
  versions: DataSandboxRecord[] = [];
  runs: DataSandboxRecord[] = [];

  latestRun: DataSandboxRecord | null = null;
  selectedNodeId = '';
  selectedRunId = '';
  drawer: SandboxDrawerType = '';

  /** 图级 undo/redo：graph 结构快照栈（X6 toJSON 字符串） */
  historyStack: string[] = [];
  historyIndex = -1;
  private ignoreNextHistory = false;
  private historyTimer = 0;
  private lastHistoryJson = '';

  constructor() {
    super();
    const { computeCanvasId, sandboxId, projectId } = parse(window.location.search) as {
      computeCanvasId?: string;
      sandboxId?: string;
      projectId?: string;
    };
    this.canvasId = computeCanvasId || '';
    this.sandboxId = sandboxId || '';
    this.projectId = projectId || '';
  }

  /** 路由切换沙箱或画布时清空上一画布的共享状态，避免跨沙箱复用。 */
  setContext(canvasId: string, sandboxId: string, projectId: string) {
    const changed =
      this.canvasId !== canvasId ||
      this.sandboxId !== sandboxId ||
      this.projectId !== projectId;
    this.canvasId = canvasId;
    this.sandboxId = sandboxId;
    this.projectId = projectId;
    if (!changed) return;
    this.canvas = {};
    this.components = [];
    this.resources = [];
    this.resourceColumns = {};
    this.versions = [];
    this.runs = [];
    this.latestRun = null;
    this.selectedNodeId = '';
    this.selectedRunId = '';
    this.drawer = '';
    this.historyStack = [];
    this.historyIndex = -1;
  }

  /** 进入画布时一次性加载组件库 / 数据资源 / 模板 / 版本 / 运行记录 */
  async init() {
    await Promise.all([
      this.loadComponents(),
      this.loadResources(),
      this.loadTemplates(),
      this.loadVersions(),
      this.loadRuns(),
    ]);
  }

  async loadComponents() {
    if (!this.sandboxId) return;
    this.components = responseData(await DataComputeApi.components(this.sandboxId), []);
  }

  async loadResources() {
    if (!this.sandboxId) return;
    const res = responseData(
      await DataComputeApi.canvasDataResources(this.sandboxId),
      {},
    );
    this.resources = res.resources || [];
    const map: Record<string, string[]> = {};
    this.resources.forEach((r) => {
      if (r.tableName) map[r.tableName] = r.columns || [];
    });
    this.resourceColumns = map;
  }

  async loadTemplates() {
    this.templates = responseData(await DataComputeApi.canvasTemplates(), []);
  }

  async loadVersions() {
    if (!this.canvasId) return;
    this.versions = responseData(
      await DataComputeApi.canvasVersions(this.canvasId),
      [],
    );
  }

  async loadRuns() {
    if (!this.canvasId) return;
    this.runs = responseData(await DataComputeApi.canvasRuns(this.canvasId), []);
  }

  setCanvas(canvas: DataSandboxRecord) {
    this.canvas = canvas;
  }

  openDrawer(type: SandboxDrawerType, nodeId = '', runId = '') {
    this.selectedNodeId = nodeId;
    this.selectedRunId = runId;
    this.drawer = type;
  }

  closeDrawer() {
    this.drawer = '';
    this.selectedRunId = '';
  }

  /* ============================== 运行控制 ============================== */

  async runAll() {
    await this.runGraph('ALL');
  }

  async runNode(nodeId: string) {
    await this.runGraph('SINGLE', nodeId);
  }

  async runDown(nodeId: string) {
    await this.runGraph('DOWN', nodeId);
  }

  async runUp(nodeId: string) {
    await this.runGraph('UP', nodeId);
  }

  private async runGraph(mode: string, nodeId = '') {
    if (!this.canvasId) return;
    const { status, data } = await DataComputeApi.canvasRun({
      canvasId: this.canvasId,
      mode,
      nodeId,
    });
    if (status?.code === 0) {
      this.latestRun = data || null;
      message.success(mode === 'ALL' ? '整图运行已提交' : `节点执行已提交（${mode}）`);
      // 触发 X6 节点状态着色轮询（QueryStatusAction 自身每 2s 自轮询直至 finished）
      sandboxDag.graphManager.executeAction(ActionType.queryStatus);
      this.loadRuns();
    } else {
      message.error(status?.msg || '执行失败');
    }
  }

  async stopRun() {
    const runId = this.latestRun?.id || '';
    if (!runId) {
      const running = this.runs.find((r) => ['PENDING', 'RUNNING'].includes(r.status));
      if (running) {
        const { status } = await DataComputeApi.canvasStopRun({ runId: running.id });
        if (status?.code === 0) message.success('已停止执行');
        else message.error(status?.msg || '停止失败');
        this.loadRuns();
        return;
      }
      message.warning('当前没有运行中的画布任务');
      return;
    }
    const { status } = await DataComputeApi.canvasStopRun({ runId });
    if (status?.code === 0) {
      message.success('已停止执行');
    } else {
      message.error(status?.msg || '停止失败');
    }
    this.loadRuns();
  }

  async refreshStatus() {
    if (!this.canvasId) return;
    sandboxDag.graphManager.executeAction(ActionType.queryStatus);
  }

  /* ============================== 撤销 / 重做 ============================== */

  /**
   * 结构快照入栈（由 requestService.saveDag 在结构变化后调用）。
   * 拖拽连线等高频保存以 400ms 去重合并，避免每次像素移动都生成一个历史点。
   */
  recordHistory(model: { nodes: unknown[]; edges: unknown[] }) {
    if (this.ignoreNextHistory) return;
    const json = JSON.stringify({ nodes: model.nodes, edges: model.edges });
    if (json === this.lastHistoryJson) return;
    this.lastHistoryJson = json;
    if (this.historyTimer) window.clearTimeout(this.historyTimer);
    this.historyTimer = window.setTimeout(() => {
      const graph = sandboxDag.graphManager.getGraphInstance();
      const snapshot = graph ? JSON.stringify(graph.toJSON()) : json;
      if (snapshot === this.historyStack[this.historyIndex]) return;
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      this.historyStack.push(snapshot);
      this.historyIndex = this.historyStack.length - 1;
      if (this.historyStack.length > 60) {
        this.historyStack.shift();
        this.historyIndex = this.historyStack.length - 1;
      }
    }, 400);
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex >= 0 && this.historyIndex < this.historyStack.length - 1;
  }

  async undo() {
    if (!this.canUndo()) return;
    this.historyIndex -= 1;
    await this.restoreHistory();
  }

  async redo() {
    if (!this.canRedo()) return;
    this.historyIndex += 1;
    await this.restoreHistory();
  }

  private async restoreHistory() {
    const graph = sandboxDag.graphManager.getGraphInstance();
    if (!graph) return;
    const json = this.historyStack[this.historyIndex];
    graph.fromJSON(JSON.parse(json));
    // 从 X6 快照同步 dataService 模型并持久化（避免再次入栈）
    const model = x6GraphToModel(graph);
    const ds = sandboxDag.dataService;
    (ds as { nodes: typeof model.nodes }).nodes = model.nodes;
    (ds as { edges: typeof model.edges }).edges = model.edges;
    this.ignoreNextHistory = true;
    try {
      await sandboxDag.requestService.saveDag(this.canvasId, model);
    } finally {
      this.ignoreNextHistory = false;
    }
  }
}

/** X6 graph → dataService 模型（undo/redo 恢复用）。 */
export const x6GraphToModel = (graph: any): GraphModel => {
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
  const edges = graph.getEdges().map(
    (edge: any) =>
      ({
        id: `${edge.getSourceCellId()}-output-0__${edge.getTargetCellId()}-input-0`,
        source: edge.getSourceCellId(),
        sourceAnchor: `${edge.getSourceCellId()}-output-0`,
        target: edge.getTargetCellId(),
        targetAnchor: `${edge.getTargetCellId()}-input-0`,
      } as GraphModel['edges'][number]),
  );
  return { nodes, edges };
};
