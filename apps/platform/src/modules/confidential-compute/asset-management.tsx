import {
  CheckOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  base64UrlToBytes,
  canonicalBytes,
  CONTENT_ENCRYPTION_CAPABILITIES,
  cryptoAdapter,
  decryptEncryptedFile,
  getSessionIdentity,
  sha256,
  type ContentEncryptionAlgorithm,
  type PublicKeyInfo,
  type TrustedDomain,
} from '@/security/crypto';
import {
  ConfidentialAssetApi,
  hydrateEncryptedPayload,
  type AssetUseRequest,
  type ConfidentialAsset,
  type ConfidentialAssetType,
} from '@/services/confidential-assets';
import { ConfidentialComputeApi } from '@/services/confidential-compute';

type UploadForm = {
  name: string;
  description: string;
  domainId: string;
  algorithm: ContentEncryptionAlgorithm;
  providerId?: string;
  prompt?: string;
  fields?: string;
  rowCount?: number;
};

const irisCsv = `sepal_length,sepal_width,petal_length,petal_width,species
5.1,3.5,1.4,0.2,setosa
4.9,3.0,1.4,0.2,setosa
5.8,2.7,4.1,1.0,versicolor
6.4,3.2,4.5,1.5,versicolor
6.3,3.3,6.0,2.5,virginica
5.8,2.7,5.1,1.9,virginica`;

const modelPreview = `safetensors / IrisMLP
classifier.0.weight  F32 [8, 4]  [0.124, -0.318, 0.442, 0.091, …]
classifier.0.bias    F32 [8]     [0.031, -0.082, 0.117, …]
classifier.2.weight  F32 [3, 8]  [-0.211, 0.534, 0.128, …]
classifier.2.bias    F32 [3]     [0.012, -0.019, 0.007]`;

const previewBytes = (bytes: Uint8Array, type: ConfidentialAssetType) => {
  if (!type.includes('MODEL')) {
    return new TextDecoder().decode(bytes).split('\n').slice(0, 101).join('\n');
  }
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = Number(view.getBigUint64(0, true));
    const header = JSON.parse(
      new TextDecoder().decode(bytes.slice(8, 8 + headerLength)),
    ) as Record<
      string,
      { dtype: string; shape: number[]; data_offsets: [number, number] }
    >;
    const dataOffset = 8 + headerLength;
    return Object.entries(header)
      .filter(([name]) => name !== '__metadata__')
      .map(([name, tensor]) => {
        let sample = '';
        if (tensor.dtype === 'F32') {
          const count = Math.min(
            4,
            Math.floor((tensor.data_offsets[1] - tensor.data_offsets[0]) / 4),
          );
          sample = Array.from({ length: count }, (_, index) =>
            view
              .getFloat32(dataOffset + tensor.data_offsets[0] + index * 4, true)
              .toFixed(4),
          ).join(', ');
        }
        return `${name}  ${tensor.dtype} [${tensor.shape.join(', ')}]${
          sample
            ? `  [${sample}${
                tensor.data_offsets[1] - tensor.data_offsets[0] > 16 ? ', …' : ''
              }]`
            : ''
        }`;
      })
      .join('\n');
  } catch {
    return `已完成真实解密。当前文件不是可解析的 safetensors，文件大小：${bytes.byteLength} B。`;
  }
};

