import {
  ApiOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  FileProtectOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalBytes,
  CONTENT_ENCRYPTION_CAPABILITIES,
  createEncryptedInferenceRequest,
  decryptConfidentialOutput,
  cryptoAdapter,
  DEFAULT_CONTENT_ENCRYPTION_ALGORITHM,
  downloadDecryptedOutput,
  forgetDek,
  getSessionIdentity,
  sealRememberedDek,
  sha256,
  type ContentEncryptionAlgorithm,
  type ConfidentialInferenceSession,
  type ConfidentialTaskOutput,
  type EncryptedFilePayload,
  type EncryptedPayload,
  type PublicKeyInfo,
  type SessionCryptoIdentity,
  type TrustedDomain,
} from '@/security/crypto';
import { ConfidentialComputeApi } from '@/services/confidential-compute';
import {
  ConfidentialModelApi,
  type ConfidentialModel,
  type ConfidentialModelSource,
} from '@/services/confidential-models';

type ImportForm = {
  sourceType: ConfidentialModelSource;
  name: string;
  description?: string;
  domainId: string;
  algorithm: ContentEncryptionAlgorithm;
  servedModelName?: string;
  baseUrl?: string;
  upstreamModelId?: string;
  apiKey?: string;
  timeoutSeconds?: number;
};

type AuthorizationMaterial = {
  assetVersionId: string;
  encryptedPayload: EncryptedPayload | EncryptedFilePayload;
};

type InferenceTarget = {
  deploymentId: string;
  modelName: string;
  sourceType: ConfidentialModelSource;
  session: ConfidentialInferenceSession;
};

const statusColor: Record<string, string> = {
  ONLINE: 'success',
  APPROVED: 'processing',
  PENDING_REVIEW: 'warning',
  REJECTED: 'error',
  PUBLISHING: 'processing',
  AUTHORIZATION_REQUIRED: 'warning',
  RUNTIME_REQUIRED: 'warning',
  OFFLINE: 'default',
  IMPORTED: 'default',
};

const statusLabel = (value: string) => value;

const sourceLabel = (source: ConfidentialModelSource) =>
  source === 'LOCAL_WEIGHTS' ? '本地权重' : 'OpenAI 兼容 API';

const ownerEncryptionKey = async (
  identity: SessionCryptoIdentity,
  domainId: string,
): Promise<PublicKeyInfo> => ({
  keyId: identity.kid,
  domainId,
  version: 1,
  algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
  fingerprint: `SHA256:${await sha256(base64UrlToBytes(identity.encryptionPublicKey))}`,
  publicKey: identity.encryptionPublicKey,
  status: 'active',
});

