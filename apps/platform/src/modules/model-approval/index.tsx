import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'umi';

import { DataModelApi, DataSandboxRecord, responseData } from '@/services/data-sandbox';
import {
  formatError,
  formatTime,
  MvpPage,
  RefreshButton,
} from '@/modules/data-sandbox-mvp/common';

const { Text, Paragraph } = Typography;

const statusLabels: Record<string, string> = {
  DATA_PROVIDER_REVIEW: '供数方审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELLED: '已撤回',
  EXECUTING: '处理中',
  COMPLETED: '已完成',
  FAILED: '处理失败',
};

const statusColors: Record<string, string> = {
  DATA_PROVIDER_REVIEW: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
  EXECUTING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
};

/** 解析在线调试输入：支持 JSON 数组 或 {"rows": [...]}。 */
const parseTestInput = (raw: string): DataSandboxRecord => {
  const text = raw.trim();
  if (!text) {
    throw new Error('请输入测试数据');
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error('rows 不能为空');
    }
    return { rows: parsed };
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)) {
    if (parsed.rows.length === 0) {
      throw new Error('rows 不能为空');
    }
    return parsed;
  }
  throw new Error('请输入 JSON 数组或 {"rows": [...]}');
};

/** 兼容滚动升级期间旧节点返回的双层 SecretPadResponse。 */
const normalizeTestResult = (value: DataSandboxRecord): DataSandboxRecord => {
  const nestedStatus = value.status;
  if (!nestedStatus || typeof nestedStatus !== 'object') return value;
  if (Number(nestedStatus.code) !== 0) {
    throw new Error(String(nestedStatus.msg || '申请方节点测试失败'));
  }
  return value.data && typeof value.data === 'object'
    ? (value.data as DataSandboxRecord)
    : value;
};