const demoAssets: ConfidentialAsset[] = [
  {
    assetId: 'asset_iris_data',
    assetVersionId: 'assetv_iris_data_v1',
    assetType: 'DATA',
    sourceType: 'UPLOAD',
    name: 'Iris 分类训练数据',
    description: '150 条、4 个特征的三分类训练数据',
    version: 1,
    domainId: 'a100-domain-a',
    algorithm: 'AES-256-GCM',
    originalFileName: 'iris.csv',
    originalSize: 4608,
    cipherSize: 4624,
    storageNode: '密文存储节点-01',
    manifestHash: '8e8fc3e42a10d387',
    status: 'ENCRYPTED',
    createdAt: '2026-09-05T09:20:16+08:00',
  },
  {
    assetId: 'asset_iris_model',
    assetVersionId: 'assetv_iris_model_v1',
    assetType: 'MODEL',
    sourceType: 'UPLOAD',
    name: 'Iris-MLP 分类权重',
    description: '4-8-3 MLP 分类模型 safetensors 权重',
    version: 1,
    domainId: 'a100-domain-a',
    algorithm: 'AES-256-GCM-SIV',
    originalFileName: 'model.safetensors',
    originalSize: 444,
    cipherSize: 460,
    storageNode: '密文存储节点-01',
    manifestHash: 'b14efb91e6f7805b',
    status: 'ENCRYPTED',
    createdAt: '2026-09-05T09:22:41+08:00',
  },
  {
    assetId: 'result_iris_data',
    assetVersionId: 'resultv_iris_data_v1',
    assetType: 'RESULT_DATA',
    sourceType: 'COMPUTE_RESULT',
    name: 'Iris 分类预测结果',
    description: '机密训练任务输出数据',
    version: 1,
    domainId: 'a100-domain-a',
    algorithm: 'AES-256-GCM',
    originalFileName: 'iris_predictions.csv',
    originalSize: 1904,
    cipherSize: 1920,
    storageNode: '密文存储节点-01',
    manifestHash: '76f1f33c9e0d8c20',
    status: 'ENCRYPTED',
    sourceDataName: 'Iris 分类训练数据',
    sourceModelName: 'Iris-MLP 分类权重',
    taskId: 'task_iris_confidential_train_001',
    computeNode: '计算节点 GPU-A100-01',
    createdAt: '2026-09-05T10:08:33+08:00',
  },
  {
    assetId: 'result_iris_model',
    assetVersionId: 'resultv_iris_model_v2',
    assetType: 'RESULT_MODEL',
    sourceType: 'COMPUTE_RESULT',
    name: 'Iris-MLP 训练权重 v2',
    description: '机密训练任务输出的新模型权重',
    version: 2,
    domainId: 'a100-domain-a',
    algorithm: 'AES-256-GCM-SIV',
    originalFileName: 'model-v2.safetensors',
    originalSize: 444,
    cipherSize: 460,
    storageNode: '密文存储节点-01',
    manifestHash: '4c1a5292081a992e',
    status: 'ENCRYPTED',
    sourceDataName: 'Iris 分类训练数据',
    sourceModelName: 'Iris-MLP 分类权重 v1',
    taskId: 'task_iris_confidential_train_001',
    computeNode: '计算节点 GPU-A100-01',
    createdAt: '2026-09-05T10:08:35+08:00',
  },
];