export const ConfidentialModelPanel = ({ domains }: { domains: TrustedDomain[] }) => {
  const [form] = Form.useForm<ImportForm>();
  const [models, setModels] = useState<ConfidentialModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sourceType, setSourceType] =
    useState<ConfidentialModelSource>('LOCAL_WEIGHTS');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ConfidentialModel>();
  const [inferenceTarget, setInferenceTarget] = useState<InferenceTarget>();
  const [inferencePrompt, setInferencePrompt] = useState('');
  const [inferenceResult, setInferenceResult] = useState('');
  const [inferring, setInferring] = useState(false);
  const [outputPackage, setOutputPackage] = useState<{
    deploymentId: string;
    taskId: string;
    value: ConfidentialTaskOutput;
  }>();
  const [decryptedOutput, setDecryptedOutput] = useState<{
    deploymentId: string;
    value: unknown;
  }>();
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputLoading, setOutputLoading] = useState(false);
  const authorizationMaterials = useRef(new Map<string, AuthorizationMaterial>());
  const deploymentTasks = useRef(new Map<string, string>());
  const deploymentSessions = useRef(new Map<string, ConfidentialInferenceSession>());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setModels(await ConfidentialModelApi.list());
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '模型列表加载失败');
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

  const openImport = () => {
    setSourceType('LOCAL_WEIGHTS');
    setFileList([]);
    setProgress(0);
    form.resetFields();
    form.setFieldsValue({
      sourceType: 'LOCAL_WEIGHTS',
      domainId: domainOptions[0]?.value,
      algorithm: DEFAULT_CONTENT_ENCRYPTION_ALGORITHM,
      servedModelName: 'deepseek-llm-7b-chat',
      timeoutSeconds: 60,
    });
    setImportOpen(true);
  };

  const registerIdentity = async () => {
    const identity = await getSessionIdentity();
    await ConfidentialComputeApi.registerIdentity({
      kid: identity.kid,
      encryptionPublicKey: identity.encryptionPublicKey,
      signingPublicKey: identity.signingPublicKey,
      proofOfPossession: identity.proofOfPossession,
    });
    return identity;
  };

  const importWeights = async (values: ImportForm) => {
    const file = fileList[0]?.originFileObj;
    if (!file) throw new Error('请选择权重文件或模型目录压缩包');
    const identity = await registerIdentity();
    const publicKey = await ownerEncryptionKey(identity, values.domainId);
    const encrypted = await cryptoAdapter.encryptFile(
      file,
      publicKey,
      (value) => setProgress(Math.round(value * 0.55)),
      { algorithm: values.algorithm },
    );
    const session = await ConfidentialModelApi.createWeightUpload({
      modelName: values.name,
      originalFileName: file.name,
      originalSize: file.size,
      domainId: values.domainId,
      contentEncryptionAlgorithm: values.algorithm,
      expectedChunks: encrypted.chunks.length,
    });
    for (let index = 0; index < encrypted.chunks.length; index += 1) {
      const chunk = encrypted.chunks[index];
      await ConfidentialModelApi.uploadWeightChunk(
        session.uploadSessionId,
        index,
        base64UrlToBytes(chunk.ciphertext),
        chunk.sha256,
      );
      setProgress(55 + Math.round(((index + 1) / encrypted.chunks.length) * 35));
    }
    const manifest = {
      ...encrypted,
      chunks: encrypted.chunks.map(
        ({ index, plaintextLength, nonce, sha256: chunkHash, aad }) => ({
          index,
          plaintextLength,
          nonce,
          sha256: chunkHash,
          aad,
        }),
      ),
    };
    const manifestHash = await sha256(canonicalBytes(manifest));
    const ownerSignature = await identity.sign(manifest);
    const imported = await ConfidentialModelApi.commitWeights({
      uploadSessionId: session.uploadSessionId,
      name: values.name,
      description: values.description || '',
      manifest,
      manifestHash,
      ownerSigningPublicKey: identity.signingPublicKey,
      ownerSignature,
      runtimeConfig: {
        engine: 'vllm',
        originalFileName: file.name,
        servedModelName: values.servedModelName || 'deepseek-llm-7b-chat',
      },
      runtimeSecurityRequirement: 'controlled-sim-ok',
    });
    const importedVersion =
      imported.versions?.find((item) => item.versionId === imported.versionId) ||
      imported.versions?.[0];
    if (importedVersion?.versionId && importedVersion.assetVersionId) {
      authorizationMaterials.current.set(importedVersion.versionId, {
        assetVersionId: importedVersion.assetVersionId,
        encryptedPayload: encrypted,
      });
    }
    setProgress(100);
  };

  const importOpenAi = async (values: ImportForm) => {
    if (!values.apiKey) throw new Error('请输入 API Key');
    const identity = await registerIdentity();
    const publicKey = await ownerEncryptionKey(identity, values.domainId);
    const encryptedCredential = await cryptoAdapter.encryptText(
      values.apiKey,
      publicKey,
    );
    const imported = await ConfidentialModelApi.createOpenAi({
      name: values.name,
      description: values.description || '',
      domainId: values.domainId,
      baseUrl: values.baseUrl || '',
      upstreamModelId: values.upstreamModelId || '',
      encryptedCredential,
      runtimeConfig: { timeoutSeconds: values.timeoutSeconds || 60 },
      runtimeSecurityRequirement: 'controlled-sim-ok',
    });
    const version = imported.versions?.[0];
    if (version?.versionId && version.credentialId) {
      authorizationMaterials.current.set(version.versionId, {
        assetVersionId: version.credentialId,
        encryptedPayload: encryptedCredential,
      });
    }
    form.setFieldValue('apiKey', '');
  };

  const authorizeModelDeployment = async (
    model: ConfidentialModel,
    deploymentId: string,
    material: AuthorizationMaterial,
  ) => {
    const identity = await registerIdentity();
    const task = (await ConfidentialComputeApi.createTask({
      domainId: model.domainId,
      purpose: 'infer',
      workloadId: `model.deploy/${deploymentId}`,
      assetVersionIds: [material.assetVersionId],
      outputRecipients: [identity.kid],
      securityProfile: 'a100-sim',
      runtimeSecurityRequirement: 'controlled-sim-ok',
    })) as {
      taskSpec: Record<string, unknown> & { taskId: string; expiresAt: string };
      taskSpecDigest: string;
    };
    const clientNonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const attestation = (await ConfidentialComputeApi.createAttestation({
      taskId: task.taskSpec.taskId,
      clientNonce,
      expectedSecurityProfile: 'a100-sim',
    })) as {
      sessionId: string;
      teeEphemeralPublicKey: string;
      expiresAt: string;
      evidenceType: string;
      hardwareModel: string;
      securityProfile: 'a100-sim';
      simulated: true;
    };
    const now = Date.now();
    const expiry = new Date(
      Math.min(
        Date.parse(task.taskSpec.expiresAt),
        Date.parse(attestation.expiresAt),
        now + 3 * 60 * 1000,
      ) - 1000,
    ).toISOString();
    const grantId = `grant_${crypto.randomUUID().replace(/-/g, '')}`;
    const claims = {
      contractVersion: 'ds-confidential/v1',
      grantId,
      jti: `jti_${crypto.randomUUID().replace(/-/g, '')}`,
      taskSpecDigest: task.taskSpecDigest,
      teeSessionId: attestation.sessionId,
      teeEphemeralPublicKeyHash: await sha256(
        base64UrlToBytes(attestation.teeEphemeralPublicKey),
      ),
      securityProfile: attestation.securityProfile,
      evidenceType: attestation.evidenceType,
      simulated: attestation.simulated,
      hardwareModel: attestation.hardwareModel,
      runtimeSecurityRequirement: 'controlled-sim-ok',
      assetVersionIds: [material.assetVersionId],
      outputRecipients: [identity.kid],
      nbf: new Date(now - 1000).toISOString(),
      exp: expiry,
      maxUses: 1,
    };
    const sealedAad = new TextEncoder().encode(
      `${task.taskSpecDigest}|${material.assetVersionId}|${grantId}|${expiry}`,
    );
    const sealedDek = await sealRememberedDek(
      material.encryptedPayload.envelopeId,
      attestation.teeEphemeralPublicKey,
      sealedAad,
    );
    const encryptedPayload = material.encryptedPayload;
    const encryptedInputs =
      encryptedPayload.format === 'ds-envelope/v2'
        ? encryptedPayload.chunks.map((chunk) => ({
            assetVersionId: material.assetVersionId,
            format: 'ds-envelope/v2' as const,
            envelopeId: encryptedPayload.envelopeId,
            implementationVersion:
              encryptedPayload.contentEncryption.implementationVersion,
            algorithm: encryptedPayload.algorithm,
            nonce: chunk.nonce,
            aad: chunk.aad,
            ciphertext: chunk.ciphertext,
            ciphertextSha256: chunk.sha256,
          }))
        : [
            {
              assetVersionId: material.assetVersionId,
              format: 'ds-envelope/v1' as const,
              algorithm: encryptedPayload.algorithm,
              nonce: encryptedPayload.nonce,
              aad: encryptedPayload.aad,
              ciphertext: encryptedPayload.ciphertext,
              ciphertextSha256: encryptedPayload.cipherHash,
            },
          ];
    await ConfidentialComputeApi.saveGrant({
      taskId: task.taskSpec.taskId,
      sessionId: attestation.sessionId,
      grant: {
        claims,
        signingPublicKey: identity.signingPublicKey,
        signature: await identity.sign(claims),
      },
      sealedDeks: [{ assetVersionId: material.assetVersionId, ...sealedDek }],
      encryptedInputs,
      outputRecipients: [
        { kid: identity.kid, encryptionPublicKey: identity.encryptionPublicKey },
      ],
      scenario: 'NORMAL',
    });
    const deployment = await ConfidentialModelApi.authorize(
      deploymentId,
      task.taskSpec.taskId,
      grantId,
    );
    deploymentTasks.current.set(deploymentId, task.taskSpec.taskId);
    // The DEK is no longer needed once CipherGPU has consumed the grant,
    // regardless of whether a local runtime was configured.
    forgetDek(material.encryptedPayload.envelopeId);
    authorizationMaterials.current.delete(model.versionId || deployment.versionId);
    if (deployment.status === 'ONLINE') {
      deploymentSessions.current.set(deploymentId, {
        sessionId: attestation.sessionId,
        teeEphemeralPublicKey: attestation.teeEphemeralPublicKey,
        expiresAt: attestation.expiresAt,
      });
      message.success(
        model.sourceType === 'OPENAI_COMPATIBLE'
          ? '一次性 TEK 授权完成，远程模型已上线'
          : '一次性 TEK 授权完成，本地权重已进入运行队列',
      );
    } else if (deployment.status === 'RUNTIME_REQUIRED') {
      message.warning(
        '一次性授权已完成，但运行时未配置；配置 DATA_SANDBOX_DEV_VLLM_URL 后重新部署',
      );
    }
  };

  const fetchOutput = async (deploymentId: string) => {
    const taskId = deploymentTasks.current.get(deploymentId);
    if (!taskId) {
      message.warning('当前浏览器会话没有该部署的任务记录，请重新授权部署');
      return;
    }
    setOutputLoading(true);
    try {
      const value = await ConfidentialComputeApi.output(taskId);
      setOutputPackage({ deploymentId, taskId, value });
      setDecryptedOutput(undefined);
      setOutputOpen(true);
      message.success('已获取加密产物，服务端未返回明文');
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '加密产物获取失败');
    } finally {
      setOutputLoading(false);
    }
  };

  const decryptOutput = async () => {
    if (!outputPackage) return;
    setOutputLoading(true);
    try {
      const identity = await getSessionIdentity();
      const value = await decryptConfidentialOutput(identity, outputPackage.value);
      setDecryptedOutput({ deploymentId: outputPackage.deploymentId, value });
      message.success('产物已在本地解密');
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '本地解密失败');
    } finally {
      setOutputLoading(false);
    }
  };

  const openInference = async (model: ConfidentialModel) => {
    try {
      const modelDetail = await ConfidentialModelApi.detail(model.modelId);
      const deployment = modelDetail.deployments?.find(
        (item) => item.status === 'ONLINE',
      );
      if (!deployment) throw new Error('当前模型没有在线部署');
      const session = deploymentSessions.current.get(deployment.deploymentId);
      if (!session || Date.parse(session.expiresAt) <= Date.now()) {
        throw new Error('当前浏览器没有有效的 TEK 会话，请重新授权部署');
      }
      setInferencePrompt('');
      setInferenceResult('');
      setInferenceTarget({
        deploymentId: deployment.deploymentId,
        modelName: model.name,
        sourceType: model.sourceType,
        session,
      });
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '推理会话不可用');
    }
  };

  const runInference = async () => {
    if (!inferenceTarget || !inferencePrompt.trim()) return;
    setInferring(true);
    setInferenceResult('');
    let exchange:
      | Awaited<ReturnType<typeof createEncryptedInferenceRequest>>
      | undefined;
    try {
      exchange = await createEncryptedInferenceRequest(
        inferenceTarget.deploymentId,
        inferenceTarget.session,
        {
          model: inferenceTarget.modelName,
          messages: [{ role: 'user', content: inferencePrompt }],
        },
      );
      const encryptedResponse = await ConfidentialModelApi.infer(exchange.request);
      const response = await exchange.decrypt(encryptedResponse);
      const choices = response.choices;
      const content = Array.isArray(choices)
        ? (choices[0] as { message?: { content?: unknown } } | undefined)?.message
            ?.content
        : undefined;
      setInferenceResult(
        typeof content === 'string' ? content : JSON.stringify(response, null, 2),
      );
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '加密推理失败');
    } finally {
      exchange?.destroy();
      setInferring(false);
    }
  };

  const submitImport = async () => {
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (sourceType === 'LOCAL_WEIGHTS') await importWeights(values);
      else await importOpenAi(values);
      message.success('加密模型版本已导入');
      setImportOpen(false);
      await refresh();
    } catch (failure) {
      if (failure instanceof Error) message.error(failure.message);
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (model: ConfidentialModel, action: string) => {
    if (!model.versionId) return;
    try {
      if (action === 'DEPLOY') {
        const deployment = await ConfidentialModelApi.deploy(
          model.modelId,
          model.versionId,
        );
        const material = authorizationMaterials.current.get(model.versionId);
        if (material) {
          await authorizeModelDeployment(model, deployment.deploymentId, material);
        } else {
          message.warning(
            model.sourceType === 'OPENAI_COMPATIBLE'
              ? '当前浏览器会话没有凭据 DEK，请导入新的凭据版本后部署'
              : '当前浏览器会话没有权重 DEK，请重新导入该权重版本后部署',
          );
        }
      } else {
        await ConfidentialModelApi.review(model.modelId, model.versionId, action);
        message.success('模型状态已更新');
      }
      await refresh();
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '操作失败');
    }
  };

  return (
    <div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}
      >
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            机密模型中心
          </Typography.Title>
          <Typography.Text type="secondary">
            统一管理加密权重和 OpenAI 兼容模型
          </Typography.Text>
        </div>
        <Button type="primary" icon={<CloudUploadOutlined />} onClick={openImport}>
          导入模型
        </Button>
      </div>
      <Table
        rowKey="modelId"
        loading={loading}
        dataSource={models}
        pagination={{ pageSize: 8 }}
        onRow={(record) => ({
          onClick: async () => {
            try {
              setDetail(await ConfidentialModelApi.detail(record.modelId));
            } catch (failure) {
              message.error(
                failure instanceof Error ? failure.message : '详情加载失败',
              );
            }
          },
        })}
        columns={[
          {
            title: '模型',
            key: 'name',
            render: (_, record) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{record.name}</Typography.Text>
                <Typography.Text type="secondary">{record.modelId}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '来源',
            dataIndex: 'sourceType',
            render: (value: ConfidentialModelSource) => (
              <Tag
                icon={
                  value === 'LOCAL_WEIGHTS' ? <FileProtectOutlined /> : <ApiOutlined />
                }
              >
                {sourceLabel(value)}
              </Tag>
            ),
          },
          {
            title: '版本',
            dataIndex: 'latestVersion',
            width: 80,
            render: (value) => `v${value}`,
          },
          {
            title: '加密算法',
            dataIndex: 'contentEncryptionAlgorithm',
            render: (value) => value || 'AES-256-GCM',
          },
          {
            title: '安全档位',
            key: 'profile',
            render: () => <Tag color="warning">A100_SIMULATED</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) =>
              value === 'RUNTIME_REQUIRED' ? (
                <Tooltip title="A100 模拟授权已完成，但未配置真实 vLLM 运行端点">
                  <Tag
                    color={statusColor[value] || 'default'}
                    icon={<InfoCircleOutlined />}
                  >
                    {statusLabel(value)}
                  </Tag>
                </Tooltip>
              ) : (
                <Tag color={statusColor[value] || 'default'}>{statusLabel(value)}</Tag>
              ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 250,
            render: (_, record) => (
              <Space onClick={(event) => event.stopPropagation()}>
                {record.status === 'IMPORTED' && (
                  <Button size="small" onClick={() => void act(record, 'SUBMIT')}>
                    提交审核
                  </Button>
                )}
                {record.status === 'PENDING_REVIEW' && (
                  <>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => void act(record, 'APPROVE')}
                    >
                      批准
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => void act(record, 'REJECT')}
                    >
                      驳回
                    </Button>
                  </>
                )}
                {record.status === 'APPROVED' && (
                  <Button
                    size="small"
                    icon={<DeploymentUnitOutlined />}
                    onClick={() => void act(record, 'DEPLOY')}
                  >
                    部署
                  </Button>
                )}
                {record.status === 'ONLINE' && (
                  <Button
                    size="small"
                    icon={<SendOutlined />}
                    onClick={() => void openInference(record)}
                  >
                    推理测试
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="导入机密模型"
        open={importOpen}
        width={680}
        okText="加密并导入"
        confirmLoading={submitting}
        onOk={() => void submitImport()}
        onCancel={() => !submitting && setImportOpen(false)}
      >
        <Alert
          showIcon
          type="warning"
          message="A100_SIMULATED"
          description="客户端加密和密钥协议是真实的，但 A100 运行时不具备 GPU CC 硬件隔离。"
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item label="模型来源">
            <Segmented
              block
              value={sourceType}
              options={[
                {
                  label: '上传权重',
                  value: 'LOCAL_WEIGHTS',
                  icon: <FileProtectOutlined />,
                },
                {
                  label: 'OpenAI 兼容 API',
                  value: 'OPENAI_COMPATIBLE',
                  icon: <ApiOutlined />,
                },
              ]}
              onChange={(value) => {
                const source = value as ConfidentialModelSource;
                setSourceType(source);
                form.setFieldValue('sourceType', source);
              }}
            />
          </Form.Item>
          <Form.Item name="name" label="模型名称" rules={[{ required: true }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={512} />
          </Form.Item>
          <Form.Item name="domainId" label="可信域" rules={[{ required: true }]}>
            <Select options={domainOptions} />
          </Form.Item>
          {sourceType === 'LOCAL_WEIGHTS' ? (
            <>
              <Form.Item label="权重文件" required>
                <Upload.Dragger
                  beforeUpload={() => false}
                  maxCount={1}
                  fileList={fileList}
                  onChange={({ fileList: values }) => setFileList(values.slice(-1))}
                >
                  <FileProtectOutlined style={{ fontSize: 28 }} />
                  <div style={{ marginTop: 8 }}>选择 safetensors 或模型目录压缩包</div>
                </Upload.Dragger>
              </Form.Item>
              <Form.Item
                name="algorithm"
                label="内容加密算法"
                rules={[{ required: true }]}
              >
                <Select
                  options={CONTENT_ENCRYPTION_CAPABILITIES.map((item) => ({
                    value: item.algorithm,
                    label: `${item.label}${item.recommended ? '（默认）' : ''}`,
                    title: item.description,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="servedModelName"
                label="vLLM 服务模型名"
                rules={[{ required: true }]}
              >
                <Input placeholder="deepseek-llm-7b-chat" maxLength={256} />
              </Form.Item>
              {submitting && (
                <Progress
                  percent={progress}
                  status={progress === 100 ? 'success' : 'active'}
                />
              )}
            </>
          ) : (
            <>
              <Alert
                showIcon
                type="info"
                message="上游模型供应商能够看到解密后的请求和响应"
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                name="baseUrl"
                label="HTTPS Base URL"
                rules={[{ required: true }, { type: 'url' }]}
              >
                <Input placeholder="https://api.example.com/v1" />
              </Form.Item>
              <Form.Item
                name="upstreamModelId"
                label="上游 Model ID"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="apiKey" label="API Key" rules={[{ required: true }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="timeoutSeconds" label="超时时间">
                <InputNumber min={5} max={300} addonAfter="秒" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title={`密态推理测试 · ${inferenceTarget?.modelName || ''}`}
        open={Boolean(inferenceTarget)}
        okText="加密发送"
        okButtonProps={{ icon: <SendOutlined />, disabled: !inferencePrompt.trim() }}
        confirmLoading={inferring}
        onOk={() => void runInference()}
        onCancel={() => !inferring && setInferenceTarget(undefined)}
      >
        <Alert
          showIcon
          type="warning"
          message="A100_SIMULATED"
          description={
            inferenceTarget?.sourceType === 'OPENAI_COMPATIBLE'
              ? '请求在浏览器加密，平台控制面只转发密文；CipherGPU 解密后，上游模型供应商能够看到请求和响应。'
              : '请求在浏览器加密，但 A100 运行时不具备 GPU CC 硬件隔离。'
          }
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          rows={5}
          value={inferencePrompt}
          maxLength={16000}
          placeholder="输入测试消息"
          onChange={(event) => setInferencePrompt(event.target.value)}
        />
        {inferenceResult && (
          <Input.TextArea
            rows={7}
            readOnly
            value={inferenceResult}
            style={{ marginTop: 16 }}
          />
        )}
      </Modal>

      <Drawer
        title={detail?.name || '模型详情'}
        open={Boolean(detail)}
        width={720}
        onClose={() => setDetail(undefined)}
      >
        {detail && (
          <>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="来源">
                {sourceLabel(detail.sourceType)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {detail.status === 'RUNTIME_REQUIRED' ? (
                  <Space size={4}>
                    <Tag color="warning" icon={<InfoCircleOutlined />}>
                      RUNTIME_REQUIRED
                    </Tag>
                    <Typography.Text type="secondary">
                      配置 DATA_SANDBOX_DEV_VLLM_URL 后重新部署
                    </Typography.Text>
                  </Space>
                ) : (
                  <Tag color={statusColor[detail.status] || 'default'}>
                    {detail.status}
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="安全档位">
                <Tag color="warning">A100_SIMULATED</Tag>
              </Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 20 }}>
              不可变版本
            </Typography.Title>
            <Table
              rowKey="versionId"
              size="small"
              pagination={false}
              dataSource={detail.versions}
              columns={[
                { title: '版本', dataIndex: 'version', render: (value) => `v${value}` },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value) => <Tag>{value}</Tag>,
                },
                { title: '算法', dataIndex: 'contentEncryptionAlgorithm' },
                { title: 'Cipher Hash', dataIndex: 'manifestHash', ellipsis: true },
                { title: '凭据', dataIndex: 'credentialMasked' },
              ]}
            />
            <Typography.Title level={5} style={{ marginTop: 20 }}>
              部署
            </Typography.Title>
            <Table
              rowKey="deploymentId"
              size="small"
              pagination={false}
              dataSource={detail.deployments}
              columns={[
                { title: 'Deployment', dataIndex: 'deploymentId', ellipsis: true },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value) =>
                    value === 'RUNTIME_REQUIRED' ? (
                      <Tooltip title="未配置真实 vLLM 运行端点，不能进行推理">
                        <Tag color="warning" icon={<InfoCircleOutlined />}>
                          RUNTIME_REQUIRED
                        </Tag>
                      </Tooltip>
                    ) : (
                      <Tag color={statusColor[value] || 'default'}>{value}</Tag>
                    ),
                },
                {
                  title: '操作',
                  render: (_, record) =>
                    record.status === 'OFFLINE' ? null : (
                      <Space>
                        {deploymentTasks.current.has(record.deploymentId) && (
                          <Button
                            size="small"
                            loading={
                              outputLoading &&
                              outputPackage?.deploymentId === record.deploymentId
                            }
                            onClick={() => void fetchOutput(record.deploymentId)}
                          >
                            获取产物
                          </Button>
                        )}
                        <Button
                          size="small"
                          icon={<PauseCircleOutlined />}
                          onClick={async () => {
                            await ConfidentialModelApi.offline(record.deploymentId);
                            setDetail(
                              await ConfidentialModelApi.detail(detail.modelId),
                            );
                            await refresh();
                          }}
                        >
                          下线
                        </Button>
                      </Space>
                    ),
                },
              ]}
            />
            <Alert
              showIcon
              type="info"
              icon={<SafetyCertificateOutlined />}
              message="CipherGPU 重启后需要重新完成一次性 TEK 授权"
              style={{ marginTop: 16 }}
            />
          </>
        )}
      </Drawer>

      <Modal
        title="加密执行产物"
        open={outputOpen}
        width={720}
        onCancel={() => !outputLoading && setOutputOpen(false)}
        footer={
          <Space>
            <Button onClick={() => void decryptOutput()} loading={outputLoading}>
              本地解密
            </Button>
            <Button
              type="primary"
              disabled={!decryptedOutput}
              onClick={() =>
                decryptedOutput &&
                downloadDecryptedOutput(
                  decryptedOutput.value,
                  `confidential-output-${outputPackage?.taskId || 'result'}.json`,
                )
              }
            >
              下载结果
            </Button>
          </Space>
        }
      >
        <Alert
          showIcon
          type="warning"
          message="A100_SIMULATED"
          description="产物由服务端以密文返回；只有当前浏览器身份可以在本地解封 ODK。A100 运行时不具备 GPU CC 硬件隔离。"
          style={{ marginBottom: 16 }}
        />
        {outputPackage && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Task ID">
              {outputPackage.taskId}
            </Descriptions.Item>
            <Descriptions.Item label="Output ID">
              {outputPackage.value.encryptedOutput.outputId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Cipher Hash">
              <Typography.Text copyable ellipsis>
                {outputPackage.value.encryptedOutput.ciphertextSha256}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="回执状态">
              {String(outputPackage.value.receipt.status || 'SUCCEEDED')}
            </Descriptions.Item>
          </Descriptions>
        )}
        {decryptedOutput && (
          <Input.TextArea
            rows={12}
            readOnly
            value={JSON.stringify(decryptedOutput.value, null, 2)}
            style={{ marginTop: 16, fontFamily: 'monospace' }}
          />
        )}
      </Modal>
    </div>
  );
};
