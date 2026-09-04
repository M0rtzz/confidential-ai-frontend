import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Tree,
  Typography,
  Menu,
} from 'antd';
import {
  ArrowLeftOutlined,
  CodeOutlined,
  FundOutlined,
  PartitionOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { parse } from 'query-string';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { history, useLocation } from 'umi';

import { DataDevComponent } from '@/modules/data-dev';
import { DataAssetPreviewTable } from '@/modules/data-catalog/preview-table';
import { MvpPage, RefreshButton, formatTime } from '@/modules/data-sandbox-mvp/common';
import { ModelCenterComponent } from '@/modules/model-center';
import {
  DataComputeApi,
  DataSandboxRecord,
  responseData,
} from '@/services/data-sandbox';

const useComputeQuery = () => {
  const query = parse(useLocation().search);
  return {
    ownerId: String(query.ownerId || ''),
    projectId: String(query.projectId || ''),
    sandboxId: String(query.sandboxId || ''),
  };
};

const sandboxListUrl = () => {
  const current = new URLSearchParams(window.location.search);
  current.set('tab', 'data-compute');
  current.delete('sandboxId');
  current.delete('projectId');
  current.delete('workspace');
  return `/edge?${current.toString()}`;
};

/** 沙箱列表页地址：项目下没有沙箱时，从数据计算直接跳过去提交申请 */
const sandboxListPageUrl = () => {
  const current = new URLSearchParams(window.location.search);
  current.set('tab', 'sandbox-resource-application');
  current.delete('sandboxId');
  current.delete('projectId');
  current.delete('workspace');
  return `/edge?${current.toString()}`;
};

const workspaceUrl = (workspace: string, context: DataSandboxRecord) => {
  const current = new URLSearchParams(window.location.search);
  current.set('tab', 'data-compute');
  current.set('workspace', workspace);
  if (context.projectId) current.set('projectId', context.projectId);
  if (context.sandboxId) current.set('sandboxId', context.sandboxId);
  return `/edge?${current.toString()}`;
};

const ComputeContext = ({
  children,
  requireUse = false,
}: {
  children: (context: DataSandboxRecord) => ReactNode;
  requireUse?: boolean;
}) => {
  const { sandboxId } = useComputeQuery();
  const [context, setContext] = useState<DataSandboxRecord>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sandboxId) return;
    DataComputeApi.context(sandboxId)
      .then((res) => setContext(responseData(res, {})))
      .catch((e: any) => setError(e.message || '沙箱上下文加载失败'));
  }, [sandboxId]);
  if (!sandboxId)
    return (
      <Result
        status="info"
        title="请先从数据计算首页选择沙箱"
        extra={
          <Button type="primary" onClick={() => history.push(sandboxListUrl())}>
            返回数据计算首页
          </Button>
        }
      />
    );
  if (error) return <Result status="error" title={error} />;
  if (!context) return <Card loading />;
  if (requireUse && !context.canUse)
    return (
      <Result
        status="403"
        title="该沙箱仅创建人可使用"
        subTitle="项目其他参与节点可查看沙箱和审批信息，但不能执行计算。"
      />
    );
  return <>{children(context)}</>;
};