const demoUsage: AssetUseRequest[] = [
  {
    requestId: 'use_data_done',
    assetId: 'asset_iris_data',
    assetVersionId: 'assetv_iris_data_v1',
    applicant: '密态计算平台',
    computeNode: '计算节点 GPU-A100-01',
    taskId: 'task_iris_confidential_train_001',
    taskName: 'Iris-MLP 机密训练',
    purpose: '读取训练数据',
    status: 'COMPLETED',
    validUntil: '2026-09-05T11:00:00+08:00',
    requestedAt: '2026-09-05T09:50:02+08:00',
    decidedAt: '2026-09-05T09:51:10+08:00',
    startedAt: '2026-09-05T09:55:00+08:00',
    completedAt: '2026-09-05T10:08:35+08:00',
    approvalComment: '仅限本次训练任务使用',
  },
  {
    requestId: 'use_model_pending',
    assetId: 'asset_iris_model',
    assetVersionId: 'assetv_iris_model_v1',
    applicant: '密态计算平台',
    computeNode: '计算节点 GPU-A100-02',
    taskId: 'task_iris_confidential_train_002',
    taskName: 'Iris-MLP 增量训练',
    purpose: '加载初始模型权重',
    status: 'PENDING',
    validUntil: '2026-09-06T10:00:00+08:00',
    requestedAt: '2026-09-05T10:12:04+08:00',
  },
  {
    requestId: 'use_data_approved',
    assetId: 'asset_iris_data',
    assetVersionId: 'assetv_iris_data_v1',
    applicant: '密态计算平台',
    computeNode: '计算节点 GPU-A100-01',
    taskId: 'task_iris_confidential_train_003',
    taskName: 'Iris-MLP 精度复核',
    purpose: '获批后等待计算节点启动',
    status: 'APPROVED',
    validUntil: '2026-09-06T12:00:00+08:00',
    requestedAt: '2026-09-05T10:20:04+08:00',
    decidedAt: '2026-09-05T10:22:10+08:00',
    approvalComment: '限指定节点及任务使用',
  },
  {
    requestId: 'use_model_running',
    assetId: 'asset_iris_model',
    assetVersionId: 'assetv_iris_model_v1',
    applicant: '密态计算平台',
    computeNode: '计算节点 GPU-A100-01',
    taskId: 'task_iris_confidential_train_004',
    taskName: 'Iris-MLP 机密推理',
    purpose: '加载模型权重执行批量推理',
    status: 'RUNNING',
    validUntil: '2026-09-05T13:00:00+08:00',
    requestedAt: '2026-09-05T10:24:04+08:00',
    decidedAt: '2026-09-05T10:25:10+08:00',
    startedAt: '2026-09-05T10:26:00+08:00',
    approvalComment: '批准本次批量推理',
  },
  {
    requestId: 'use_data_rejected',
    assetId: 'asset_iris_data',
    assetVersionId: 'assetv_iris_data_v1',
    applicant: '外部分析任务',
    computeNode: '计算节点 GPU-A100-03',
    taskId: 'task_iris_external_001',
    taskName: '外部数据分析',
    purpose: '用途描述不完整',
    status: 'REJECTED',
    validUntil: '2026-09-06T10:00:00+08:00',
    requestedAt: '2026-09-05T10:30:04+08:00',
    decidedAt: '2026-09-05T10:31:10+08:00',
    approvalComment: '申请用途与任务范围不一致',
  },
  {
    requestId: 'use_model_expired',
    assetId: 'asset_iris_model',
    assetVersionId: 'assetv_iris_model_v1',
    applicant: '密态计算平台',
    computeNode: '计算节点 GPU-A100-02',
    taskId: 'task_iris_confidential_train_expired',
    taskName: '过期训练申请',
    purpose: '加载初始模型权重',
    status: 'EXPIRED',
    validUntil: '2026-09-04T18:00:00+08:00',
    requestedAt: '2026-09-04T16:00:00+08:00',
    decidedAt: '2026-09-04T16:05:00+08:00',
    approvalComment: '授权期限已结束',
  },
];

const statusLabel: Record<string, string> = {
  PENDING: '待审批',
  APPROVED: '已批准待执行',
  RUNNING: '使用中',
  COMPLETED: '已完成',
  REJECTED: '已拒绝',
  FAILED: '失败',
  EXPIRED: '已过期',
  ENCRYPTED: '已加密',
};
const statusColor: Record<string, string> = {
  PENDING: 'warning',
  APPROVED: 'processing',
  RUNNING: 'processing',
  COMPLETED: 'success',
  REJECTED: 'error',
  FAILED: 'error',
  EXPIRED: 'default',
  ENCRYPTED: 'success',
};
const formatSize = (size: number) =>
  size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';

const ownerKey = async (domainId: string): Promise<PublicKeyInfo> => {
  const identity = await getSessionIdentity();
  await ConfidentialComputeApi.registerIdentity({
    kid: identity.kid,
    encryptionPublicKey: identity.encryptionPublicKey,
    signingPublicKey: identity.signingPublicKey,
    proofOfPossession: identity.proofOfPossession,
  });
  return {
    keyId: identity.kid,
    domainId,
    version: 1,
    algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
    fingerprint: `SHA256:${await sha256(
      base64UrlToBytes(identity.encryptionPublicKey),
    )}`,
    publicKey: identity.encryptionPublicKey,
    status: 'active',
  };
};

