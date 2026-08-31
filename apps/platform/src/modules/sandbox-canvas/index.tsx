import { ActionType, NodeStatus, Portal, ShowMenuContext } from '@secretflow/dag';
import type { Node } from '@antv/x6';
import {
  ArrowLeftOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import type { GraphEventHandlerProtocol } from '@secretflow/dag';
import {
  Button,
  Alert,
  Checkbox,
  Collapse,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { parse } from 'query-string';
import { useEffect, useRef, useState } from 'react';
import { history } from 'umi';

import { Platform } from '@/components/platform-wrapper';
import { LoginService } from '@/modules/login/login.service';
import {
  DataComputeApi,
  responseData,
  type DataSandboxRecord,
} from '@/services/data-sandbox';
import { getModel, useModel } from '@/util/valtio-helper';

import { formatTime } from '../data-sandbox-mvp/common';

import { NodeConfigDrawer } from './node-config-drawer';
import { NodeDrawer } from './node-drawer';
import { sandboxDag } from './sandbox-dag';
import { SandboxCanvasView } from './sandbox-canvas.view';
import { TablePreviewModal } from './table-preview-modal';
import { TemplateDrawer } from './template-drawer';
import { VersionsDrawer } from './versions-drawer';
import styles from './index.less';

const CATEGORY_ORDER = ['数据输入', '数据处理', '特征工程', '统计分析', '机器学习'];

const METRIC_LABELS: Record<string, string> = {
  accuracy: '准确率 Accuracy',
  precision: '精确率 Precision',
  recall: '召回率 Recall',
  f1: 'F1',
  auc: 'AUC',
  confusionMatrix: '混淆矩阵',
  mae: 'MAE',
  rmse: 'RMSE',
  r2: 'R²',
};

const SECTION_LABELS: Record<string, string> = {
  featureImportance: '特征重要性',
  treeStructure: '树结构',
  scorecard: '评分卡',
};

const X6ReactPortalProvider = Portal.getProvider();

class SandboxGraphEventHandler implements GraphEventHandlerProtocol {
  onNodeClick = (node: Node) => {
    const data = node.getData();
    if (!data?.codeName) return;
    getModel(SandboxCanvasView).openDrawer('config', data.id);
  };

  onBlankClick = () => {
    getModel(SandboxCanvasView).closeDrawer();
  };
}

const eventHandler = new SandboxGraphEventHandler();

export const SandboxCanvasWorkspace = () => {
  const view = useModel(SandboxCanvasView);
  const loginService = useModel(LoginService);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    computeCanvasId,
    sandboxId: routeSandboxId,
    projectId: routeProjectId,
  } = parse(window.location.search) as {
    computeCanvasId?: string;
    sandboxId?: string;
    projectId?: string;
  };
  const canvasId = computeCanvasId || '';
  const sandboxId = routeSandboxId || '';
  const projectId = routeProjectId || '';
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelCandidates, setModelCandidates] = useState<DataSandboxRecord[]>([]);
  const [modelForm] = Form.useForm();
  // 数据表预览（数据资源 / 画布中间结果 预览按钮）
  const [preview, setPreview] = useState<{ tableName: string; title: string } | null>(
    null,
  );
  // 保存模型：选中的工作流最终输出节点
  const selectedResultNodeId = Form.useWatch('nodeId', modelForm);
  const visibleSections = Form.useWatch('visibleSections', modelForm) as
    | string[]
    | undefined;

  const applyCandidateDefaults = (candidate?: DataSandboxRecord) => {
    modelForm.setFieldsValue({
      visibleMetrics: (candidate?.available_metrics as string[]) || [],
      visibleSections: (candidate?.available_sections as string[]) || [],
      positiveLabel: '1',
      threshold: 0.5,
      baseScore: 600,
      pdo: 20,
      baseOdds: 20,
      scoreMin: 300,
      scoreMax: 900,
      higherScoreForHigherPrediction: true,
    });
  };

  const goBack = async () => {
    const userInfo = await loginService.getUserInfo();
    // /edge 路由要求 URL 携带 ownerId，缺失会被鉴权 wrapper 重定向到登录页
    if (userInfo?.platformType !== Platform.AUTONOMY || !userInfo?.ownerId) {
      history.push('/home?tab=project-management');
      return;
    }
    const target = new URLSearchParams({
      ownerId: userInfo.ownerId,
      tab: 'data-compute',
      workspace: 'visual',
      projectId: view.projectId,
      sandboxId: view.sandboxId,
    });
    history.push(`/edge?${target.toString()}`);
  };

  // 初始化画布：canvasId 变化时重建 X6 graph（请求服务指向 data-compute canvas 端点）
  useEffect(() => {
    if (!canvasId) return;
    view.setContext(canvasId, sandboxId, projectId);
    sandboxDag.dispose();
    sandboxDag.addGraphEvents(eventHandler);
    const el = containerRef.current;
    if (!el) return;
    const { clientWidth, clientHeight } = el;
    sandboxDag.init(
      canvasId,
      {
        container: el,
        width: clientWidth || 1000,
        height: clientHeight || 800,
        background: { color: '#f7f9fc' },
      },
      'FULL',
    );
    view.init();
    return () => {
      sandboxDag.dispose();
    };
  }, [canvasId, sandboxId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 画布随容器尺寸缩放
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      const graph = sandboxDag.graphManager.getGraphInstance();
      const el = containerRef.current;
      if (graph && el) graph.resize(el.clientWidth, el.clientHeight);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canvasId]);

  const exec = (type: ActionType, ...args: unknown[]) => {
    sandboxDag.graphManager.executeAction(type as never, ...args);
  };

  const addNode = async (
    codeName: string,
    label: string,
    params: Record<string, unknown>,
  ) => {
    const graph = sandboxDag.graphManager.getGraphInstance();
    if (!graph) return;
    const maxIdx = await sandboxDag.requestService.getMaxNodeIndex(view.canvasId);
    const nodeId = `${view.canvasId}-node-${maxIdx + 1}`;
    const ports = await sandboxDag.hookService.createPort(nodeId, codeName);
    const outputs = await sandboxDag.hookService.createResult(nodeId, codeName);
    const node = graph.createNode({
      id: nodeId,
      shape: 'dag-node',
      width: 220,
      height: 52,
      x: 60 + (maxIdx % 4) * 250,
      y: 80 + Math.floor((maxIdx % 12) / 4) * 130,
      ports,
      data: {
        id: nodeId,
        codeName,
        label,
        status: NodeStatus.default,
        statusProcess: 0,
        outputs,
        params,
        styles: { variant: 'sandbox' },
      },
    });
    graph.addNode(node);
    sandboxDag.graphManager.executeAction(ActionType.queryStatus as never);
  };

  const startDrag = (codeName: string, label: string, e: React.MouseEvent) => {
    sandboxDag.graphManager.executeAction(
      ActionType.dragNode as never,
      {
        codeName,
        label,
        status: NodeStatus.default,
        statusProcess: 0,
        styles: { variant: 'sandbox' },
      },
      e.nativeEvent,
    );
  };

  const openSaveModel = async () => {
    try {
      await sandboxDag.requestService.explicitSave();
      const candidates = responseData(
        await DataComputeApi.canvasModelCandidates(view.canvasId),
        [],
      );
      setModelCandidates(candidates);
      const defaultCandidate = candidates.length === 1 ? candidates[0] : undefined;
      modelForm.setFieldsValue({
        name: `${String(view.canvas.name || '未命名画布')}-模型`,
        description: String(view.canvas.description || ''),
        nodeId: defaultCandidate?.node_id,
      });
      applyCandidateDefaults(defaultCandidate);
      setModelOpen(true);
    } catch (error: any) {
      message.error(error.message || '加载模型信息失败');
    }
  };

  const saveModel = async () => {
    const values = await modelForm.validateFields();
    setModelSaving(true);
    try {
      const saved = responseData(
        await DataComputeApi.saveCanvasModel({
          canvasId: view.canvasId,
          name: values.name,
          description: values.description || '',
          nodeId: values.nodeId || '',
          modelId: values.modelId || '',
          reportConfig: {
            visibleMetrics: values.visibleMetrics || [],
            visibleSections: values.visibleSections || [],
            positiveLabel: values.positiveLabel || '1',
            threshold: values.threshold ?? 0.5,
            scorecard: {
              enabled: (values.visibleSections || []).includes('scorecard'),
              baseScore: values.baseScore ?? 600,
              pdo: values.pdo ?? 20,
              baseOdds: values.baseOdds ?? 20,
              scoreMin: values.scoreMin ?? 300,
              scoreMax: values.scoreMax ?? 900,
              higherScoreForHigherPrediction:
                values.higherScoreForHigherPrediction ?? true,
            },
          },
        }),
        {},
      );
      message.success(
        saved.status === 'READY'
          ? '工作流模型已保存，可在自定义算法中发布 API'
          : '工作流快照已保存；成功运行训练组件后请再次保存为可发布模型',
      );
      setModelOpen(false);
    } catch (error: any) {
      message.error(error.message || '保存模型失败');
    } finally {
      setModelSaving(false);
    }
  };

  const groupedComponents = () => {
    const groups: { category: string; items: DataSandboxRecord[] }[] = [];
    const order = CATEGORY_ORDER;
    order.forEach((cat) => {
      const items = view.components.filter((c) => c.category === cat);
      if (items.length) groups.push({ category: cat, items });
    });
    const rest = view.components.filter((c) => !order.includes(c.category));
    if (rest.length) groups.push({ category: '其他', items: rest });
    return groups;
  };

  const parseDefaults = (op: DataSandboxRecord) => {
    try {
      const parsed = JSON.parse(String(op.default_params_json || '{}'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  // 保存模型：工作流输入数据（首个候选携带）与选中的工作流输出结果
  const workflowInput = modelCandidates[0]
    ? {
        table: String(modelCandidates[0].input_table || ''),
        columns: (modelCandidates[0].input_columns as string[]) || [],
      }
    : null;
  const selectedCandidate = modelCandidates.find(
    (c) => String(c.node_id) === String(selectedResultNodeId),
  );

  const leftItems = [
    {
      key: 'components',
      label: '组件库',
      children: (
        <div>
          {view.components.length === 0 && <Empty description="加载中…" />}
          <Collapse
            defaultActiveKey={['数据输入', '数据处理', '特征工程']}
            ghost
            size="small"
            items={groupedComponents().map((g) => ({
              key: g.category,
              label: `${g.category}（${g.items.length}）`,
              children: (
                <List
                  size="small"
                  dataSource={g.items}
                  renderItem={(op) => (
                    <List.Item
                      style={{ cursor: 'grab' }}
                      onMouseDown={(e) =>
                        startDrag(String(op.code), String(op.name), e)
                      }
                      onDoubleClick={() =>
                        addNode(String(op.code), String(op.name), parseDefaults(op))
                      }
                    >
                      <List.Item.Meta
                        title={
                          <Space size={4}>
                            {op.name}
                            {op.train ? <Tag color="green">训练</Tag> : null}
                          </Space>
                        }
                        description={String(op.description || '')}
                      />
                    </List.Item>
                  )}
                />
              ),
            }))}
          />
        </div>
      ),
    },
    {
      key: 'resources',
      label: '数据资源',
      children: (
        <div>
          <Tooltip title="点击挂载表 → 生成数据资源节点（可拖到画布中央）">
            <List
              size="small"
              dataSource={view.resources.filter((r) => r.kind === 'MOUNT')}
              renderItem={(r) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  actions={[
                    <Button
                      key="preview"
                      size="small"
                      type="text"
                      icon={<EyeOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview({
                          tableName: String(r.tableName),
                          title: `数据预览：${String(r.name)}`,
                        });
                      }}
                    >
                      预览
                    </Button>,
                  ]}
                  onClick={() =>
                    addNode('data.table', `数据-${String(r.name)}`, {
                      table: r.tableName,
                    })
                  }
                >
                  <List.Item.Meta
                    title={<Tag color="blue">{String(r.name)}</Tag>}
                    description={
                      <span style={{ fontSize: 12 }}>
                        {String(r.tableName)} ·{' '}
                        {Array.isArray(r.columns) ? `${r.columns.length} 列` : ''}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.back} onClick={goBack}>
          <ArrowLeftOutlined />
        </span>
        <Divider type="vertical" />
        <span className={styles.title}>可视化建模</span>
        <Input
          className={styles.canvasName}
          value={String(view.canvas.name || '')}
          placeholder="画布名称"
          onChange={(e) => view.setCanvas({ ...view.canvas, name: e.target.value })}
        />
        <Tag color="green" style={{ marginLeft: 8 }}>
          v{String(view.canvas.version || 1)}
        </Tag>
        <span className={styles.spacer} />
        <Space size={4}>
          <Tooltip title="保存（生成版本记录）">
            <Button
              size="small"
              icon={<SaveOutlined />}
              onClick={() => sandboxDag.requestService.explicitSave()}
            >
              保存
            </Button>
          </Tooltip>
          <Tooltip title="保存当前工作流拓扑及可执行训练结果">
            <Button size="small" onClick={openSaveModel}>
              保存为模型
            </Button>
          </Tooltip>
          <Tooltip title="整图运行">
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => view.runAll()}
            >
              整图运行
            </Button>
          </Tooltip>
          <Tooltip title="停止运行">
            <Button
              size="small"
              icon={<StopOutlined />}
              onClick={() => view.stopRun()}
            />
          </Tooltip>
          <Divider type="vertical" />
          <Tooltip title="撤销">
            <Button
              size="small"
              icon={<UndoOutlined />}
              disabled={!view.canUndo()}
              onClick={() => view.undo()}
            />
          </Tooltip>
          <Tooltip title="重做">
            <Button
              size="small"
              icon={<RedoOutlined />}
              disabled={!view.canRedo()}
              onClick={() => view.redo()}
            />
          </Tooltip>
          <Tooltip title="刷新状态">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => view.refreshStatus()}
            />
          </Tooltip>
          <Divider type="vertical" />
          <Button size="small" onClick={() => view.openDrawer('templates')}>
            模板导入
          </Button>
          <Button size="small" onClick={() => view.openDrawer('versions')}>
            版本
          </Button>
          <Button size="small" onClick={() => view.openDrawer('records')}>
            运行记录
          </Button>
        </Space>
      </div>
      <div className={styles.body}>
        <div className={styles.left}>
          <Tabs size="small" items={leftItems} />
        </div>
        <div className={styles.center}>
          <ShowMenuContext.Provider value={false}>
            <X6ReactPortalProvider />
          </ShowMenuContext.Provider>
          <div className={styles.graph} ref={containerRef} />
          <div className={styles.zoomBar}>
            <Tooltip title="放大">
              <Button
                size="small"
                icon={<ZoomInOutlined />}
                onClick={() => exec(ActionType.zoomIn)}
              />
            </Tooltip>
            <Tooltip title="缩小">
              <Button
                size="small"
                icon={<ZoomOutOutlined />}
                onClick={() => exec(ActionType.zoomOut)}
              />
            </Tooltip>
            <Button size="small" onClick={() => exec(ActionType.zoomToFit)}>
              适应画布
            </Button>
          </div>
        </div>
      </div>
      <RecordsDrawer />
      <Modal
        title="保存工作流为模型"
        open={modelOpen}
        confirmLoading={modelSaving}
        onOk={saveModel}
        onCancel={() => setModelOpen(false)}
        destroyOnClose
        width={680}
      >
        {!modelCandidates.length && (
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 16 }}
            message="当前没有可发布的训练结果"
            description="可以先保存工作流拓扑；整图运行并成功生成训练模型后，再次保存即可用于 API 发布。"
          />
        )}
        <Form form={modelForm} layout="vertical">
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="nodeId" label="训练结果（发布 API 时必选）">
            <Select
              allowClear
              placeholder="选择最近一次成功运行的训练节点"
              onChange={(value) =>
                applyCandidateDefaults(
                  modelCandidates.find(
                    (item) => String(item.node_id) === String(value),
                  ),
                )
              }
              options={modelCandidates.map((item) => ({
                value: item.node_id,
                label: `${item.node_name}输出（${item.component_code}）${
                  item.model_id ? ' · 可执行' : ''
                }`,
              }))}
            />
          </Form.Item>
          {(workflowInput || selectedCandidate) && (
            <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
              {workflowInput && workflowInput.table && (
                <Descriptions.Item label="工作流输入数据">
                  <Tag color="blue">{workflowInput.table}</Tag>
                  <span style={{ fontSize: 12, marginLeft: 8 }}>
                    {workflowInput.columns.length} 列：
                    {workflowInput.columns.join(', ')}
                  </span>
                </Descriptions.Item>
              )}
              {selectedCandidate && (
                <Descriptions.Item label="工作流输出结果">
                  <Tag color="green">{selectedCandidate.node_name}输出</Tag>
                  <span style={{ fontSize: 12, marginLeft: 8 }}>
                    {String(selectedCandidate.output_table || '')} ·{' '}
                    {selectedCandidate.model_id
                      ? '可执行（可发布 API）'
                      : '快照（无可执行模型）'}
                  </span>
                </Descriptions.Item>
              )}
            </Descriptions>
          )}
          {selectedCandidate?.model_id && (
            <>
              <Alert
                showIcon
                type="info"
                style={{ marginBottom: 16 }}
                message="系统将计算全部适用指标"
                description="以下配置仅控制模型报告展示内容，未勾选的指标仍会计算并保存。"
              />
              <Descriptions
                bordered
                column={2}
                size="small"
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item label="任务类型">
                  {selectedCandidate.task_type === 'REGRESSION' ? '回归' : '分类'}
                </Descriptions.Item>
                <Descriptions.Item label="模型类型">
                  {selectedCandidate.model_category === 'TREE' ? '树模型' : '普通模型'}
                </Descriptions.Item>
                <Descriptions.Item label="算法">
                  {String(selectedCandidate.component_code || '-')}
                </Descriptions.Item>
                <Descriptions.Item label="标签列">
                  {String(selectedCandidate.label || '-')}
                </Descriptions.Item>
              </Descriptions>
              <Divider orientation="left">模型评估指标</Divider>
              <Form.Item
                name="visibleMetrics"
                rules={[
                  {
                    validator: (_, value) =>
                      Array.isArray(value) && value.length
                        ? Promise.resolve()
                        : Promise.reject(new Error('至少选择一个展示指标')),
                  },
                ]}
              >
                <Checkbox.Group
                  options={(
                    (selectedCandidate.available_metrics as string[]) || []
                  ).map((metric) => ({
                    label: METRIC_LABELS[metric] || metric,
                    value: metric,
                  }))}
                />
              </Form.Item>
              {selectedCandidate.task_type === 'CLASSIFICATION' && (
                <Space size={16} align="start">
                  <Form.Item name="positiveLabel" label="正类标签">
                    <Input style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item name="threshold" label="分类阈值">
                    <InputNumber min={0} max={1} step={0.05} style={{ width: 180 }} />
                  </Form.Item>
                </Space>
              )}
              {selectedCandidate.model_category === 'TREE' && (
                <>
                  <Divider orientation="left">树模型报告</Divider>
                  <Form.Item name="visibleSections">
                    <Checkbox.Group
                      options={(
                        (selectedCandidate.available_sections as string[]) || []
                      ).map((section) => ({
                        label: SECTION_LABELS[section] || section,
                        value: section,
                      }))}
                    />
                  </Form.Item>
                  {visibleSections?.includes('scorecard') &&
                    (selectedCandidate.task_type === 'CLASSIFICATION' ? (
                      <Space size={16} align="start" wrap>
                        <Form.Item name="baseScore" label="基准分">
                          <InputNumber min={0} />
                        </Form.Item>
                        <Form.Item name="pdo" label="PDO">
                          <InputNumber min={0.01} />
                        </Form.Item>
                        <Form.Item name="baseOdds" label="基准赔率">
                          <InputNumber min={0.01} />
                        </Form.Item>
                      </Space>
                    ) : (
                      <Space size={16} align="start" wrap>
                        <Form.Item name="scoreMin" label="最低分">
                          <InputNumber />
                        </Form.Item>
                        <Form.Item name="scoreMax" label="最高分">
                          <InputNumber />
                        </Form.Item>
                        <Form.Item
                          name="higherScoreForHigherPrediction"
                          label="预测值越高评分越高"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Space>
                    ))}
                </>
              )}
            </>
          )}
          <Form.Item name="description" label="模型说明">
            <Input.TextArea rows={3} maxLength={512} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <TablePreviewModal
        sandboxId={view.sandboxId}
        tableName={preview?.tableName || ''}
        title={preview?.title}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
      />
      <NodeConfigDrawer />
      <NodeDrawer />
      <TemplateDrawer />
      <VersionsDrawer />
    </div>
  );
};

const RECORDS_STATUS: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
};

const RecordsDrawer = () => {
  const view = useModel(SandboxCanvasView);
  const refresh = async () => {
    try {
      await view.loadRuns();
    } catch (e) {
      message.error(String(e));
    }
  };
  return (
    <div>
      <div style={{ display: 'none' }}>
        <Button onClick={refresh}>refresh</Button>
      </div>
      <div
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 1000,
          maxWidth: 520,
          display: view.drawer === 'records' ? 'block' : 'none',
        }}
      >
        <RecordsPanel />
      </div>
    </div>
  );
};