export const DataComputeHomeComponent = () => {
  const [projects, setProjects] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(responseData(await DataComputeApi.overview(), []));
    } catch (e: any) {
      message.error(e.message || '加载数据计算项目失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  return (
    <MvpPage
      title="数据计算首页"
      description="按项目进入本节点可使用的沙箱，管理挂载数据并开展程序计算、数据分析和智能建模"
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      {!projects.length && !loading ? (
        <Empty description="当前节点暂无可计算项目" />
      ) : (
        projects.map((project) => (
          <Card
            key={project.project_id}
            title={project.name}
            style={{ marginBottom: 16 }}
          >
            {!(project.sandboxes || []).length && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该项目暂无沙箱，需先在沙箱列表提交创建申请并通过审核"
              >
                <Button type="primary" onClick={() => history.push(sandboxListPageUrl())}>
                  去申请沙箱
                </Button>
              </Empty>
            )}
            <Row gutter={[16, 16]}>
              {(project.sandboxes || []).map((sandbox: DataSandboxRecord) => (
                <Col xs={24} md={12} xl={8} key={sandbox.id}>
                  <Card
                    size="small"
                    title={sandbox.name}
                    extra={
                      <Tag color={sandbox.status === 'EXPIRED' ? 'error' : 'success'}>
                        {sandbox.status === 'EXPIRED' ? '过期' : '正常'}
                      </Tag>
                    }
                  >
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="资源">
                        CPU {sandbox.cpu_cores} / 内存 {sandbox.memory_gb}GB / GPU{' '}
                        {sandbox.gpu_count}
                      </Descriptions.Item>
                      <Descriptions.Item label="有效期">
                        {formatTime(sandbox.expires_at)}
                      </Descriptions.Item>
                      <Descriptions.Item label="计算任务">
                        {sandbox.task_count || 0} 个
                      </Descriptions.Item>
                    </Descriptions>
                    {!sandbox.usable && (
                      <Alert
                        type="warning"
                        showIcon
                        message={sandbox.readOnlyReason || '当前节点只可查看'}
                        style={{ marginBottom: 8 }}
                      />
                    )}
                    <Space wrap>
                      <Button
                        type="primary"
                        disabled={!sandbox.usable}
                        onClick={() =>
                          history.push(
                            workspaceUrl('directory', {
                              projectId: project.project_id,
                              sandboxId: sandbox.id,
                            }),
                          )
                        }
                      >
                        进入沙箱
                      </Button>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        ))
      )}
    </MvpPage>
  );
};

export const SandboxDevelopmentComponent = () => (
  <ComputeContext requireUse>{() => <DataDevComponent />}</ComputeContext>
);

const WorkspaceDataCatalog = ({ sandboxId }: { sandboxId: string }) => {
  const [data, setData] = useState<DataSandboxRecord>({});
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DataSandboxRecord>();
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(responseData(await DataComputeApi.sandboxDbDirectory(sandboxId), {}));
    } catch (e: any) {
      message.error(e.message || '加载沙箱数据目录失败');
    } finally {
      setLoading(false);
    }
  }, [sandboxId]);
  useEffect(() => void refresh(), [refresh]);
  const previewTable = async (tableName: string) => {
    try {
      const raw = responseData(
        await DataComputeApi.sandboxDbPreview(sandboxId, tableName, 20),
        {},
      );
      const schema: DataSandboxRecord[] = Array.isArray(raw.schema) ? raw.schema : [];
      const names: string[] = schema.map((c) => String(c.name));
      const rows: DataSandboxRecord[] = (raw.rows || []).map((row: string[]) => {
        const obj: DataSandboxRecord = {};
        names.forEach((n, i) => {
          obj[n] = row[i];
        });
        return obj;
      });
      setPreview({
        tableName: raw.tableName || tableName,
        columns: names,
        rows,
        totalRows: raw.totalRows,
        asset: { name: raw.tableName || tableName },
      });
    } catch (e: any) {
      message.error(e.message || '数据预览失败');
    }
  };
  const exportTable = async (tableName: string) => {
    try {
      const blob = await DataComputeApi.sandboxDbTableExport(sandboxId, tableName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success(`已导出 ${tableName}.csv`);
    } catch (e: any) {
      message.error(e.message || '导出失败');
    }
  };
  const mountRows = (data.items || [])
    .filter((r: DataSandboxRecord) => r.kind === 'MOUNT')
    .map((row: DataSandboxRecord) => ({ ...row, _kind: 'mount' }));
  const resultRows = (data.items || [])
    .filter((r: DataSandboxRecord) => r.kind === 'RESULT')
    .map((row: DataSandboxRecord) => ({ ...row, _kind: 'result' }));
  const columns = [
    {
      title: '数据名称',
      dataIndex: 'name',
      render: (_: any, r: DataSandboxRecord) => r.name || r.assetId || '-',
    },
    {
      title: '类型',
      dataIndex: '_kind',
      render: (v: string) => (
        <Tag color={v === 'mount' ? 'blue' : 'green'}>
          {v === 'mount' ? '初始挂载数据' : '计算结果'}
        </Tag>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      render: (v: string) => (
        <Tag color={v === 'SYNCED' ? 'orange' : 'default'}>
          {v === 'SYNCED' ? '跨节点同步' : '本节点'}
        </Tag>
      ),
    },
    {
      title: '查看截止时间',
      dataIndex: 'view_until',
      render: (value: string, row: DataSandboxRecord) =>
        row._kind === 'result' ? formatTime(value) || '长期' : '-',
    },
    {
      title: '导出截止时间',
      dataIndex: 'export_until',
      render: (value: string, row: DataSandboxRecord) =>
        row._kind === 'result' && row.allow_export ? formatTime(value) : '-',
    },
    {
      title: '操作',
      render: (_: any, r: DataSandboxRecord) => (
        <Space>
          <Button
            type="link"
            disabled={!r.tableName || !r.canPreview}
            onClick={() => previewTable(r.tableName)}
          >
            预览
          </Button>
          {r._kind === 'result' && (
            <Button
              type="link"
              disabled={!r.tableName || !r.canExport}
              onClick={() => exportTable(r.tableName)}
            >
              导出开发结果
            </Button>
          )}
        </Space>
      ),
    },
  ];
  return (
    <MvpPage
      title="沙箱数据目录"
      description=""
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <Table
        rowKey={(r) => `${r._kind}-${r.tableName}`}
        loading={loading}
        dataSource={[...mountRows, ...resultRows]}
        columns={columns}
        pagination={false}
      />
      <Modal
        width={900}
        title={`数据预览（${preview?.tableName || ''}）`}
        open={!!preview}
        onCancel={() => setPreview(undefined)}
        footer={null}
      >
        <DataAssetPreviewTable preview={preview} />
      </Modal>
    </MvpPage>
  );
};

export const SandboxWorkspaceComponent = () => {
  const { sandboxId, projectId } = useComputeQuery();
  const query = parse(useLocation().search);
  const workspace = String(query.workspace || 'directory');
  const [context, setContext] = useState<DataSandboxRecord>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (sandboxId)
      DataComputeApi.context(sandboxId)
        .then((r) => setContext(responseData(r, {})))
        .catch((e: any) => setError(e.message || '沙箱上下文加载失败'));
  }, [sandboxId]);
  if (!sandboxId) return <DataComputeHomeComponent />;
  if (error) return <Result status="error" title={error} />;
  if (!context) return <Card loading />;
  if (context.sandbox?.status === 'EXPIRED')
    return (
      <Result
        status="403"
        title="沙箱已过期，无法进入"
        subTitle="请返回沙箱列表续期或销毁该沙箱。"
        extra={
          <Button onClick={() => history.push(sandboxListUrl())}>返回沙箱列表</Button>
        }
      />
    );
  const c = { sandboxId, projectId: projectId || context.project?.project_id };
  const menu = [
    { key: 'directory', icon: <TableOutlined />, label: '沙箱数据目录' },
    { key: 'dev', icon: <CodeOutlined />, label: '沙箱方式开发' },
    { key: 'visual', icon: <PartitionOutlined />, label: '可视化建模' },
    { key: 'algorithm', icon: <FundOutlined />, label: '自定义算法' },
  ];
  const page =
    workspace === 'dev' ? (
      <SandboxDevelopmentComponent />
    ) : workspace === 'algorithm' ? (
      <CustomAlgorithmComponent />
    ) : workspace === 'visual' ? (
      <VisualModelingComponent />
    ) : (
      <WorkspaceDataCatalog sandboxId={sandboxId} />
    );
  return (
    // 撑满 HomeLayout 给出的可用高度，避免左侧菜单和内容区停在半空
    <Layout style={{ background: 'transparent', minHeight: '100%' }}>
      <Layout.Header
        style={{
          background: '#fff',
          padding: '0 16px',
          height: 'auto',
          lineHeight: 'normal',
        }}
      >
        <Space style={{ padding: '12px 0' }} wrap>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => history.push(sandboxListUrl())}
          >
            返回沙箱列表
          </Button>
          <strong>{context.sandbox?.name}</strong>
          <span>{context.project?.name || c.projectId}</span>
          <Tag color={context.sandbox?.status === 'EXPIRED' ? 'error' : 'success'}>
            {context.sandbox?.status === 'EXPIRED' ? '过期' : '正常'}
          </Tag>
          <Tag>CPU {context.sandbox?.cpu_cores}</Tag>
          <Tag>内存 {context.sandbox?.memory_gb}GB</Tag>
          <Tag>GPU {context.sandbox?.gpu_count}</Tag>
        </Space>
      </Layout.Header>
      <Layout style={{ background: 'transparent', flex: 1, minHeight: 0 }}>
        <Layout.Sider width={190} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[workspace]}
            items={menu}
            onSelect={({ key }) => history.replace(workspaceUrl(key, c))}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 16, overflow: 'auto' }}>{page}</Layout.Content>
      </Layout>
    </Layout>
  );
};

