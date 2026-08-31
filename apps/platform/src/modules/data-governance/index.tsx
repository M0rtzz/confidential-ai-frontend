import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { formatTime, MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { DataGovernanceApi, DataAssetApi, responseData } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

import {
  GovernanceConfigFields,
  governanceColumnsFromPreview,
  maskingFormRows,
  transformMaskingRows,
  transformSamplingForm,
} from './governance-config-form';

const execModeLabels: Record<string, string> = {
  BUILTIN: '内置引擎',
  CUSTOM: '自定义代码',
};

const statusLabels: Record<string, string> = {
  PENDING: '待执行',
  RUNNING: '执行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
};

const statusColors: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  FAILED: 'error',
  CANCELLED: 'default',
};

const CANCELLABLE = ['PENDING', 'RUNNING'];

/** 任务列表筛选项，仅暴露执行中与终态两类结果。 */
const FILTERABLE_STATUS = ['RUNNING', 'SUCCEEDED', 'FAILED'];

export const DataGovernanceComponent = () => {
  /* --------------------------------- 任务 --------------------------------- */
  const [tasks, setTasks] = useState<DataSandboxRecord[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');
  const [taskKeyword, setTaskKeyword] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm] = Form.useForm();
  const [preview, setPreview] = useState<DataSandboxRecord>();
  const [sourceAssets, setSourceAssets] = useState<DataSandboxRecord[]>([]);

  /* ------------------------------- 详情 / 结果 ------------------------------- */
  const [detailItem, setDetailItem] = useState<DataSandboxRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  /* 结果数据展示（仅脱敏后结果可查看；表头携带数据源） */
  const [viewItem, setViewItem] = useState<DataSandboxRecord>();
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const refreshTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      setTasks(
        responseData(
          await DataGovernanceApi.tasks({
            status: taskStatus,
            keyword: taskKeyword,
          }),
          [],
        ),
      );
    } catch (error: any) {
      message.error(error.message || '加载任务失败');
    } finally {
      setTaskLoading(false);
    }
  }, [taskStatus, taskKeyword]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    DataAssetApi.catalog({}).then((response) =>
      setSourceAssets(
        responseData(response, []).filter(
          (asset: DataSandboxRecord) =>
            asset.data_stage === 'RAW' && asset.owned === true,
        ),
      ),
    );
  }, []);

  const openTaskSubmit = () => {
    taskForm.resetFields();
    setPreview(undefined);
    taskForm.setFieldsValue({ execMode: 'BUILTIN' });
    setTaskOpen(true);
  };

  const loadSourcePreview = async (nodeId: string, datatableId: string, limit = 5) => {
    if (!nodeId || !datatableId) {
      message.warning('请先填写源节点与数据表 ID');
      return;
    }
    try {
      const sourcePreview = responseData(
        await DataGovernanceApi.preview(nodeId, datatableId, limit || 5),
        {},
      );
      setPreview(sourcePreview);
      const currentRows = taskForm.getFieldValue('maskingRows') || [];
      taskForm.setFieldValue(
        'maskingRows',
        maskingFormRows(
          transformMaskingRows(currentRows),
          governanceColumnsFromPreview(sourcePreview),
        ),
      );
    } catch (error: any) {
      message.error(error.message || '预览失败');
    }
  };

  const previewSource = async () => {
    const { nodeId, datatableId, limit } = taskForm.getFieldsValue();
    await loadSourcePreview(nodeId, datatableId, limit || 5);
  };

  /** 组装后端契约：内联抽样 {method,...params}、内联脱敏 [{column,method,params}]。 */
  const buildGovernanceTaskPayload = (values: DataSandboxRecord) => {
    const payload: DataSandboxRecord = { ...values };
    delete payload.limit; // 预览行数，非任务参数
    delete payload.samplingMethod;
    delete payload.samplingMode;
    delete payload.samplingCount;
    delete payload.samplingRatio;
    delete payload.samplingSeed;
    delete payload.strataColumns;
    delete payload.clusterMode;
    delete payload.clusterColumn;
    delete payload.blockSize;
    delete payload.maskingRows;
    delete payload.samplingScript;
    const masking = transformMaskingRows(values.maskingRows || []);
    // 自定义抽样由隔离执行组件运行，脚本输出回收后继续执行平台字段脱敏。
    if (values.samplingMethod === 'CUSTOM') {
      payload.execMode = 'CUSTOM';
      payload.script = values.samplingScript;
      delete payload.sampling;
      if (masking.length > 0) {
        payload.masking = masking;
      }
      return payload;
    }
    payload.execMode = 'BUILTIN';
    // 抽样：结构化表单 → {method,...params}
    if (values.samplingMethod) {
      payload.sampling = {
        method: values.samplingMethod,
        ...transformSamplingForm(values),
      };
    }
    // 脱敏：逐列表单 → [{column,method,params}]
    if (masking.length > 0) {
      payload.masking = masking;
    }
    return payload;
  };

  const submitTask = async (values: DataSandboxRecord) => {
    let payload: DataSandboxRecord;
    try {
      payload = buildGovernanceTaskPayload(values);
    } catch (error: any) {
      message.error(error.message || '参数校验失败');
      return;
    }
    try {
      responseData(await DataGovernanceApi.submitTask(payload), {});
      message.success('任务已提交');
      setTaskOpen(false);
      taskForm.resetFields();
      setPreview(undefined);
      refreshTasks();
    } catch (error: any) {
      message.error(error.message || '提交失败');
    }
  };

  const directTask = async (row: DataSandboxRecord, action: 'cancel' | 'retry') => {
    try {
      if (action === 'cancel') {
        responseData(await DataGovernanceApi.cancelTask(row.id), {});
        message.success('任务已取消');
      } else {
        responseData(await DataGovernanceApi.retryTask(row.id), {});
        message.success('已重新执行');
      }
      refreshTasks();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const openDetail = async (row: DataSandboxRecord) => {
    setDetailItem(responseData(await DataGovernanceApi.taskDetail(row.id), {}));
    setDetailOpen(true);
  };

  /** 查看结果数据：仅脱敏后的结果返回行（masked=true）；未脱敏显示提示（含真实数据不可展示）。 */
  const openResultView = async (row: DataSandboxRecord) => {
    setViewLoading(true);
    setViewOpen(true);
    try {
      setViewItem(
        responseData(await DataGovernanceApi.viewResult(row.id), { id: row.id }),
      );
    } catch (error: any) {
      message.error(error.message || '加载结果数据失败');
      setViewItem(undefined);
    } finally {
      setViewLoading(false);
    }
  };

  return (
    <MvpPage
      title="数据抽样与脱敏"
      description="提交抽样与脱敏任务、查看执行结果与源数据预览"
      extra={
        <RefreshButton
          loading={taskLoading}
          onClick={() => {
            refreshTasks();
          }}
        />
      }
    >
      <Tabs
        items={[
          {
            key: 'tasks',
            label: '任务管理',
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Select
                    value={taskStatus}
                    onChange={setTaskStatus}
                    style={{ width: 130 }}
                    options={[
                      { value: '', label: '全部状态' },
                      ...FILTERABLE_STATUS.map((value) => ({
                        value,
                        label: statusLabels[value],
                      })),
                    ]}
                  />
                  <Input.Search
                    placeholder="任务 ID 或名称"
                    allowClear
                    onSearch={setTaskKeyword}
                    style={{ width: 240 }}
                  />
                  <Button type="primary" onClick={openTaskSubmit}>
                    提交任务
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  loading={taskLoading}
                  dataSource={tasks}
                  scroll={{ x: 1200 }}
                  columns={[
                    {
                      title: '任务',
                      dataIndex: 'id',
                      render: (v: string, row: DataSandboxRecord) => (
                        <Space direction="vertical" size={0}>
                          <strong>{row.name || v}</strong>
                          <span style={{ color: '#888' }}>{v}</span>
                        </Space>
                      ),
                    },
                    {
                      title: '源表',
                      render: (_: unknown, row: DataSandboxRecord) =>
                        `${row.source_node_id}/${row.source_datatable_id}`,
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (v: string, row: DataSandboxRecord) => (
                        <Tooltip title={row.error_message || ''}>
                          <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>
                        </Tooltip>
                      ),
                    },
                    {
                      title: '行数',
                      render: (_: unknown, row: DataSandboxRecord) =>
                        `${row.source_rows} → ${row.result_rows}`,
                    },
                    { title: '提交人', dataIndex: 'created_by' },
                    { title: '提交时间', dataIndex: 'created_at', render: formatTime },
                    {
                      title: '操作',
                      width: 220,
                      render: (_: unknown, row: DataSandboxRecord) => (
                        <Space wrap>
                          {CANCELLABLE.includes(row.status) && (
                            <Button
                              type="link"
                              onClick={() => directTask(row, 'cancel')}
                            >
                              取消
                            </Button>
                          )}
                          {row.status === 'FAILED' && (
                            <Button
                              type="link"
                              onClick={() => directTask(row, 'retry')}
                            >
                              重试
                            </Button>
                          )}
                          {row.status === 'SUCCEEDED' && row.result_datatable_id && (
                            <Button type="link" onClick={() => openResultView(row)}>
                              查看结果
                            </Button>
                          )}
                          <Button type="link" onClick={() => openDetail(row)}>
                            详情
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      {/* 任务 提交 */}
      <Modal
        title="提交数据抽样与脱敏任务"
        open={taskOpen}
        width={1180}
        onCancel={() => setTaskOpen(false)}
        onOk={() => taskForm.submit()}
      >
        <Form
          form={taskForm}
          layout="vertical"
          initialValues={{ limit: 5 }}
          onFinish={submitTask}
        >
          <Alert
            type="info"
            showIcon
            message="请直接配置本次任务的抽样方式和字段脱敏规则"
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            name="sourceAssetId"
            label="源数据"
            rules={[{ required: true, message: '请从数据目录选择源数据' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="从数据目录选择本节点源数据"
              onChange={(assetId) => {
                const asset = sourceAssets.find((item) => item.id === assetId);
                taskForm.setFieldsValue({
                  nodeId: asset?.provider_node_id,
                  datatableId: asset?.datatable_id || asset?.id,
                });
                setPreview(undefined);
                if (asset) {
                  void loadSourcePreview(
                    asset.provider_node_id,
                    asset.datatable_id || asset.id,
                    taskForm.getFieldValue('limit') || 5,
                  );
                }
              }}
              options={sourceAssets.map((asset) => ({
                value: asset.id,
                label: `${asset.name}（${asset.provider_node_id}）`,
              }))}
            />
          </Form.Item>
          <Form.Item name="nodeId" hidden rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="datatableId" hidden rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space size="large" wrap style={{ width: '100%' }}>
            <Form.Item name="name" label="任务名称">
              <Input placeholder="默认：抽样脱敏任务-<id>" style={{ width: 220 }} />
            </Form.Item>
          </Space>
          <Form.Item label="源数据预览">
            <Space>
              <Form.Item name="limit" noStyle>
                <InputNumber min={1} max={100} style={{ width: 80 }} />
              </Form.Item>
              <Button onClick={previewSource}>预览前 N 行</Button>
            </Space>
          </Form.Item>
          {preview && (
            <div style={{ marginBottom: 16 }}>
              <Space wrap size={4}>
                <Tag>源表 {preview.name || preview.datatableId}</Tag>
                <Tag>行数 {preview.sourceRows}</Tag>
                <Tag>表头 {(preview.header || []).join(', ')}</Tag>
              </Space>
              <Table
                size="small"
                rowKey={(_, i) => String(i)}
                pagination={false}
                dataSource={(preview.rows || []).map((r: string[]) => {
                  const header = preview.header as string[];
                  return Object.fromEntries(header.map((h, j) => [h, r[j]]));
                })}
                columns={((preview.header as string[]) || []).map((h) => ({
                  title: h,
                  dataIndex: h,
                  ellipsis: true,
                }))}
              />
            </div>
          )}
          <GovernanceConfigFields
            form={taskForm}
            columns={governanceColumnsFromPreview(preview)}
          />
        </Form>
      </Modal>

      {/* 任务详情 */}
      <Drawer
        title={`任务详情：${detailItem?.id || ''}`}
        width={640}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detailItem && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Tag color={statusColors[detailItem.status]}>
                {statusLabels[detailItem.status] || detailItem.status}
              </Tag>
              <Tag color={detailItem.exec_mode === 'CUSTOM' ? 'purple' : 'blue'}>
                {execModeLabels[detailItem.exec_mode] || detailItem.exec_mode}
              </Tag>
              {detailItem.result_datatable_id && (
                <Tag color="green">
                  结果：{detailItem.result_node_id}/{detailItem.result_datatable_id}（
                  {detailItem.result_rows} 行）
                </Tag>
              )}
            </Space>
            {detailItem.error_message && (
              <div style={{ color: '#cf1322' }}>错误：{detailItem.error_message}</div>
            )}
            <div>
              源表：{detailItem.source_node_id}/{detailItem.source_datatable_id}（
              {detailItem.source_rows} 行）
            </div>
            <div>
              创建：{detailItem.created_by} · {formatTime(detailItem.created_at)}
            </div>
            {detailItem.finished_at && (
              <div>完成：{formatTime(detailItem.finished_at)}</div>
            )}
            {detailItem.exec_mode === 'CUSTOM' && detailItem.script_content && (
              <>
                <strong>脚本</strong>
                <pre
                  style={{
                    maxHeight: 300,
                    overflow: 'auto',
                    background: '#f5f5f5',
                    padding: 8,
                  }}
                >
                  {detailItem.script_content}
                </pre>
              </>
            )}
          </Space>
        )}
      </Drawer>

      {/* 结果数据展示（仅脱敏后结果可查看；表头携带数据源） */}
      <Drawer
        title={`结果数据：${viewItem?.resultName || viewItem?.resultDatatableId || ''}`}
        width={980}
        open={viewOpen}
        loading={viewLoading}
        onClose={() => setViewOpen(false)}
      >
        {viewItem && (
          <>
            {/* 数据源 / 结果表 头部 */}
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#f5f7fa',
                marginBottom: 16,
              }}
            >
              <Space wrap size="middle">
                <span>
                  数据源：
                  <Tag color="blue">
                    {viewItem.sourceName || viewItem.sourceDatatableId}（
                    {viewItem.sourceNodeId}/{viewItem.sourceDatatableId}）
                  </Tag>
                </span>
                <span>→</span>
                <span>
                  结果表：
                  <Tag color="green">
                    {viewItem.resultName || viewItem.resultDatatableId}（
                    {viewItem.resultNodeId}/{viewItem.resultDatatableId}）
                  </Tag>
                </span>
                {viewItem.samplingMethod && (
                  <Tag color="cyan">抽样：{viewItem.samplingMethod}</Tag>
                )}
                <Tag color={viewItem.masked ? 'orange' : 'default'}>
                  {viewItem.masked ? '已脱敏' : '未脱敏'}
                </Tag>
                <span>
                  记录数：{viewItem.sourceRows || 0} → {viewItem.resultRows || 0}
                </span>
              </Space>
            </div>

            {viewItem.masked ? (
              <Table
                rowKey={(r, i) => `${i}`}
                size="small"
                dataSource={(viewItem.rows || []).map((r: string[], i: number) => ({
                  __i: i,
                  __row: r,
                }))}
                pagination={{ pageSize: 20 }}
                scroll={{ x: 'max-content' }}
                columns={(viewItem.header || []).map((col: string, i: number) => ({
                  title: col,
                  dataIndex: '__row',
                  width: 140,
                  render: (_: unknown, row: { __row: string[] }) => row.__row[i],
                }))}
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                message="该结果未经脱敏，含真实数据，不予展示"
                description={
                  viewItem.message ||
                  '仅经脱敏（掩码/替换/哈希/取整/空值清除）处理后的结果数据可在此查看；纯抽样或自定义代码输出不在展示范围。'
                }
              />
            )}
          </>
        )}
      </Drawer>
    </MvpPage>
  );
};