/** 画布拓扑结构图（轻量 DAG SVG 渲染，data.table 数据资源节点标记挂载表）。 */
const TopologyGraph = ({ graphJson }: { graphJson?: string }) => {
  const layout = useMemo(() => {
    if (!graphJson) return null;
    try {
      const graph = JSON.parse(graphJson);
      const rawNodes: any[] = Array.isArray(graph.nodes) ? graph.nodes : [];
      const edges: { source: string; target: string }[] = Array.isArray(graph.edges)
        ? graph.edges.filter(
            (e: any) =>
              e && typeof e.source === 'string' && typeof e.target === 'string',
          )
        : [];
      const nodes = rawNodes.map((n, i) => {
        const data = n.data && typeof n.data === 'object' ? n.data : {};
        const params =
          data.params && typeof data.params === 'object'
            ? data.params
            : data.param && typeof data.param === 'object'
            ? data.param
            : {};
        return {
          id: String(n.id || `n${i}`),
          code: data.componentCode || data.code || '',
          name: data.name || data.componentCode || data.code || '节点',
          table: params.table || '',
        };
      });
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const inDegree = new Map(nodes.map((n) => [n.id, 0]));
      const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
      edges.forEach((e) => {
        if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
          adj.get(e.source)!.push(e.target);
          inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        }
      });
      // 分层：源节点为第 0 层，逐层下推（取最长路径深度）
      const level = new Map<string, number>();
      const queue = nodes
        .filter((n) => (inDegree.get(n.id) || 0) === 0)
        .map((n) => n.id);
      queue.forEach((id) => level.set(id, 0));
      let head = 0;
      while (head < queue.length) {
        const id = queue[head++];
        (adj.get(id) || []).forEach((next) => {
          const nextLevel = (level.get(id) || 0) + 1;
          if (nextLevel > (level.get(next) ?? -1)) {
            level.set(next, nextLevel);
          }
          queue.push(next);
        });
      }
      const byLevel = new Map<number, typeof nodes>();
      nodes.forEach((n) => {
        const l = level.get(n.id) ?? 0;
        if (!byLevel.has(l)) byLevel.set(l, []);
        byLevel.get(l)!.push(n);
      });
      const columns = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
      const nodeW = 148;
      const nodeH = 48;
      const gapX = 56;
      const gapY = 28;
      const positions = new Map<string, { x: number; y: number }>();
      let maxY = 0;
      let totalW = 0;
      columns.forEach(([col, colNodes]) => {
        let y = 0;
        colNodes.forEach((n) => {
          positions.set(n.id, { x: col * (nodeW + gapX), y });
          y += nodeH + gapY;
        });
        maxY = Math.max(maxY, y - gapY + nodeH);
        totalW = Math.max(totalW, col * (nodeW + gapX) + nodeW);
      });
      return {
        nodes,
        edges,
        positions,
        width: Math.max(totalW + 20, 320),
        height: Math.max(maxY + 20, 120),
        nodeW,
        nodeH,
        byLevel: [...byLevel.keys()].sort((a, b) => a - b),
      };
    } catch {
      return null;
    }
  }, [graphJson]);

  if (!layout) {
    return <Empty description="无拓扑数据" />;
  }
  const mid = (a: number, b: number) => (a + b) / 2;
  return (
    <div style={{ overflow: 'auto', maxHeight: 340 }}>
      <svg width={layout.width} height={layout.height} style={{ display: 'block' }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6 Z" fill="#bfbfbf" />
          </marker>
        </defs>
        {layout.edges.map((e, i) => {
          const s = layout.positions.get(e.source);
          const t = layout.positions.get(e.target);
          if (!s || !t) return null;
          const x1 = s.x + layout.nodeW;
          const y1 = mid(s.y, s.y + layout.nodeH);
          const x2 = t.x;
          const y2 = mid(t.y, t.y + layout.nodeH);
          const cx = mid(x1, x2);
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#bfbfbf"
              strokeWidth="1.4"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
        {layout.nodes.map((n) => {
          const p = layout.positions.get(n.id);
          if (!p) return null;
          const isData = n.code === 'data.table';
          return (
            <g key={n.id}>
              <rect
                x={p.x}
                y={p.y}
                width={layout.nodeW}
                height={layout.nodeH}
                rx={6}
                fill={isData ? '#e6f4ff' : '#f5f5f5'}
                stroke={isData ? '#1677ff' : '#d9d9d9'}
                strokeWidth={1}
              />
              <text
                x={p.x + layout.nodeW / 2}
                y={p.y + 18}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="#333"
              >
                {n.name.length > 12 ? `${n.name.slice(0, 12)}…` : n.name}
              </text>
              <text
                x={p.x + layout.nodeW / 2}
                y={p.y + 34}
                textAnchor="middle"
                fontSize={10}
                fill={isData ? '#1677ff' : '#8c8c8c'}
              >
                {isData && n.table ? n.table : n.code || n.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/** 数据浏览 Modal：审批方查看申请方沙箱中该数据的前 10 行快照。 */
const DataPreviewModal = ({
  item,
  onClose,
}: {
  item?: DataSandboxRecord;
  onClose: () => void;
}) => {
  const preview = item?.preview as DataSandboxRecord | undefined;
  const schema: { name?: string; type?: string }[] = Array.isArray(preview?.schema)
    ? (preview!.schema as any[])
    : [];
  // preview.rows 为位置数组（List<List<String>>），按下标对应 schema 列名
  const rows: string[][] = Array.isArray(preview?.rows)
    ? (preview!.rows as string[][])
    : [];
  const dataSource = rows.map((r) =>
    Object.fromEntries(schema.map((col, j) => [col.name, r[j]])),
  );
  return (
    <Modal
      title={`数据浏览：${item?.name || item?.tableName || ''}`}
      width={720}
      open={!!item}
      onCancel={onClose}
      footer={null}
    >
      {schema.length === 0 ? (
        <Empty description="无数据预览" />
      ) : (
        <Table
          size="small"
          rowKey={(_, i) => String(i)}
          dataSource={dataSource}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={schema.map((col) => ({
            title: col.name,
            dataIndex: col.name,
            key: col.name,
            ellipsis: true,
            render: (v: any) => (v === null || v === undefined ? '' : String(v)),
          }))}
        />
      )}
    </Modal>
  );
};

export const ModelApprovalComponent = () => {
  const [searchParams] = useSearchParams();
  const requestedApprovalId = searchParams.get('approvalId');
  const [activeTab, setActiveTab] = useState('mine');
  const [mine, setMine] = useState<DataSandboxRecord[]>([]);
  const [pending, setPending] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<DataSandboxRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewItem, setPreviewItem] = useState<DataSandboxRecord>();
  const [testText, setTestText] = useState('[\n  {}\n]');
  const [testResult, setTestResult] = useState<DataSandboxRecord>();
  const [testLoading, setTestLoading] = useState(false);

  const payload = (row?: DataSandboxRecord): DataSandboxRecord =>
    (row?.payload as DataSandboxRecord) || {};
  const dataList = (row?: DataSandboxRecord): DataSandboxRecord[] =>
    Array.isArray(payload(row).data) ? (payload(row).data as DataSandboxRecord[]) : [];

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, p] = await Promise.all([
        DataModelApi.approvalMine({ keyword }),
        DataModelApi.approvalPending({ keyword }),
      ]);
      setMine(responseData(m, []));
      setPending(responseData(p, []));
    } catch (requestError: unknown) {
      const detail = formatError(requestError, '加载审批列表失败');
      setError(detail);
      message.error(detail);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setTestResult(undefined);
    setTestText('[\n  {}\n]');
    try {
      const res = responseData(await DataModelApi.modelApiApprovalDetail(id), {});
      setDetail(res);
      const pl = (res.payload as DataSandboxRecord) || {};
      setTestText(
        Array.isArray(pl.data) && (pl.data as any[]).length > 0
          ? `[\n  {}\n]`
          : '[\n  {}\n]',
      );
    } catch (requestError: unknown) {
      message.error(formatError(requestError, '加载详情失败'));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!requestedApprovalId) return;
    setActiveTab('pending');
    openDetail(requestedApprovalId);
  }, [openDetail, requestedApprovalId]);

  const approve = async (action: 'APPROVE' | 'REJECT') => {
    if (!detail) return;
    try {
      responseData(
        await DataModelApi.modelApiApprovalAction({
          id: detail.id,
          action,
          comment: action === 'REJECT' ? '供数方审批驳回' : '供数方审批同意',
        }),
        {},
      );
      message.success(action === 'APPROVE' ? '已同意' : '已驳回');
      setDetailOpen(false);
      refresh();
    } catch (requestError: unknown) {
      message.error(formatError(requestError, '审批操作失败'));
    }
  };

  const cancelApproval = async (id: string) => {
    Modal.confirm({
      title: '撤回申请',
      content: '撤回后临时 API 将关闭，确定撤回该供数方审批申请？',
      onOk: async () => {
        try {
          responseData(await DataModelApi.modelApiApprovalCancel(id), {});
          message.success('已撤回');
          refresh();
        } catch (requestError: unknown) {
          message.error(formatError(requestError, '撤回失败'));
        }
      },
    });
  };

  const runTest = async () => {
    if (!detail) return;
    let body: DataSandboxRecord;
    try {
      body = parseTestInput(testText);
    } catch (e: any) {
      message.error(e.message);
      return;
    }
    setTestLoading(true);
    setTestResult(undefined);
    try {
      const res = responseData(
        await DataModelApi.modelApiApprovalTest({ id: detail.id, ...body }),
        {},
      );
      setTestResult(normalizeTestResult(res));
    } catch (requestError: unknown) {
      message.error(formatError(requestError, '测试执行失败'));
    } finally {
      setTestLoading(false);
    }
  };

  const pl = payload(detail);
  const canApprove = !!detail?.canApprove;
  const canCancel = !!detail?.canCancel;
  // invoke 结果为位置数组 rows（List<List<String>>）+ header，按下标对应列名
  const testRows: string[][] = Array.isArray(testResult?.rows)
    ? (testResult!.rows as string[][])
    : [];
  const testHeader: string[] = Array.isArray(testResult?.header)
    ? (testResult!.header as string[])
    : [];
  const testDataSource = testRows.map((r) =>
    Object.fromEntries(testHeader.map((h, j) => [h, r[j]])),
  );

  const commonColumns = [
    {
      title: '模型名称',
      key: 'modelName',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <strong>{payload(row).modelName || '-'}</strong>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {payload(row).apiName || ''}
          </Text>
        </Space>
      ),
    },
    {
      title: '使用的数据',
      key: 'data',
      render: (_: unknown, row: DataSandboxRecord) => {
        const items = dataList(row);
        return items.length > 0
          ? items.map((d) => d.name || d.tableName || d.assetId).join('、')
          : '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>,
    },
    { title: '提交人', dataIndex: 'submitter', render: (v: string) => v || '-' },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      render: formatTime,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(row.id)}>
            查看详情
          </Button>
          {row.status === 'DATA_PROVIDER_REVIEW' && row.canCancel && (
            <Button type="link" danger onClick={() => cancelApproval(row.id)}>
              撤回
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <MvpPage
      title="模型审批管理"
      description="可视化建模保存的模型使用了供数方数据发布 API 时的供数方审批：我的申请 / 待我审批"
      error={error}
      onRetry={refresh}
      extra={
        <>
          <Input.Search
            placeholder="模型名称或 API 名称"
            allowClear
            onSearch={setKeyword}
            style={{ width: 260 }}
          />
          <RefreshButton loading={loading} onClick={refresh} />
        </>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'mine',
            label: `我的申请${mine.length ? ` (${mine.length})` : ''}`,
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={mine}
                columns={commonColumns}
                pagination={{ pageSize: 10, showSizeChanger: true }}
              />
            ),
          },
          {
            key: 'pending',
            label: `待我审批${pending.length ? ` (${pending.length})` : ''}`,
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={pending}
                columns={[
                  ...commonColumns,
                  {
                    title: '审批',
                    key: 'review',
                    width: 140,
                    render: (_: unknown, row: DataSandboxRecord) =>
                      row.status === 'DATA_PROVIDER_REVIEW' && row.canApprove ? (
                        <Space>
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => {
                              openDetail(row.id).then(() =>
                                setTimeout(() => approve('APPROVE'), 400),
                              );
                            }}
                          >
                            同意
                          </Button>
                          <Button
                            danger
                            size="small"
                            onClick={() => {
                              openDetail(row.id).then(() =>
                                setTimeout(() => approve('REJECT'), 400),
                              );
                            }}
                          >
                            拒绝
                          </Button>
                        </Space>
                      ) : (
                        '-'
                      ),
                  },
                ]}
                pagination={{ pageSize: 10, showSizeChanger: true }}
              />
            ),
          },
        ]}
      />

      <Drawer
        title={detail ? `申请单：${pl.modelName || detail.id}` : '审批详情'}
        width={720}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        extra={
          canApprove ? (
            <Space>
              <Button danger onClick={() => approve('REJECT')}>
                拒绝
              </Button>
              <Button type="primary" onClick={() => approve('APPROVE')}>
                同意
              </Button>
            </Space>
          ) : canCancel ? (
            <Button danger onClick={() => cancelApproval(detail.id)}>
              撤回
            </Button>
          ) : null
        }
      >
        <Spin spinning={detailLoading}>
          {detail && (
            <>
              <Descriptions
                column={2}
                size="small"
                bordered
                items={[
                  {
                    key: 'modelName',
                    label: '模型名称',
                    children: pl.modelName || '-',
                  },
                  { key: 'apiName', label: 'API 名称', children: pl.apiName || '-' },
                  {
                    key: 'status',
                    label: '状态',
                    children: (
                      <Tag color={statusColors[detail.status]}>
                        {statusLabels[detail.status] || detail.status}
                      </Tag>
                    ),
                  },
                  {
                    key: 'submitter',
                    label: '提交人',
                    children: detail.submitter || '-',
                  },
                  {
                    key: 'time',
                    label: '提交时间',
                    children: formatTime(detail.created_at),
                  },
                  {
                    key: 'nodes',
                    label: '供数方节点',
                    children: (detail.votes as DataSandboxRecord[])
                      ?.map((v) => v.voter_node_id)
                      .join('、'),
                  },
                ]}
              />

              <Typography.Title level={5} style={{ marginTop: 20 }}>
                使用的数据
              </Typography.Title>
              {dataList(detail).length === 0 ? (
                <Empty description="无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {dataList(detail).map((d, i) => (
                    <Space
                      key={i}
                      style={{ justifyContent: 'space-between', width: '100%' }}
                    >
                      <Space direction="vertical" size={0}>
                        <strong>{d.name || d.tableName || d.assetId}</strong>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {d.tableName} · 供数方 {d.providerNodeId}
                        </Text>
                      </Space>
                      {d.preview ? (
                        <Button size="small" onClick={() => setPreviewItem(d)}>
                          浏览数据
                        </Button>
                      ) : (
                        <Text type="secondary">无预览</Text>
                      )}
                    </Space>
                  ))}
                </Space>
              )}

              <Typography.Title level={5} style={{ marginTop: 20 }}>
                模型拓扑结构图
              </Typography.Title>
              <TopologyGraph graphJson={pl.graphJson as string} />

              <Typography.Title level={5} style={{ marginTop: 20 }}>
                在线调试（审批方测试）
              </Typography.Title>
              <Paragraph type="secondary" style={{ fontSize: 12 }}>
                填写测试数据（JSON 数组或 {'{'}rows: [...]{'}'}
                ），点击测试查看模型推理结果。 API 凭证（App ID / 密钥）已自动注入。
              </Paragraph>
              <Input.TextArea
                rows={5}
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <Space style={{ marginTop: 8 }}>
                <Button type="primary" loading={testLoading} onClick={runTest}>
                  测试
                </Button>
                {pl.appId && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    App ID：{String(pl.appId)}
                  </Text>
                )}
              </Space>
              {testResult && (
                <Table
                  size="small"
                  style={{ marginTop: 12 }}
                  rowKey={(_, i) => String(i)}
                  dataSource={testDataSource}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  title={() => (
                    <Text>
                      测试结果：{testRows.length} 行 · 耗时{' '}
                      {String(testResult.elapsedMs)} ms
                    </Text>
                  )}
                  columns={
                    testHeader.length > 0
                      ? testHeader.map((col) => ({
                          title: col,
                          dataIndex: col,
                          key: col,
                          ellipsis: true,
                          render: (v: any) =>
                            v === null || v === undefined ? '' : String(v),
                        }))
                      : []
                  }
                />
              )}

              <Typography.Title level={5} style={{ marginTop: 20 }}>
                审批历史
              </Typography.Title>
              <Timeline
                items={(detail.history as DataSandboxRecord[]).map((item) => ({
                  color: item.to_status === 'REJECTED' ? 'red' : 'blue',
                  children: (
                    <>
                      <strong>
                        {item.action}: {item.from_status || '新建'} → {item.to_status}
                      </strong>
                      <div>
                        {item.operator} · {formatTime(item.created_at)}
                      </div>
                      <div>{item.comment || '无审批意见'}</div>
                    </>
                  ),
                }))}
              />
            </>
          )}
        </Spin>
      </Drawer>

      <DataPreviewModal item={previewItem} onClose={() => setPreviewItem(undefined)} />
    </MvpPage>
  );
};
