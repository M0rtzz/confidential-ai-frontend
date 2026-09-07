import {
  CheckCircleOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  LockOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
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
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { history } from 'umi';

import { bytesToBase64Url } from '@/security/crypto';
import {
  ConfidentialAssetApi,
  type ConfidentialAsset,
} from '@/services/confidential-assets';
import {
  ConfidentialTrainingApi,
  type ConfidentialTrainingTask,
} from '@/services/confidential-training';

type AdapterId = 'hf-sequence-classification-v1' | 'hf-causal-lm-sft-lora-v1';

type TaskForm = {
  taskName: string;
  purpose: string;
  dataAssetVersionId: string;
  modelAssetVersionId: string;
  adapterId: AdapterId;
  epochs: number;
  learningRate: number;
};

const nodeName = 'confidential-hust';
const activeStates = ['RUNNING', 'ENCRYPTING_OUTPUTS'];
const statusMeta: Record<string, { color: string; label: string }> = {
  WAITING_APPROVAL: { color: 'warning', label: '等待双资产审批' },
  AUTHORIZED_WAITING_START: { color: 'processing', label: '已批准待准备' },
  WAITING_KEY_RELEASE: { color: 'warning', label: '等待客户释放密钥' },
  READY_TO_STAGE: { color: 'processing', label: '密钥已释放待启动' },
  RUNNING: { color: 'blue', label: 'GPU 训练中' },
  ENCRYPTING_OUTPUTS: { color: 'processing', label: '正在加密结果' },
  OUTPUT_READY: { color: 'success', label: '密文结果待入库' },
  COMPLETED: { color: 'success', label: '已完成并清理' },
  FAILED: { color: 'error', label: '失败' },
  REJECTED: { color: 'error', label: '审批拒绝' },
  EXPIRED: { color: 'default', label: '授权过期' },
  CANCELLED: { color: 'default', label: '已取消' },
};

const approval = (status: string) => (
  <Tag
    color={
      status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'error' : 'warning'
    }
  >
    {status === 'APPROVED' ? '已批准' : status === 'REJECTED' ? '已拒绝' : '待审批'}
  </Tag>
);

const time = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';

const packageAsset = (asset: ConfidentialAsset) =>
  ['.zip', '.tar', '.tar.gz'].some((suffix) =>
    asset.originalFileName.toLowerCase().endsWith(suffix),
  );

export const ConfidentialTrainingComponent = () => {
  const [tasks, setTasks] = useState<ConfidentialTrainingTask[]>([]);
  const [assets, setAssets] = useState<ConfidentialAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ConfidentialTrainingTask>();
  const [logs, setLogs] = useState<string>();
  const [form] = Form.useForm<TaskForm>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRows, assetRows] = await Promise.all([
        ConfidentialTrainingApi.list(),
        ConfidentialAssetApi.list(),
      ]);
      setTasks(taskRows);
      setAssets(assetRows);
      if (detail) {
        const selected = taskRows.find((item) => item.taskId === detail.taskId);
        if (selected) setDetail(selected);
      }
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '训练任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [detail?.taskId]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    if (!tasks.some((item) => activeStates.includes(item.status))) return undefined;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, tasks]);

  const dataAssets = useMemo(
    () => assets.filter((item) => item.assetType === 'DATA' && packageAsset(item)),
    [assets],
  );
  const modelAssets = useMemo(
    () => assets.filter((item) => item.assetType === 'MODEL' && packageAsset(item)),
    [assets],
  );

  const createTask = async () => {
    const values = await form.validateFields();
    const common = {
      epochs: values.epochs,
      learningRate: values.learningRate,
      trainBatchSize: values.adapterId.startsWith('hf-causal') ? 1 : 16,
      evalBatchSize: values.adapterId.startsWith('hf-causal') ? 1 : 32,
      mixedPrecision: 'bf16',
      seed: 42,
      maxRuntimeSeconds: 7200,
    };
    const trainingConfig = values.adapterId.startsWith('hf-causal')
      ? {
          ...common,
          datasetFormat: 'conversational',
          messagesColumn: 'messages',
          maxSequenceLength: 1024,
          gradientAccumulationSteps: 8,
          gradientCheckpointing: true,
          assistantOnlyLoss: true,
          packing: false,
          lora: {
            r: 16,
            alpha: 32,
            dropout: 0.05,
            targetModules: 'all-linear',
            bias: 'none',
          },
        }
      : {
          ...common,
          textColumn: 'sentence',
          labelColumn: 'label',
          numLabels: 2,
          maxLength: 256,
          weightDecay: 0.01,
          warmupRatio: 0.1,
        };
    await ConfidentialTrainingApi.create({
      ...values,
      computeNode: nodeName,
      trainingConfig,
    });
    setCreateOpen(false);
    form.resetFields();
    message.success('训练任务已创建，模型包和数据包分别等待客户审批');
    await refresh();
  };

  const act = async (task: ConfidentialTrainingTask) => {
    if (workingId) return;
    setWorkingId(task.taskId);
    try {
      let updated: ConfidentialTrainingTask;
      if (task.status === 'AUTHORIZED_WAITING_START') {
        updated = await ConfidentialTrainingApi.prepare(
          task.taskId,
          bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
        );
        message.success('证明会话已创建，请客户在资产使用申请中释放本次密钥');
      } else if (task.status === 'READY_TO_STAGE') {
        updated = await ConfidentialTrainingApi.start(task.taskId);
        message.success('输入已送入 CipherGPU，GPU 训练正在异步执行');
      } else if (task.status === 'OUTPUT_READY') {
        updated = await ConfidentialTrainingApi.collectOutputs(task.taskId);
        message.success('CipherGPU 密文结果已入库，任务明文已清理');
      } else {
        return;
      }
      setDetail(updated);
      await refresh();
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '训练操作失败');
    } finally {
      setWorkingId(undefined);
    }
  };

  const showLogs = async (task: ConfidentialTrainingTask) => {
    try {
      const result = await ConfidentialTrainingApi.logs(task.taskId);
      const notes = [
        result.snapshot
          ? `已保存的末尾日志${result.savedAt ? ` · ${time(result.savedAt)}` : ''}`
          : '',
        result.truncated ? '日志超过 64 KiB，仅保留末尾内容' : '',
      ].filter(Boolean);
      setLogs(
        [notes.length ? `[${notes.join('；')}]` : '', result.logs]
          .filter(Boolean)
          .join('\n') ||
          result.unavailableReason ||
          '当前尚无日志',
      );
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '日志加载失败');
    }
  };

  const cancel = async (task: ConfidentialTrainingTask) => {
    setWorkingId(task.taskId);
    try {
      await ConfidentialTrainingApi.cancel(task.taskId);
      message.success('训练已取消，CipherGPU 已执行明文清理');
      await refresh();
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '取消训练失败');
    } finally {
      setWorkingId(undefined);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Typography.Title level={4} style={{ margin: 0 }}>
            大模型训练任务
          </Typography.Title>
          <Typography.Text type="secondary">
            双资产审批和一次性密钥释放后，在 CipherGPU 内执行大模型训练与结果加密
          </Typography.Text>
        </Col>
        <Col>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.setFieldsValue({
                  taskName: `GPU 机密训练 ${tasks.length + 1}`,
                  purpose: '使用客户加密模型包和训练数据包执行 GPU 训练',
                  adapterId: 'hf-sequence-classification-v1',
                  epochs: 2,
                  learningRate: 0.00002,
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
        description="节点管理员负责调度和启动；客户在数据与模型权重管理页面审批并为本次 TEK 释放两个资产 DEK。"
        style={{ marginBottom: 16 }}
      />

      <Row gutter={24} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Statistic
            title="任务总数"
            value={tasks.length}
            prefix={<ExperimentOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="等待审批/放钥"
            value={
              tasks.filter((item) =>
                ['WAITING_APPROVAL', 'WAITING_KEY_RELEASE'].includes(item.status),
              ).length
            }
            prefix={<LockOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="GPU 运行中"
            value={tasks.filter((item) => activeStates.includes(item.status)).length}
            prefix={<PlayCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="已完成"
            value={tasks.filter((item) => item.status === 'COMPLETED').length}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
      </Row>

      <Table
        rowKey="taskId"
        loading={loading}
        dataSource={tasks}
        columns={[
          { title: '任务', dataIndex: 'taskName' },
          { title: '训练适配器', dataIndex: 'adapterId', ellipsis: true },
          { title: '数据包', dataIndex: 'dataAssetName' },
          { title: '模型包', dataIndex: 'modelAssetName' },
          {
            title: '审批',
            render: (_, row) => (
              <Space>
                {approval(row.dataApprovalStatus)}
                {approval(row.modelApprovalStatus)}
              </Space>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value: string) => (
              <Tag color={statusMeta[value]?.color}>
                {statusMeta[value]?.label || value}
              </Tag>
            ),
          },
          {
            title: '进度',
            width: 150,
            render: (_, row) => <Progress percent={row.progress || 0} size="small" />,
          },
          {
            title: '操作',
            width: 300,
            render: (_, row) => (
              <Space wrap>
                <Button type="link" onClick={() => setDetail(row)}>
                  详情
                </Button>
                {row.status === 'WAITING_APPROVAL' && (
                  <Button
                    type="link"
                    onClick={() => history.push('/confidential-compute')}
                  >
                    等待客户审批
                  </Button>
                )}
                {[
                  'AUTHORIZED_WAITING_START',
                  'READY_TO_STAGE',
                  'OUTPUT_READY',
                ].includes(row.status) && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    loading={workingId === row.taskId}
                    onClick={() => void act(row)}
                  >
                    {row.status === 'AUTHORIZED_WAITING_START'
                      ? '准备证明'
                      : row.status === 'READY_TO_STAGE'
                      ? '启动 GPU 训练'
                      : '保存密文结果'}
                  </Button>
                )}
                {row.status === 'WAITING_KEY_RELEASE' && (
                  <Button
                    size="small"
                    onClick={() => history.push('/confidential-compute')}
                  >
                    等待客户放钥
                  </Button>
                )}
                {[
                  'RUNNING',
                  'ENCRYPTING_OUTPUTS',
                  'OUTPUT_READY',
                  'COMPLETED',
                  'FAILED',
                  'CANCELLED',
                ].includes(row.status) && (
                  <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    onClick={() => void showLogs(row)}
                  >
                    日志
                  </Button>
                )}
                {!['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED'].includes(
                  row.status,
                ) && (
                  <Button
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    loading={workingId === row.taskId}
                    onClick={() => void cancel(row)}
                  >
                    取消
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新建机密训练任务"
        open={createOpen}
        width={720}
        okText="创建并发起双资产申请"
        onOk={() => void createTask()}
        onCancel={() => setCreateOpen(false)}
      >
        <Alert
          showIcon
          type="warning"
          message="只接受完整模型包和完整训练数据包；每个新任务都需要新的审批与密钥释放。"
          style={{ marginBottom: 16 }}
        />
        {(!dataAssets.length || !modelAssets.length) && (
          <Alert
            showIcon
            type="info"
            message="请先以 ZIP、TAR 或 TAR.GZ 上传模型包和训练数据包"
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={form} layout="vertical">
          <Form.Item name="taskName" label="任务名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="purpose" label="使用目的" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="adapterId"
            label="受信训练适配器"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                {
                  label: '小模型文本分类（Transformers Trainer）',
                  value: 'hf-sequence-classification-v1',
                },
                {
                  label: '大模型对话 SFT（TRL + LoRA）',
                  value: 'hf-causal-lm-sft-lora-v1',
                },
              ]}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="dataAssetVersionId"
                label="加密训练数据包"
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
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
                label="加密模型包"
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
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
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="learningRate"
                label="学习率"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={0.0000001}
                  max={0.01}
                  step={0.00001}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title="训练任务详情"
        width={720}
        open={Boolean(detail)}
        onClose={() => setDetail(undefined)}
      >
        {detail && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="任务 ID">{detail.taskId}</Descriptions.Item>
            <Descriptions.Item label="适配器">{detail.adapterId}</Descriptions.Item>
            <Descriptions.Item label="模型包">
              {detail.modelAssetName}
            </Descriptions.Item>
            <Descriptions.Item label="数据包">{detail.dataAssetName}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {statusMeta[detail.status]?.label || detail.status}
            </Descriptions.Item>
            <Descriptions.Item label="当前 Epoch">
              {detail.currentEpoch || 0}
            </Descriptions.Item>
            <Descriptions.Item label="指标">
              <pre>{JSON.stringify(detail.metrics || {}, null, 2)}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="结果模型资产">
              {detail.resultModelAssetId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="结果数据资产">
              {detail.resultDataAssetId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="开始时间">
              {time(detail.startedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="完成时间">
              {time(detail.completedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="失败原因">
              {detail.failureReason || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <Modal
        title="CipherGPU 训练日志"
        open={logs !== undefined}
        footer={null}
        width={900}
        onCancel={() => setLogs(undefined)}
      >
        <pre style={{ maxHeight: 560, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {logs}
        </pre>
      </Modal>
    </div>
  );
};