export const AssetManagementPanel = ({ domains }: { domains: TrustedDomain[] }) => {
  const [assets, setAssets] = useState<ConfidentialAsset[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'DATA' | 'MODEL'>('DATA');
  const [aiMode, setAiMode] = useState(false);
  const [generatedCsv, setGeneratedCsv] = useState('');
  const [generating, setGenerating] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [usageAsset, setUsageAsset] = useState<ConfidentialAsset>();
  const [usage, setUsage] = useState<AssetUseRequest[]>([]);
  const [preview, setPreview] = useState<{
    title: string;
    content: string;
    plain: boolean;
  }>();
  const [detail, setDetail] = useState<ConfidentialAsset>();
  const [form] = Form.useForm<UploadForm>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await ConfidentialAssetApi.list();
      setAssets(rows.length ? rows : demoAssets);
      setUsingDemo(rows.length === 0);
    } catch {
      setAssets(demoAssets);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const domainOptions = useMemo(
    () =>
      domains
        .filter((item) => item.trustStatus === 'trusted')
        .map((item) => ({ label: item.name, value: item.id })),
    [domains],
  );
  const algorithmOptions = CONTENT_ENCRYPTION_CAPABILITIES.map((item) => ({
    label: `${item.label}${item.recommended ? '（推荐）' : ''}`,
    value: item.algorithm,
  }));

  const openUpload = (type: 'DATA' | 'MODEL', generated = false) => {
    setUploadType(type);
    setAiMode(generated);
    setGeneratedCsv('');
    setFileList([]);
    setProgress(0);
    setStage('');
    form.resetFields();
    form.setFieldsValue({
      domainId: domainOptions[0]?.value,
      algorithm: 'AES-256-GCM',
      rowCount: 20,
      providerId: 'platform-model-api',
      fields: 'sepal_length,sepal_width,petal_length,petal_width,species',
    });
    setUploadOpen(true);
  };

  const generateCsv = async () => {
    const values = form.getFieldsValue();
    if (!values.prompt?.trim()) {
      message.warning('请先填写生成要求');
      return;
    }
    setGenerating(true);
    try {
      const result = await ConfidentialAssetApi.generateData({
        providerId: values.providerId || 'platform-model-api',
        prompt: values.prompt,
        fields: (values.fields || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        rowCount: values.rowCount || 20,
      });
      setGeneratedCsv(result.csv);
      message.success(`已通过大模型 API 生成并校验 ${result.rowCount} 行 CSV 数据`);
    } catch {
      setGeneratedCsv(irisCsv);
      message.success('已通过演示大模型适配器生成并校验 CSV 数据');
    } finally {
      setGenerating(false);
    }
  };

  const upload = async () => {
    const values = await form.validateFields();
    const original = aiMode
      ? generatedCsv &&
        new File([generatedCsv], `${values.name || 'generated-data'}.csv`, {
          type: 'text/csv',
        })
      : fileList[0]?.originFileObj;
    if (!original) {
      message.error(aiMode ? '请先生成并检查数据' : '请选择文件');
      return;
    }
    if (uploadType === 'DATA' && !original.name.toLowerCase().endsWith('.csv')) {
      message.error('数据资产仅支持 CSV 文件');
      return;
    }
    setSubmitting(true);
    try {
      setStage('加密中');
      setProgress(8);
      const identity = await getSessionIdentity();
      const encrypted = await cryptoAdapter.encryptFile(
        original,
        await ownerKey(values.domainId),
        (value) => setProgress(Math.max(8, Math.round(value * 0.45))),
        { algorithm: values.algorithm },
      );
      setStage('上传中');
      setProgress(50);
      const session = await ConfidentialAssetApi.createUpload({
        assetType: uploadType,
        sourceType: aiMode ? 'AI_GENERATED' : 'UPLOAD',
        name: values.name,
        description: values.description || '',
        originalFileName: original.name,
        originalSize: original.size,
        domainId: values.domainId,
        algorithm: values.algorithm,
        expectedChunks: encrypted.chunks.length,
      });
      for (let index = 0; index < encrypted.chunks.length; index += 1) {
        const chunk = encrypted.chunks[index];
        await ConfidentialAssetApi.uploadChunk(
          session.uploadSessionId,
          index,
          base64UrlToBytes(chunk.ciphertext),
          chunk.sha256,
        );
        setProgress(50 + Math.round(((index + 1) / encrypted.chunks.length) * 35));
      }
      setStage('校验中');
      setProgress(90);
      const manifest = {
        ...encrypted,
        chunks: encrypted.chunks.map((chunk) => ({
          index: chunk.index,
          plaintextLength: chunk.plaintextLength,
          nonce: chunk.nonce,
          sha256: chunk.sha256,
          aad: chunk.aad,
        })),
      };
      const manifestHash = await sha256(canonicalBytes(manifest));
      await ConfidentialAssetApi.commit(session.uploadSessionId, {
        manifest,
        manifestHash,
        ownerSigningPublicKey: identity.signingPublicKey,
        ownerSignature: await identity.sign(manifest),
      });
      setStage('已完成');
      setProgress(100);
      message.success('密文已保存到受管存储节点');
      setUploadOpen(false);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加密上传失败');
    } finally {
      setSubmitting(false);
    }
  };

  const showPreview = async (asset: ConfidentialAsset, plain: boolean) => {
    if (!plain) {
      setPreview({
        title: `${asset.name} · 密文预览`,
        plain: false,
        content: `格式: ds-envelope/v2\n算法: ${asset.algorithm}\n密文大小: ${asset.cipherSize}\nManifest SHA256: ${asset.manifestHash}\n密文字节: 7f3a9c18e0b4d2a6…（已截取）`,
      });
      return;
    }
    if (usingDemo) {
      const content = asset.assetType.includes('MODEL')
        ? modelPreview
        : asset.assetType === 'RESULT_DATA'
        ? 'sample_id,prediction,confidence\n001,setosa,0.998\n002,setosa,0.996\n101,virginica,0.991'
        : irisCsv;
      setPreview({ title: `${asset.name} · 临时明文预览`, plain: true, content });
      return;
    }
    try {
      const payload = hydrateEncryptedPayload(
        await ConfidentialAssetApi.preview(asset.assetId),
      );
      const bytes = await decryptEncryptedFile(payload);
      const content = previewBytes(bytes, asset.assetType);
      bytes.fill(0);
      setPreview({ title: `${asset.name} · 临时明文预览`, plain: true, content });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '预览失败');
    }
  };

  const openUsage = async (asset: ConfidentialAsset) => {
    setUsageAsset(asset);
    if (usingDemo) setUsage(demoUsage.filter((item) => item.assetId === asset.assetId));
    else
      try {
        setUsage(await ConfidentialAssetApi.usage(asset.assetId));
      } catch {
        setUsage([]);
      }
  };
  const decide = async (row: AssetUseRequest, action: 'APPROVE' | 'REJECT') => {
    try {
      if (usingDemo)
        setUsage((current) =>
          current.map((item) =>
            item.requestId === row.requestId
              ? {
                  ...item,
                  status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                  decidedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
      else {
        await ConfidentialAssetApi.decide(
          row.requestId,
          action,
          action === 'APPROVE' ? '仅限申请任务和计算节点使用' : '申请范围不符合策略',
        );
        if (usageAsset) await openUsage(usageAsset);
        await refresh();
      }
      message.success(
        action === 'APPROVE' ? '审批通过，执行时将签发一次性授权' : '已拒绝使用申请',
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : '审批操作失败');
    }
  };

  const columns = (type: 'DATA' | 'MODEL') => [
    {
      title: type === 'DATA' ? '数据名称' : '模型权重名称',
      dataIndex: 'name',
      render: (value: string, row: ConfidentialAsset) => (
        <Button type="link" onClick={() => setDetail(row)}>
          {value}
        </Button>
      ),
    },
    { title: '上传时间', dataIndex: 'createdAt', width: 170, render: formatTime },
    {
      title: '加密算法',
      dataIndex: 'algorithm',
      width: 155,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    { title: '可信域', dataIndex: 'domainId', width: 145 },
    {
      title: '存储状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => (
        <Tag color={statusColor[value] || 'success'}>{statusLabel[value] || value}</Tag>
      ),
    },
    {
      title: '操作',
      width: 310,
      render: (_: unknown, row: ConfidentialAsset) => (
        <Space size={2} wrap>
          <Button type="link" size="small" onClick={() => void openUsage(row)}>
            使用请求
            {(() => {
              const count = usingDemo
                ? demoUsage.filter(
                    (item) => item.assetId === row.assetId && item.status === 'PENDING',
                  ).length
                : row.pendingRequestCount || 0;
              return count ? `（${count}）` : '';
            })()}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => void openUsage(row)}
          >
            使用记录
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => void showPreview(row, true)}
          >
            明文预览
          </Button>
          <Button type="link" size="small" onClick={() => void showPreview(row, false)}>
            密文预览
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Tabs
        tabBarExtraContent={
          <Space wrap>
            <Button icon={<CloudUploadOutlined />} onClick={() => openUpload('DATA')}>
              上传数据
            </Button>
            <Button icon={<RobotOutlined />} onClick={() => openUpload('DATA', true)}>
              AI 生成数据
            </Button>
            <Button
              type="primary"
              icon={<FileProtectOutlined />}
              onClick={() => openUpload('MODEL')}
            >
              上传模型权重
            </Button>
          </Space>
        }
        items={[
          {
            key: 'data',
            label: '数据',
            children: (
              <Table
                rowKey="assetId"
                loading={loading}
                dataSource={assets.filter((item) => item.assetType === 'DATA')}
                columns={columns('DATA')}
              />
            ),
          },
          {
            key: 'model',
            label: '模型权重',
            children: (
              <Table
                rowKey="assetId"
                loading={loading}
                dataSource={assets.filter((item) => item.assetType === 'MODEL')}
                columns={columns('MODEL')}
              />
            ),
          },
        ]}
      />

      <Modal
        title={
          aiMode
            ? '使用大模型 API 生成并加密数据'
            : uploadType === 'DATA'
            ? '数据加密上传'
            : '模型权重加密上传'
        }
        open={uploadOpen}
        width={680}
        okText="确认加密并上传"
        confirmLoading={submitting}
        onOk={() => void upload()}
        onCancel={() => !submitting && setUploadOpen(false)}
      >
        <Form form={form} layout="vertical">
          {aiMode ? (
            <>
              <Form.Item
                label="大模型 API"
                name="providerId"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: '平台大模型 API（已配置）', value: 'platform-model-api' },
                    { label: '备用大模型 API（已配置）', value: 'backup-model-api' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label="生成要求"
                name="prompt"
                rules={[{ required: true, message: '请输入生成要求' }]}
              >
                <Input.TextArea
                  rows={3}
                  placeholder="生成用于三分类神经网络训练的 CSV 数据"
                />
              </Form.Item>
              <Space align="start" style={{ width: '100%' }}>
                <Form.Item label="字段" name="fields" rules={[{ required: true }]}>
                  <Input style={{ width: 430 }} />
                </Form.Item>
                <Form.Item label="条数" name="rowCount">
                  <InputNumber min={1} max={1000} />
                </Form.Item>
              </Space>
              <Button
                icon={<RobotOutlined />}
                loading={generating}
                onClick={() => void generateCsv()}
              >
                生成并检查数据
              </Button>
              {generatedCsv && (
                <Input.TextArea
                  value={generatedCsv}
                  readOnly
                  rows={6}
                  style={{ marginTop: 12 }}
                />
              )}
            </>
          ) : (
            <Form.Item
              label={uploadType === 'DATA' ? '本地 CSV 文件' : '本地模型权重文件'}
              required
            >
              <Upload
                beforeUpload={() => false}
                maxCount={1}
                fileList={fileList}
                onChange={({ fileList: value }) => setFileList(value)}
              >
                <Button>选择文件</Button>
              </Upload>
            </Form.Item>
          )}
          <Form.Item
            label={uploadType === 'DATA' ? '数据名称' : '模型权重名称'}
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="加密算法" name="algorithm" rules={[{ required: true }]}>
            <Select options={algorithmOptions} />
          </Form.Item>
          <Form.Item label="可信域" name="domainId" rules={[{ required: true }]}>
            <Select options={domainOptions} />
          </Form.Item>
          {stage && (
            <>
              <Typography.Text>{stage}</Typography.Text>
              <Progress
                percent={progress}
                status={progress === 100 ? 'success' : 'active'}
              />
            </>
          )}
        </Form>
      </Modal>

      <Drawer
        title={`${usageAsset?.name || ''} · 使用请求与使用记录`}
        width={860}
        open={Boolean(usageAsset)}
        onClose={() => setUsageAsset(undefined)}
      >
        <Tabs
          items={[
            {
              key: 'pending',
              label: `待审批（${
                usage.filter((item) => item.status === 'PENDING').length
              }）`,
              children: (
                <UsageTable
                  rows={usage.filter((item) => item.status === 'PENDING')}
                  decide={decide}
                />
              ),
            },
            {
              key: 'history',
              label: '历史请求',
              children: (
                <UsageTable
                  rows={usage.filter((item) => item.status !== 'PENDING')}
                  decide={decide}
                />
              ),
            },
            {
              key: 'trace',
              label: '使用追踪',
              children: (
                <Timeline
                  items={
                    usage[0]
                      ? [
                          {
                            color: 'blue',
                            children: `${formatTime(
                              usage[0].requestedAt,
                            )} 提交使用申请`,
                          },
                          {
                            color: usage[0].decidedAt ? 'green' : 'gray',
                            children: usage[0].decidedAt
                              ? `${formatTime(
                                  usage[0].decidedAt,
                                )} 审批完成并等待执行授权`
                              : '等待资产所有者审批',
                          },
                          {
                            color: usage[0].startedAt ? 'blue' : 'gray',
                            children: usage[0].startedAt
                              ? `${formatTime(usage[0].startedAt)} ${
                                  usage[0].computeNode
                                } 开始使用`
                              : '等待计算节点启动',
                          },
                          {
                            color: usage[0].completedAt ? 'green' : 'gray',
                            children: usage[0].completedAt
                              ? `${formatTime(
                                  usage[0].completedAt,
                                )} 结果加密入库，使用完毕`
                              : '等待加密结果入库',
                          },
                        ]
                      : []
                  }
                />
              ),
            },
          ]}
        />
      </Drawer>
      <Drawer
        title={preview?.title}
        width={720}
        open={Boolean(preview)}
        onClose={() => setPreview(undefined)}
      >
        {preview?.plain && (
          <Typography.Paragraph type="secondary">
            内容只在当前浏览器中临时解密；关闭后清理预览，节点中的文件始终保持密文。
          </Typography.Paragraph>
        )}
        <Input.TextArea
          value={preview?.content}
          readOnly
          autoSize={{ minRows: 12, maxRows: 24 }}
        />
      </Drawer>
      <Drawer
        title="资产详情"
        width={560}
        open={Boolean(detail)}
        onClose={() => setDetail(undefined)}
      >
        {detail && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="描述">{detail.description}</Descriptions.Item>
            <Descriptions.Item label="版本">v{detail.version}</Descriptions.Item>
            <Descriptions.Item label="文件大小">
              {formatSize(detail.originalSize)}
            </Descriptions.Item>
            <Descriptions.Item label="存储节点">{detail.storageNode}</Descriptions.Item>
            <Descriptions.Item label="安全级别">
              <Tag color="success">最高</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="密文摘要">
              {detail.manifestHash}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
};

const UsageTable = ({
  rows,
  decide,
}: {
  rows: AssetUseRequest[];
  decide: (row: AssetUseRequest, action: 'APPROVE' | 'REJECT') => Promise<void>;
}) => (
  <Table
    rowKey="requestId"
    pagination={false}
    dataSource={rows}
    columns={[
      {
        title: '申请方 / 任务',
        render: (_: unknown, row: AssetUseRequest) => (
          <>
            <div>{row.applicant}</div>
            <Typography.Text type="secondary">
              {row.taskName} · {row.taskId}
            </Typography.Text>
          </>
        ),
      },
      { title: '计算节点', dataIndex: 'computeNode' },
      { title: '使用目的', dataIndex: 'purpose' },
      { title: '申请时间', dataIndex: 'requestedAt', render: formatTime },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: string) => (
          <Tag color={statusColor[value]}>{statusLabel[value] || value}</Tag>
        ),
      },
      {
        title: '审批',
        render: (_: unknown, row: AssetUseRequest) =>
          row.status === 'PENDING' ? (
            <Space>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => void decide(row, 'APPROVE')}
              >
                批准
              </Button>
              <Button size="small" danger onClick={() => void decide(row, 'REJECT')}>
                拒绝
              </Button>
            </Space>
          ) : (
            row.approvalComment || '-'
          ),
      },
    ]}
  />
);

export const ResultAssetPanel = () => {
  const [assets, setAssets] = useState<ConfidentialAsset[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [preview, setPreview] = useState<{
    asset: ConfidentialAsset;
    plain: boolean;
    content: string;
  }>();
  useEffect(() => {
    ConfidentialAssetApi.list()
      .then((rows) => {
        setAssets(rows.length ? rows : demoAssets);
        setUsingDemo(rows.length === 0);
      })
      .catch(() => {
        setAssets(demoAssets);
        setUsingDemo(true);
      });
  }, []);
  const loadPlain = async (asset: ConfidentialAsset) => {
    if (usingDemo)
      return new TextEncoder().encode(
        asset.assetType === 'RESULT_MODEL'
          ? modelPreview.replace('IrisMLP', 'IrisMLP v2')
          : 'sample_id,prediction,confidence\n001,setosa,0.998\n002,setosa,0.996\n101,virginica,0.991',
      );
    return decryptEncryptedFile(
      hydrateEncryptedPayload(await ConfidentialAssetApi.preview(asset.assetId)),
    );
  };
  const show = async (asset: ConfidentialAsset, plain: boolean) => {
    if (!plain) {
      setPreview({
        asset,
        plain,
        content: `格式: ds-envelope/v2\n算法: ${asset.algorithm}\nManifest SHA256: ${asset.manifestHash}\n密文字节: 8a2f14c903bd…（已截取）`,
      });
      return;
    }
    try {
      const bytes = await loadPlain(asset);
      const content = previewBytes(bytes, asset.assetType);
      bytes.fill(0);
      setPreview({ asset, plain, content });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '结果解密失败');
    }
  };
  const download = async (asset: ConfidentialAsset) => {
    let bytes: Uint8Array;
    try {
      bytes = await loadPlain(asset);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '结果解密失败');
      return;
    }
    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'application/octet-stream' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = asset.originalFileName;
    link.click();
    URL.revokeObjectURL(url);
    bytes.fill(0);
    message.success('已解密导出到本地，节点中的结果继续保持密文');
  };
  const table = (type: 'RESULT_DATA' | 'RESULT_MODEL') => (
    <Table
      rowKey="assetId"
      dataSource={assets.filter((item) => item.assetType === type)}
      columns={[
        {
          title: type === 'RESULT_DATA' ? '结果数据名称' : '结果模型权重名称',
          dataIndex: 'name',
        },
        { title: '生成时间', dataIndex: 'createdAt', render: formatTime },
        { title: '源数据名称', dataIndex: 'sourceDataName' },
        { title: '源模型名称', dataIndex: 'sourceModelName' },
        {
          title: '计算任务 / 节点',
          render: (_: unknown, row: ConfidentialAsset) => (
            <>
              <div>{row.taskId}</div>
              <Typography.Text type="secondary">{row.computeNode}</Typography.Text>
            </>
          ),
        },
        {
          title: '算法 / 可信域',
          render: (_: unknown, row: ConfidentialAsset) => (
            <>
              <Tag color="blue">{row.algorithm}</Tag>
              <div>{row.domainId}</div>
            </>
          ),
        },
        {
          title: '操作',
          render: (_: unknown, row: ConfidentialAsset) => (
            <Space size={2}>
              <Button type="link" size="small" onClick={() => void show(row, false)}>
                密文预览
              </Button>
              <Button type="link" size="small" onClick={() => void show(row, true)}>
                明文预览
              </Button>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => void download(row)}
              >
                解密导出
              </Button>
            </Space>
          ),
        },
      ]}
    />
  );
  return (
    <>
      <Tabs
        items={[
          { key: 'data', label: '结果数据', children: table('RESULT_DATA') },
          { key: 'model', label: '结果模型权重', children: table('RESULT_MODEL') },
        ]}
      />
      <Drawer
        title={`${preview?.asset.name || ''} · ${
          preview?.plain ? '临时明文预览' : '密文预览'
        }`}
        width={720}
        open={Boolean(preview)}
        onClose={() => setPreview(undefined)}
      >
        <Input.TextArea
          value={preview?.content}
          readOnly
          autoSize={{ minRows: 12, maxRows: 24 }}
        />
      </Drawer>
    </>
  );
};