export const DataComputeEntryComponent = () => {
  const { sandboxId } = useComputeQuery();
  return sandboxId ? <SandboxWorkspaceComponent /> : <DataComputeHomeComponent />;
};

export const CustomAlgorithmComponent = () => (
  <ComputeContext requireUse>
    {(ctx) => <ModelCenterComponent context={ctx} />}
  </ComputeContext>
);

export const VisualModelingComponent = () => (
  <ComputeContext requireUse>
    {(context) => <CanvasList context={context} />}
  </ComputeContext>
);

type WorkflowGraph = {
  nodes: {
    id: string;
    data?: { componentCode?: string; name?: string; params?: DataSandboxRecord };
    position?: { x?: number; y?: number };
  }[];
  edges: { source: string; target: string }[];
};

const workflowGraph = (value: unknown): WorkflowGraph => {
  try {
    const parsed = (
      typeof value === 'string' ? JSON.parse(value || '{}') : value || {}
    ) as DataSandboxRecord;
    return {
      nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
    };
  } catch {
    return { nodes: [], edges: [] };
  }
};

const WorkflowTopology = ({ graph }: { graph: WorkflowGraph }) => {
  if (!graph.nodes.length) return <Empty description="工作流拓扑为空" />;
  const nodeWidth = 190;
  const nodeHeight = 52;
  const padding = 36;
  const raw = graph.nodes.map((node, index) => ({
    ...node,
    x: Number(node.position?.x) || (index % 3) * 250,
    y: Number(node.position?.y) || Math.floor(index / 3) * 120,
  }));
  const minX = Math.min(...raw.map((node) => node.x));
  const minY = Math.min(...raw.map((node) => node.y));
  const nodes = raw.map((node) => ({
    ...node,
    x: node.x - minX + padding,
    y: node.y - minY + padding,
  }));
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const width = Math.max(...nodes.map((node) => node.x + nodeWidth)) + padding;
  const height = Math.max(...nodes.map((node) => node.y + nodeHeight)) + padding;
  return (
    <div style={{ overflow: 'auto' }}>
      <svg
        role="img"
        aria-label="工作流组件连接拓扑"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          minWidth: Math.min(width, 720),
          height: Math.min(Math.max(height, 220), 460),
          border: '1px solid #d9e0e8',
          borderRadius: 8,
          background: '#f7f9fc',
        }}
      >
        <defs>
          <marker
            id="workflow-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#62758a" />
          </marker>
        </defs>
        {graph.edges.map((edge, index) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={`${edge.source}-${edge.target}-${index}`}
              x1={source.x + nodeWidth / 2}
              y1={source.y + nodeHeight}
              x2={target.x + nodeWidth / 2}
              y2={target.y}
              stroke="#62758a"
              strokeWidth="2"
              markerEnd="url(#workflow-arrow)"
            />
          );
        })}
        {nodes.map((node) => {
          const name = String(node.data?.name || node.data?.componentCode || node.id);
          const code = String(node.data?.componentCode || '');
          return (
            <g key={node.id}>
              <title>{`${name}${code ? ` (${code})` : ''}`}</title>
              <rect
                x={node.x}
                y={node.y}
                width={nodeWidth}
                height={nodeHeight}
                rx="8"
                fill="#fff"
                stroke="#55708e"
                strokeWidth="1.5"
              />
              <text
                x={node.x + nodeWidth / 2}
                y={node.y + 23}
                textAnchor="middle"
                fill="#1f2937"
                fontSize="14"
                fontWeight="600"
              >
                {name.length > 16 ? `${name.slice(0, 16)}…` : name}
              </text>
              <text
                x={node.x + nodeWidth / 2}
                y={node.y + 41}
                textAnchor="middle"
                fill="#667085"
                fontSize="10"
              >
                {code.length > 24 ? `${code.slice(0, 24)}…` : code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const reportObject = (value: unknown): DataSandboxRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DataSandboxRecord)
    : {};

const reportRows = (value: unknown): DataSandboxRecord[] =>
  Array.isArray(value) ? (value as DataSandboxRecord[]) : [];

const reportStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const reportValue = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String).join('、') || '-';
  if (value && typeof value === 'object')
    return Object.entries(value as DataSandboxRecord)
      .map(([key, item]) => `${key}=${reportValue(item)}`)
      .join('；');
  return value === null || value === undefined || value === '' ? '-' : String(value);
};

const reportParamSummary = (value: unknown) => {
  const params = reportObject(value);
  const entries = Object.entries(params).filter(
    ([key]) => !['features', 'label', 'columns'].includes(key),
  );
  return entries.length
    ? entries.map(([key, item]) => `${key}=${reportValue(item)}`).join('；')
    : '-';
};

const ModelEvaluationSection = ({ evaluation }: { evaluation: DataSandboxRecord }) => {
  if (evaluation.status !== 'AVAILABLE') {
    return (
      <Alert
        showIcon
        type="info"
        message={evaluation.message || '当前模型尚无成功的模型测试报告'}
      />
    );
  }
  const metrics = reportObject(evaluation.metrics);
  const input = reportObject(evaluation.inputSummary);
  const output = reportObject(evaluation.outputSummary);
  const preview = reportObject(evaluation.resultPreview);
  const header = reportStrings(preview.header);
  const rows = Array.isArray(preview.rows) ? (preview.rows as unknown[][]) : [];
  const metricLabels: Record<string, string> = {
    accuracy: 'Accuracy',
    precision: 'Precision',
    recall: 'Recall',
    f1: 'F1',
    auc: 'AUC',
    mae: 'MAE',
    rmse: 'RMSE',
    r2: 'R²',
    samples: '评估样本数',
    totalRows: '结果总行数',
    classes: '类别集合',
    clusterCount: '簇数量',
    clusterDistribution: '各簇样本数',
    clusterRatio: '各簇占比',
    distributionSampleRows: '分布统计样本行数',
  };
  const metricItems = Object.entries(metrics)
    .filter(([key]) => !['metricType', 'confusionMatrix'].includes(key))
    .map(([key, value]) => ({
      key,
      label: metricLabels[key] || key,
      children: reportValue(value),
    }));
  const confusion = reportObject(metrics.confusionMatrix);
  if (Object.keys(confusion).length) {
    metricItems.push({
      key: 'confusionMatrix',
      label: '混淆矩阵',
      children: `TP ${confusion.tp ?? 0} / FP ${confusion.fp ?? 0} / FN ${
        confusion.fn ?? 0
      } / TN ${confusion.tn ?? 0}`,
    });
  }
  const sourceLabels: Record<string, string> = {
    MODEL_SAVE: '保存模型时自动评估',
    MODEL_TEST: '模型测试报告',
    CANVAS_EVALUATION_NODE: '画布评估组件',
    AUTO_EVALUATION: '训练结果自动评估',
  };
  const scopeHint =
    evaluation.metricsScope === 'AUTO'
      ? '该工作流没有配置模型评估组件，以下指标由训练结果按模型任务类型自动计算。'
      : evaluation.source === 'CANVAS_EVALUATION_NODE'
      ? '以下指标来自工作流中配置的模型评估组件，按其配置的字段展示。'
      : '';
  const evaluationNode = reportObject(evaluation.evaluationNode);
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {scopeHint ? <Alert showIcon type="info" message={scopeHint} /> : null}
      <Descriptions
        bordered
        size="small"
        column={2}
        items={[
          {
            key: 'source',
            label: '指标来源',
            children:
              sourceLabels[String(evaluation.source || '')] ||
              String(evaluation.source || '-'),
          },
          {
            key: 'metricType',
            label: '评估类型',
            children: String(evaluation.metricType || metrics.metricType || '-'),
          },
          ...(evaluationNode.componentName
            ? [
                {
                  key: 'node',
                  label: '评估组件',
                  children: `${evaluationNode.componentName}（${
                    evaluationNode.componentCode || '-'
                  }）`,
                },
              ]
            : []),
          { key: 'test', label: '测试批次', children: evaluation.testId || '-' },
          { key: 'mode', label: '运行模式', children: evaluation.runMode || '-' },
          {
            key: 'time',
            label: '完成时间',
            children: formatTime(evaluation.finishedAt),
          },
          {
            key: 'input',
            label: '输入数据',
            children: `${input.rowCount ?? 0} 行 / ${input.columnCount ?? 0} 列`,
          },
          {
            key: 'output',
            label: '输出数据',
            children: `${output.rowCount ?? 0} 行 / ${output.columnCount ?? 0} 列`,
          },
        ]}
      />
      {metricItems.length ? (
        <Descriptions bordered size="small" column={2} items={metricItems} />
      ) : (
        <Alert showIcon type="warning" message="该测试批次没有可展示的评估指标" />
      )}
      {header.length ? (
        <Table
          size="small"
          bordered
          rowKey={(_, index) => String(index)}
          pagination={
            rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false
          }
          scroll={{ x: 'max-content', y: 360 }}
          dataSource={rows}
          columns={header.map((name, index) => ({
            key: `${name}-${index}`,
            title: name,
            width: 140,
            ellipsis: true,
            render: (_: unknown, row: unknown[]) => reportValue(row[index]),
          }))}
        />
      ) : null}
    </Space>
  );
};

const ScorecardSection = ({ data }: { data: DataSandboxRecord }) => {
  if (!Object.keys(data).length) return null;
  if (data.status !== 'AVAILABLE') {
    return <Alert showIcon type="info" message={data.message || '评分卡结果不可用'} />;
  }
  const distribution = Array.isArray(data.distribution)
    ? (data.distribution as DataSandboxRecord[])
    : [];
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions
        bordered
        size="small"
        column={3}
        items={[
          { key: 'mode', label: '评分模式', children: reportValue(data.mode) },
          { key: 'samples', label: '评分样本数', children: reportValue(data.samples) },
          { key: 'average', label: '平均分', children: reportValue(data.average) },
          { key: 'minimum', label: '最低分', children: reportValue(data.minimum) },
          { key: 'maximum', label: '最高分', children: reportValue(data.maximum) },
        ]}
      />
      {distribution.length ? (
        <Table
          size="small"
          rowKey={(_, index) => String(index)}
          pagination={false}
          dataSource={distribution}
          columns={[
            { title: '区间起点', dataIndex: 'from' },
            { title: '区间终点', dataIndex: 'to' },
            { title: '样本数', dataIndex: 'count' },
          ]}
        />
      ) : null}
    </Space>
  );
};