const RecordsPanel = () => {
  const view = useModel(SandboxCanvasView);
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: 16,
        maxHeight: '60vh',
        overflow: 'auto',
      }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <strong>运行记录</strong>
        <Space>
          <Button size="small" onClick={() => view.loadRuns()}>
            刷新
          </Button>
          <Button size="small" onClick={() => view.closeDrawer()}>
            关闭
          </Button>
        </Space>
      </Space>
      <Divider style={{ margin: '8px 0' }} />
      {view.runs.length === 0 && <Empty description="暂无运行记录" />}
      {view.runs.map((run) => (
        <div key={String(run.id)} style={{ marginBottom: 12 }}>
          <Space wrap>
            <Tag color={RECORDS_STATUS[String(run.status)]}>{String(run.status)}</Tag>
            <span style={{ fontSize: 12 }}>{String(run.mode || 'ALL')}</span>
            <span style={{ fontSize: 12, color: '#999' }}>
              {formatTime(run.started_at)}
            </span>
          </Space>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {(run.nodeRuns as DataSandboxRecord[] | undefined)?.map((nr) => (
              <Space key={String(nr.id)} size={4} style={{ marginRight: 8 }}>
                <Tag
                  color={RECORDS_STATUS[String(nr.status)]}
                  style={{ marginRight: 0 }}
                >
                  {String(nr.node_id)}
                </Tag>
                <span>{String(nr.status)}</span>
                {nr.status === 'SUCCEEDED' && (
                  <>
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        view.openDrawer('output', String(nr.node_id), String(run.id))
                      }
                    >
                      结果
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        view.openDrawer('logs', String(nr.node_id), String(run.id))
                      }
                    >
                      日志
                    </Button>
                  </>
                )}
              </Space>
            ))}
          </div>
          {run.error_message && (
            <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>
              {String(run.error_message)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
