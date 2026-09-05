import {
  ApiOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  LockOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { history } from 'umi';

import {
  ConfidentialAssetApi,
  type ConfidentialAsset,
} from '@/services/confidential-assets';
import {
  ConfidentialTrainingApi,
  type ConfidentialTrainingTask,
  type LlmProvider,
} from '@/services/confidential-training';

import {
  decryptAssetForExecution,
  encryptProviderCredential,
  uploadExecutionResult,
} from './asset-runtime';
import { trainIrisMlp } from './mlp-training';

type TaskForm = {
  taskName: string;
  purpose: string;
  dataAssetVersionId: string;
  modelAssetVersionId: string;
  epochs: number;
  learningRate: number;
};

type ProviderForm = {
  providerName: string;
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  domainId: string;
};

const nodeName = 'confidential-hust';
const statusMeta: Record<string, { color: string; label: string }> = {
  WAITING_APPROVAL: { color: 'warning', label: '等待双资产审批' },
  AUTHORIZED_WAITING_START: { color: 'processing', label: '已授权待启动' },
  RUNNING: { color: 'blue', label: '训练中' },
  COMPLETED: { color: 'success', label: '已完成' },
  FAILED: { color: 'error', label: '失败' },
  REJECTED: { color: 'error', label: '审批拒绝' },
  EXPIRED: { color: 'default', label: '授权过期' },
};

const approvalTag = (status: string) => {
  const meta: Record<string, { color: string; label: string }> = {
    PENDING: { color: 'warning', label: '待审批' },
    APPROVED: { color: 'success', label: '已批准' },
    REJECTED: { color: 'error', label: '已拒绝' },
    RUNNING: { color: 'processing', label: '使用中' },
    COMPLETED: { color: 'success', label: '使用完毕' },
    FAILED: { color: 'error', label: '使用失败' },
  };
  const value = meta[status] || { color: 'default', label: status || '-' };
  return <Tag color={value.color}>{value.label}</Tag>;
};

const time = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';

export const ConfidentialTrainingComponent = () => {
  const [tasks, setTasks] = useState<ConfidentialTrainingTask[]>([]);
  const [assets, setAssets] = useState<ConfidentialAsset[]>([]);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [detail, setDetail] = useState<ConfidentialTrainingTask>();
  const [runningId, setRunningId] = useState<string>();
  const [taskForm] = Form.useForm<TaskForm>();
  const [providerForm] = Form.useForm<ProviderForm>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRows, assetRows, providerRows] = await Promise.all([
        ConfidentialTrainingApi.list(),
        ConfidentialAssetApi.list(),
        ConfidentialTrainingApi.providers(),
      ]);
      setTasks(taskRows);
      setAssets(assetRows);
      setProviders(providerRows);
      if (detail) {
        const selected = taskRows.find((item) => item.taskId === detail.taskId);
        if (selected) setDetail(selected);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '训练任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [detail?.taskId]);

  useEffect(() => void refresh(), [refresh]);

  const dataAssets = useMemo(
    () => assets.filter((item) => item.assetType === 'DATA'),
    [assets],
  );
  const modelAssets = useMemo(
    () => assets.filter((item) => item.assetType === 'MODEL'),
    [assets],
  );

  const createTask = async () => {
    const values = await taskForm.validateFields();
    await ConfidentialTrainingApi.create({
      ...values,
      computeNode: nodeName,
    });
    message.success('训练任务已创建，数据和模型权重分别进入待审批状态');
    setCreateOpen(false);
    taskForm.resetFields();
    await refresh();
  };

  const saveProvider = async () => {
    const values = await providerForm.validateFields();
    const encryptedCredential = values.apiKey
      ? await encryptProviderCredential(values.apiKey, values.domainId)
      : undefined;
    await ConfidentialTrainingApi.saveProvider({
      providerName: values.providerName,
      baseUrl: values.baseUrl.replace(/\/$/, ''),
      modelId: values.modelId,
      encryptedCredential,
      defaultProvider: providers.length === 0,
    });
    providerForm.setFieldValue('apiKey', '');
    setProviderOpen(false);
    message.success('模型 API 已保存，API Key 仅以浏览器加密密文入库');
    await refresh();
  };

  const run = async (selected: ConfidentialTrainingTask) => {
    if (runningId) return;
    setRunningId(selected.taskId);
    let dataBytes: Uint8Array | undefined;
    let modelBytes: Uint8Array | undefined;
    try {
      const started = await ConfidentialTrainingApi.start(selected.taskId);
      setDetail(started);
      message.info('一次性授权已消费，正在受控内存中解密数据与权重');
      [dataBytes, modelBytes] = await Promise.all([
        decryptAssetForExecution(started.dataAssetId),
        decryptAssetForExecution(started.modelAssetId),
      ]);
      const trained = await trainIrisMlp(
        dataBytes,
        modelBytes,
        started.epochs,
        Number(started.learningRate),
        async (epoch, loss, accuracy) => {
          const progress = Math.min(85, 5 + Math.round((epoch / started.epochs) * 80));
          const updated = await ConfidentialTrainingApi.progress(started.taskId, {
            epoch,
            progress,
            metrics: { loss, accuracy },
          });
          setDetail(updated);
        },
      );
      const sourceData = assets.find((item) => item.assetId === started.dataAssetId);
      const sourceModel = assets.find((item) => item.assetId === started.modelAssetId);
      if (!sourceData || !sourceModel) throw new Error('训练输入资产元数据不存在');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const [resultData, resultModel] = await Promise.all([
        uploadExecutionResult({
          bytes: trained.resultCsv,
          fileName: `iris-predictions-${stamp}.csv`,
          name: `${started.taskName} · 预测结果`,
          description: `任务 ${started.taskId} 生成的加密预测结果`,
          assetType: 'RESULT_DATA',
          domainId: sourceData.domainId,
          algorithm: sourceData.algorithm,
          taskId: started.taskId,
          computeNode: started.computeNode,
          sourceDataName: started.dataAssetName,
          sourceModelName: started.modelAssetName,
        }),
        uploadExecutionResult({
          bytes: trained.resultWeights,
          fileName: `iris-mlp-${stamp}.safetensors`,
          name: `${started.taskName} · 新模型权重`,
          description: `任务 ${started.taskId} 训练产生的加密 MLP 权重`,
          assetType: 'RESULT_MODEL',
          domainId: sourceModel.domainId,
          algorithm: sourceModel.algorithm,
          taskId: started.taskId,
          computeNode: started.computeNode,
          sourceDataName: started.dataAssetName,
          sourceModelName: started.modelAssetName,
        }),
      ]);
      const completed = await ConfidentialTrainingApi.complete(started.taskId, {
        resultDataAssetId: resultData.assetId,
        resultModelAssetId: resultModel.assetId,
        metrics: trained.metrics,
      });
      setDetail(completed);
      message.success('真实训练完成，结果数据和新模型权重均已加密入库');
    } catch (error) {
      const reason = error instanceof Error ? error.message : '训练执行失败';
      try {
        await ConfidentialTrainingApi.fail(selected.taskId, reason);
      } catch {
        // Preserve the original execution error.
      }
      message.error(reason);
    } finally {
      dataBytes?.fill(0);
      modelBytes?.fill(0);
      setRunningId(undefined);
      await refresh();
    }
  };

  const pending = tasks.filter((item) => item.status === 'WAITING_APPROVAL').length;
  const running = tasks.filter((item) => item.status === 'RUNNING').length;
  const completed = tasks.filter((item) => item.status === 'COMPLETED').length;

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Typography.Title level={4} style={{ margin: 0 }}>
            节点机密训练任务
          </Typography.Title>
          <Typography.Text type="secondary">
            每次使用数据和模型权重均需独立审批，授权后在受控内存中执行真实训练
          </Typography.Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ApiOutlined />} onClick={() => setProviderOpen(true)}>
              大模型 API 配置
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                taskForm.setFieldsValue({
                  taskName: `Iris MLP 训练 ${tasks.length + 1}`,
                  purpose: '使用加密 Iris 数据和 MLP 权重进行增量训练',
                  epochs: 20,
                  learningRate: 0.003,
                });
                setCreateOpen(true);
              }}
            >
              新建训练任务
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void refresh()}
            />
          </Space>
        </Col>
      </Row>

      <Alert
        showIcon
        type="info"
        message={`当前执行节点：${nodeName}`}
        description="创建任务会同时生成数据使用申请和模型权重使用申请。两项均批准后仍不会自动运行，需要手动启动并消费一次性授权。"
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="任务总数"
              value={tasks.length}
              prefix={<ExperimentOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="等待审批" value={pending} prefix={<LockOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="运行中" value={running} prefix={<PlayCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已完成"
              value={completed}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table
          rowKey="taskId"
          loading={loading}
          dataSource={tasks}
          columns={[
            { title: '任务名称', dataIndex: 'taskName' },
            { title: '数据', dataIndex: 'dataAssetName' },
            { title: '模型权重', dataIndex: 'modelAssetName' },
            {
              title: '审批',
              render: (_, row) => (
                <Space>
                  {approvalTag(row.dataApprovalStatus)}
                  {approvalTag(row.modelApprovalStatus)}
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: string) => (
                <Tag color={(statusMeta[value] || {}).color}>
                  {statusMeta[value]?.label || value}
                </Tag>
              ),
            },
            {
              title: '进度',
              width: 150,
              render: (_, row) => <Progress percent={row.progress || 0} size="small" />,
            },
            { title: '创建时间', dataIndex: 'createdAt', render: time },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button type="link" onClick={() => setDetail(row)}>
                    详情
                  </Button>
                  {row.status === 'WAITING_APPROVAL' && (
                    <Button
                      type="link"
                      onClick={() => history.push('/confidential-compute')}
                    >
                      前往审批
                    </Button>
                  )}
                  {row.status === 'AUTHORIZED_WAITING_START' && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<PlayCircleOutlined />}
                      loading={runningId === row.taskId}
                      onClick={() => void run(row)}
                    >
                      启动任务
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建机密训练任务"
        open={createOpen}
        okText="创建并发起双资产申请"
        onOk={() => void createTask()}
        onCancel={() => setCreateOpen(false)}
        width={680}
      >
        <Alert
          showIcon
          type="warning"
          message="每个新任务都会创建新的数据申请和权重申请；历史授权不会复用。"
          style={{ marginBottom: 16 }}
        />
        <Form form={taskForm} layout="vertical">
          <Form.Item name="taskName" label="任务名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="purpose" label="使用目的" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="dataAssetVersionId"
                label="加密数据版本"
                rules={[{ required: true }]}
              >
                <Select
                  options={dataAssets.map((item) => ({
                    label: `${item.name} · v${item.version}`,
                    value: item.assetVersionId,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="modelAssetVersionId"
                label="加密模型权重版本"
                rules={[{ required: true }]}
              >
                <Select
                  options={modelAssets.map((item) => ({
                    label: `${item.name} · v${item.version}`,
                    value: item.assetVersionId,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="epochs" label="训练轮数" rules={[{ required: true }]}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="learningRate"
                label="学习率"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={0.000001}
                  max={1}
                  step={0.001}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="OpenAI 兼容大模型 API 配置"
        open={providerOpen}
        okText="加密保存"
        onOk={() => void saveProvider()}
        onCancel={() => setProviderOpen(false)}
        width={660}
      >
        <Alert
          showIcon
          type="info"
          message="支持 DeepSeek、OpenAI、vLLM 等 OpenAI 兼容接口。API Key 在浏览器加密后保存，页面不回显明文。"
          style={{ marginBottom: 16 }}
        />
        <Form
          form={providerForm}
          layout="vertical"
          initialValues={{
            providerName: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com',
            modelId: 'deepseek-chat',
            domainId: assets[0]?.domainId || 'a100-domain-a',
          }}
        >
          <Form.Item name="providerName" label="配置名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true }, { type: 'url' }]}
          >
            <Input placeholder="https://api.deepseek.com" />
          </Form.Item>
          <Form.Item name="modelId" label="Model ID" rules={[{ required: true }]}>
            <Input placeholder="deepseek-chat" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password autoComplete="new-password" placeholder="sk-..." />
          </Form.Item>
          <Form.Item
            name="domainId"
            label="凭据所属可信域"
            rules={[{ required: true }]}
          >
            <Select
              options={Array.from(new Set(assets.map((item) => item.domainId))).map(
                (value) => ({ label: value, value }),
              )}
            />
          </Form.Item>
        </Form>
        {providers.length > 0 && (
          <Descriptions
            size="small"
            title="已保存配置"
            column={1}
            bordered
            items={providers.map((item) => ({
              key: item.providerId,
              label: item.providerName,
              children: `${item.baseUrl} · ${item.modelId} · ${item.credentialMasked}`,
            }))}
          />
        )}
      </Modal>

      <Drawer
        title={detail?.taskName}
        width={620}
        open={Boolean(detail)}
        onClose={() => setDetail(undefined)}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
            刷新状态
          </Button>
        }
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务编号">{detail.taskId}</Descriptions.Item>
              <Descriptions.Item label="执行节点">
                {detail.computeNode}
              </Descriptions.Item>
              <Descriptions.Item label="数据申请">
                {approvalTag(detail.dataApprovalStatus)} {detail.dataRequestId}
              </Descriptions.Item>
              <Descriptions.Item label="权重申请">
                {approvalTag(detail.modelApprovalStatus)} {detail.modelRequestId}
              </Descriptions.Item>
              <Descriptions.Item label="训练参数">
                {detail.epochs} epochs / lr={detail.learningRate}
              </Descriptions.Item>
              <Descriptions.Item label="运行指标">
                loss={detail.metrics?.loss?.toFixed?.(6) || '-'} / accuracy=
                {detail.metrics?.accuracy === undefined
                  ? '-'
                  : `${(detail.metrics.accuracy * 100).toFixed(2)}%`}
              </Descriptions.Item>
              <Descriptions.Item label="结果资产">
                {detail.resultDataAssetId || '-'}
                <br />
                {detail.resultModelAssetId || '-'}
              </Descriptions.Item>
            </Descriptions>
            <Progress percent={detail.progress || 0} style={{ marginTop: 20 }} />
            <Timeline
              style={{ marginTop: 24 }}
              items={[
                {
                  color: 'green',
                  children: `任务创建并发起两项申请 · ${time(detail.createdAt)}`,
                },
                {
                  color: detail.dataApprovalStatus === 'APPROVED' ? 'green' : 'gray',
                  children: `数据使用审批：${detail.dataApprovalStatus}`,
                },
                {
                  color: detail.modelApprovalStatus === 'APPROVED' ? 'green' : 'gray',
                  children: `模型权重审批：${detail.modelApprovalStatus}`,
                },
                {
                  color: detail.startedAt ? 'blue' : 'gray',
                  children: detail.startedAt
                    ? `一次性授权消费并启动 · ${time(detail.startedAt)}`
                    : '等待手动启动',
                },
                {
                  color: detail.status === 'COMPLETED' ? 'green' : 'gray',
                  children: detail.completedAt
                    ? `结果重新加密入库 · ${time(detail.completedAt)}`
                    : '等待结果加密入库',
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
};