/** 树结构：自动解析第一棵树并直接展示，节点明细表用于辅助核对。 */
const TreeStructureSection = ({
  data,
  modelId,
  onComputed,
}: {
  data: DataSandboxRecord;
  modelId: string;
  onComputed: () => void;
}) => {
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState('');
  const requestedRef = useRef('');
  const onComputedRef = useRef(onComputed);
  onComputedRef.current = onComputed;
  const nodes = reportRows(data.nodes);
  useEffect(() => {
    const requestKey = `${modelId}:0`;
    if (
      !modelId ||
      data.status === 'AVAILABLE' ||
      data.status === 'UNSUPPORTED' ||
      requestedRef.current === requestKey
    ) {
      return;
    }
    requestedRef.current = requestKey;
    let active = true;
    setComputing(true);
    setComputeError('');
    DataComputeApi.canvasModelTreeStructure(modelId, 0)
      .then(() => {
        if (active) onComputedRef.current();
      })
      .catch((error: any) => {
        if (active) setComputeError(error.message || '树结构生成失败');
      })
      .finally(() => {
        if (active) setComputing(false);
      });
    return () => {
      active = false;
    };
  }, [data.status, modelId]);
  if (data.status === 'UNSUPPORTED') {
    return (
      <Alert
        showIcon
        type="info"
        message={`当前算法（${
          data.componentCode || '-'
        }）不是树模型，没有可导出的树结构`}
      />
    );
  }
  const treeCount = Number(data.treeCount || 0);
  if (data.status !== 'AVAILABLE') {
    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          showIcon
          type={computeError ? 'error' : 'info'}
          message={computeError || (computing ? '正在生成树结构…' : '树结构正在准备中')}
        />
      </Space>
    );
  }
  const nodeMap = new Map(nodes.map((node) => [String(node.nodeId), node]));
  const childIds = new Set(
    nodes
      .flatMap((node) => [node.left, node.right])
      .filter((id) => id !== null && id !== undefined && id !== '')
      .map(String),
  );
  const root = nodes.find((node) => !childIds.has(String(node.nodeId))) || nodes[0];
  const buildTree = (
    node: DataSandboxRecord | undefined,
    branch = '',
    visited = new Set<string>(),
  ): any => {
    if (!node) return null;
    const key = String(node.nodeId);
    if (visited.has(key)) return null;
    const nextVisited = new Set(visited).add(key);
    const value = Array.isArray(node.value)
      ? JSON.stringify(node.value)
      : reportValue(node.value);
    const title = node.leaf ? (
      <span>
        {branch ? `${branch} · ` : ''}叶节点：{value}
      </span>
    ) : (
      <span>
        {branch ? `${branch} · ` : ''}
        {String(node.feature || '特征')} ≤ {reportValue(node.threshold)}
      </span>
    );
    const children = node.leaf
      ? []
      : [
          buildTree(nodeMap.get(String(node.left)), '是', nextVisited),
          buildTree(nodeMap.get(String(node.right)), '否', nextVisited),
        ].filter(Boolean);
    return { key, title, children };
  };
  const treeData = root ? [buildTree(root)].filter(Boolean) : [];
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {data.truncated ? (
        <Alert
          showIcon
          type="warning"
          message="树节点数超过展示上限，以下为截断后的前 800 个节点"
        />
      ) : null}
      <Descriptions
        bordered
        size="small"
        column={3}
        items={[
          { key: 'kind', label: '模型类型', children: String(data.kind || '-') },
          {
            key: 'index',
            label: '当前树序号',
            children: `第 ${Number(data.treeIndex || 0) + 1} 棵${
              treeCount ? ` / 共 ${treeCount} 棵` : ''
            }`,
          },
          {
            key: 'depth',
            label: '最大深度',
            children: reportValue(data.maxDepth),
          },
          {
            key: 'nodes',
            label: '节点数',
            children: String(data.nodeCount ?? nodes.length),
          },
          { key: 'leaves', label: '叶子数', children: String(data.leafCount ?? 0) },
          {
            key: 'time',
            label: '导出时间',
            children: formatTime(data.computedAt),
          },
        ]}
      />
      {treeData.length ? (
        <Tree showLine defaultExpandAll treeData={treeData} blockNode />
      ) : (
        <Alert showIcon type="warning" message="没有获取到可展示的树节点" />
      )}
      <Table
        rowKey={(row) => String(row.nodeId)}
        size="small"
        scroll={{ x: 'max-content', y: 420 }}
        pagination={
          nodes.length > 50 ? { pageSize: 50, showSizeChanger: false } : false
        }
        dataSource={nodes}
        locale={{ emptyText: '没有获取到树节点' }}
        columns={[
          { title: '节点', dataIndex: 'nodeId', width: 90 },
          { title: '深度', dataIndex: 'depth', width: 72, render: reportValue },
          {
            title: '类型',
            width: 90,
            render: (_, row) =>
              row.leaf ? <Tag>叶子</Tag> : <Tag color="blue">分裂</Tag>,
          },
          { title: '分裂特征', dataIndex: 'feature', render: reportValue },
          { title: '阈值', dataIndex: 'threshold', render: reportValue },
          { title: '样本数', dataIndex: 'samples', render: reportValue },
          { title: '取值', dataIndex: 'value', render: reportValue },
          { title: '左子节点', dataIndex: 'left', render: reportValue },
          { title: '右子节点', dataIndex: 'right', render: reportValue },
        ]}
      />
    </Space>
  );
};

const WorkflowModelReport = ({
  report,
  modelId,
  onTestChange,
  onRefresh,
}: {
  report?: DataSandboxRecord;
  modelId: string;
  onTestChange: (testId: string) => void;
  onRefresh: () => void;
}) => {
  if (!report) return <Card loading />;
  if (report.reportStatus !== 'AVAILABLE') {
    return (
      <Result
        status="info"
        title="模型报告暂不可用"
        subTitle={report.message || '当前工作流模型没有可关联的训练结果'}
      />
    );
  }
  const model = reportObject(report.model);
  const algorithm = reportObject(report.algorithm);
  const summary = reportObject(report.featureSummary);
  const features = reportRows(report.features);
  const excluded = reportRows(report.excludedFields);
  const preprocessing = reportRows(report.preprocessingSteps);
  const evaluation = reportObject(report.evaluation);
  const testHistory = reportRows(report.testHistory);
  const treeStructure = reportObject(report.treeStructure);
  const scorecard = reportObject(report.scorecard);
  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {report.runBinding === 'LEGACY_INFERRED' && (
        <Alert
          showIcon
          type="warning"
          message="历史模型缺少运行快照绑定，本报告依据该模型唯一的成功训练记录回溯生成"
        />
      )}
      <Divider orientation="left">报告概览</Divider>
      <Descriptions
        bordered
        size="small"
        column={2}
        items={[
          { key: 'name', label: '模型名称', children: model.name || '-' },
          {
            key: 'version',
            label: '画布版本',
            children: `v${model.canvas_version || '-'}`,
          },
          { key: 'model', label: '执行模型 ID', children: model.model_id || '-' },
          { key: 'run', label: '训练运行批次', children: report.sourceRunId || '-' },
          {
            key: 'algorithm',
            label: '算法',
            children: algorithm.componentName || algorithm.componentCode || '-',
          },
          { key: 'creator', label: '保存人', children: model.created_by || '-' },
          { key: 'time', label: '保存时间', children: formatTime(model.created_at) },
        ]}
      />
      <Divider orientation="left">模型评估</Divider>
      {testHistory.length > 1 && (
        <Select
          value={evaluation.testId}
          style={{ width: 320 }}
          aria-label="选择模型测试批次"
          options={testHistory.map((test) => ({
            value: test.id,
            label: `${formatTime(test.finished_at)} · ${test.metric_type || 'auto'}`,
          }))}
          onChange={onTestChange}
        />
      )}
      <ModelEvaluationSection evaluation={evaluation} />
      {treeStructure.supported ? (
        <>
          <Divider orientation="left">树结构</Divider>
          <TreeStructureSection
            data={treeStructure}
            modelId={modelId}
            onComputed={onRefresh}
          />
        </>
      ) : null}
      {Object.keys(scorecard).length ? (
        <>
          <Divider orientation="left">评分卡</Divider>
          <ScorecardSection data={scorecard} />
        </>
      ) : null}
      <Divider orientation="left">特征概览</Divider>
      <Descriptions
        bordered
        size="small"
        column={2}
        items={[
          {
            key: 'source',
            label: '原始字段数',
            children: String(summary.sourceFieldCount ?? 0),
          },
          {
            key: 'feature',
            label: '最终入模特征数',
            children: String(summary.modelFeatureCount ?? 0),
          },
          {
            key: 'excluded',
            label: '未入模字段数',
            children: String(summary.excludedFieldCount ?? 0),
          },
          {
            key: 'preprocessing',
            label: '前处理步骤数',
            children: String(summary.preprocessingCount ?? 0),
          },
          { key: 'label', label: '标签字段', children: summary.label || '-' },
          { key: 'table', label: '训练输入表', children: summary.inputTable || '-' },
        ]}
      />
      <Divider orientation="left">最终入模特征</Divider>
      <Table
        rowKey="name"
        size="small"
        pagination={
          features.length > 20 ? { pageSize: 20, showSizeChanger: false } : false
        }
        dataSource={features}
        locale={{ emptyText: '没有获取到最终入模特征' }}
        columns={[
          { title: '字段名称', dataIndex: 'name' },
          { title: '原始类型', dataIndex: 'sourceType' },
          { title: '入模类型', dataIndex: 'modelType' },
          {
            title: '选择方式',
            dataIndex: 'selectionMethod',
            render: (value) => (value === 'MANUAL' ? '训练时选择' : '算法自动选择'),
          },
          {
            title: '前处理操作',
            dataIndex: 'preprocessing',
            render: (value) => reportValue(value),
          },
          { title: '状态', render: () => <Tag color="success">已入模</Tag> },
        ]}
      />
      <Divider orientation="left">前处理操作</Divider>
      <Table
        rowKey="nodeId"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={preprocessing}
        locale={{ emptyText: '该模型没有上游前处理步骤' }}
        columns={[
          { title: '顺序', dataIndex: 'order', width: 72 },
          { title: '处理组件', dataIndex: 'componentName', width: 140 },
          {
            title: '处理字段',
            render: (_, row) =>
              row.appliesToAll ? '全部适用字段' : reportValue(row.columns),
          },
          {
            title: '配置参数',
            dataIndex: 'configuredParams',
            render: reportParamSummary,
          },
          {
            title: '实际拟合参数',
            dataIndex: 'fittedParams',
            render: reportParamSummary,
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) => <Tag>{value || '-'}</Tag>,
          },
        ]}
      />
      <Divider orientation="left">未入模字段</Divider>
      <Table
        rowKey="name"
        size="small"
        pagination={
          excluded.length > 20 ? { pageSize: 20, showSizeChanger: false } : false
        }
        dataSource={excluded}
        locale={{ emptyText: '没有未入模字段' }}
        columns={[
          { title: '字段名称', dataIndex: 'name' },
          { title: '字段类型', dataIndex: 'type' },
          { title: '未入模原因', dataIndex: 'reason' },
        ]}
      />
    </Space>
  );
};

const WorkflowModelDrawer = ({
  model,
  onClose,
}: {
  model?: DataSandboxRecord;
  onClose: () => void;
}) => {
  const [activeTab, setActiveTab] = useState('detail');
  const [report, setReport] = useState<DataSandboxRecord>();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const graph = workflowGraph(model?.graph_json);
  const names = new Map(
    graph.nodes.map((node) => [
      node.id,
      String(node.data?.name || node.data?.componentCode || node.id),
    ]),
  );
  useEffect(() => {
    setActiveTab('detail');
    setReport(undefined);
    setReportError('');
  }, [model?.id]);
  const loadReport = async (testId = '') => {
    if (!model?.id) return;
    setReportLoading(true);
    setReportError('');
    try {
      setReport(
        responseData(await DataComputeApi.canvasModelReport(model.id, testId), {}),
      );
    } catch (e: any) {
      setReportError(e.message || '模型报告加载失败');
    } finally {
      setReportLoading(false);
    }
  };
  const detail = model ? (
    <>
      <Descriptions
        bordered
        size="small"
        column={2}
        items={[
          { key: 'name', label: '模型名称', children: model.name },
          {
            key: 'version',
            label: '画布版本',
            children: `v${model.canvas_version}`,
          },
          {
            key: 'status',
            label: '状态',
            children: (
              <Tag color={model.status === 'READY' ? 'success' : 'default'}>
                {model.status === 'READY' ? '可发布 API' : '拓扑草稿'}
              </Tag>
            ),
          },
          { key: 'model', label: '执行模型 ID', children: model.model_id || '-' },
          { key: 'creator', label: '保存人', children: model.created_by },
          {
            key: 'time',
            label: '保存时间',
            children: formatTime(model.created_at),
          },
          {
            key: 'description',
            label: '说明',
            children: model.description || '-',
            span: 2,
          },
        ]}
      />
      <Divider orientation="left">组件清单</Divider>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={graph.nodes}
        columns={[
          {
            title: '组件名称',
            render: (_, row) => row.data?.name || row.data?.componentCode || row.id,
          },
          { title: '组件编码', render: (_, row) => row.data?.componentCode || '-' },
          { title: '节点 ID', dataIndex: 'id' },
        ]}
      />
      <Divider orientation="left">连接拓扑</Divider>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <WorkflowTopology graph={graph} />
        <Typography.Text type="secondary">
          {graph.edges.length
            ? graph.edges
                .map(
                  (edge) =>
                    `${names.get(edge.source) || edge.source} → ${
                      names.get(edge.target) || edge.target
                    }`,
                )
                .join('；')
            : '该工作流没有组件连线'}
        </Typography.Text>
      </Space>
    </>
  ) : null;
  return (
    <Drawer title="工作流模型" open={!!model} onClose={onClose} width={960}>
      {model && (
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            if (key === 'report' && !report && !reportLoading) void loadReport();
          }}
          items={[
            { key: 'detail', label: '模型详情', children: detail },
            {
              key: 'report',
              label: '模型报告',
              children: reportError ? (
                <Alert showIcon type="error" message={reportError} />
              ) : reportLoading ? (
                <Card loading />
              ) : (
                <WorkflowModelReport
                  report={report}
                  modelId={model.id}
                  onTestChange={loadReport}
                  onRefresh={() => void loadReport()}
                />
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
};

const CanvasList = ({ context }: { context: DataSandboxRecord }) => {
  const [rows, setRows] = useState<DataSandboxRecord[]>([]);
  const [edit, setEdit] = useState<DataSandboxRecord>();
  const [modelCanvas, setModelCanvas] = useState<DataSandboxRecord>();
  const [canvasModels, setCanvasModels] = useState<DataSandboxRecord[]>([]);
  const [modelDetail, setModelDetail] = useState<DataSandboxRecord>();
  const [modelsLoading, setModelsLoading] = useState(false);
  const [form] = Form.useForm();
  const refresh = useCallback(
    async () =>
      setRows(responseData(await DataComputeApi.canvases(context.sandbox.id), [])),
    [context.sandbox.id],
  );
  useEffect(() => void refresh(), [refresh]);
  const openModels = async (canvas: DataSandboxRecord) => {
    setModelCanvas(canvas);
    setCanvasModels([]);
    setModelsLoading(true);
    try {
      setCanvasModels(responseData(await DataComputeApi.canvasModels(canvas.id), []));
    } catch (e: any) {
      message.error(e.message || '加载工作流模型失败');
    } finally {
      setModelsLoading(false);
    }
  };
  const deleteCanvas = async (canvas: DataSandboxRecord) => {
    try {
      responseData(
        await DataComputeApi.deleteCanvas(canvas.id, context.sandbox.id),
        {},
      );
      message.success('画布已删除');
      await refresh();
    } catch (e: any) {
      message.error(e.message || '删除画布失败');
    }
  };
  const enterDag = (canvas?: DataSandboxRecord) =>
    history.push(
      {
        pathname: '/dag',
        search: `projectId=${context.project.project_id}&sandboxId=${
          context.sandbox.id
        }&mode=${context.project.compute_mode || 'MPC'}&type=DAG${
          canvas ? `&computeCanvasId=${canvas.id}` : ''
        }`,
      },
      { origin: 'data-compute-visual' },
    );
  return (
    <MvpPage
      title="沙箱智能建模：可视化建模"
      extra={
        <Button
          onClick={() => {
            setEdit({});
            form.resetFields();
          }}
        >
          新建画布
        </Button>
      }
    >
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '画布', dataIndex: 'name' },
          { title: '版本', dataIndex: 'version' },
          { title: '状态', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
          {
            title: '模型列表',
            render: (_, row) => (
              <Button type="link" onClick={() => openModels(row)}>
                查看模型列表
              </Button>
            ),
          },
          { title: '更新时间', dataIndex: 'updated_at', render: formatTime },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button type="link" onClick={() => enterDag(row)}>
                  编辑/执行
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setEdit(row);
                    form.setFieldsValue({
                      name: row.name,
                      description: row.description,
                    });
                  }}
                >
                  信息设置
                </Button>
                <Popconfirm
                  title={`确定删除画布“${String(row.name || '')}”吗？`}
                  description="删除后将无法继续编辑该画布。"
                  okText="确认删除"
                  cancelText="取消"
                  onConfirm={() => deleteCanvas(row)}
                >
                  <Button type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={edit?.id ? '编辑画布信息' : '新建画布'}
        open={!!edit}
        onCancel={() => setEdit(undefined)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              const saved = responseData(
                await DataComputeApi.saveCanvas({
                  ...values,
                  id: edit?.id,
                  sandboxId: context.sandbox.id,
                  graph: edit?.graph_json
                    ? JSON.parse(edit.graph_json)
                    : { nodes: [], edges: [] },
                }),
                {},
              );
              message.success('画布已保存');
              setEdit(undefined);
              refresh();
              if (!edit?.id) enterDag(saved);
            } catch (e: any) {
              message.error(e.message || '保存失败');
            }
          }}
        >
          <Form.Item name="name" label="画布名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        title={`${String(modelCanvas?.name || '')} · 模型列表`}
        open={!!modelCanvas}
        onClose={() => setModelCanvas(undefined)}
        width={760}
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="这里展示从该画布显式保存的工作流模型"
          description="READY 模型已关联成功训练的可执行结果，可在自定义算法中发布 API；DRAFT 仅保存工作流拓扑。"
        />
        <Table
          rowKey="id"
          size="small"
          loading={modelsLoading}
          dataSource={canvasModels}
          locale={{ emptyText: '该画布尚未保存工作流模型' }}
          columns={[
            {
              title: '模型',
              dataIndex: 'name',
              render: (value, row) => (
                <Button type="link" onClick={() => setModelDetail(row)}>
                  {value}
                </Button>
              ),
            },
            { title: '画布版本', dataIndex: 'canvas_version', render: (v) => `v${v}` },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v) => (
                <Tag color={v === 'READY' ? 'success' : 'default'}>
                  {v === 'READY' ? '可发布' : '拓扑草稿'}
                </Tag>
              ),
            },
            { title: '保存人', dataIndex: 'created_by' },
            { title: '保存时间', dataIndex: 'created_at', render: formatTime },
          ]}
        />
      </Drawer>
      <WorkflowModelDrawer
        model={modelDetail}
        onClose={() => setModelDetail(undefined)}
      />
    </MvpPage>
  );
};
