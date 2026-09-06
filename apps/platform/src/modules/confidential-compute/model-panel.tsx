import {
  ApiOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  FileProtectOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
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
  message,
  Modal,
  Progress,
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
  decryptConfidentialOutput,
  cryptoAdapter,
  DEFAULT_CONTENT_ENCRYPTION_ALGORITHM,
  downloadDecryptedOutput,
  STREAMING_FILE_CHUNK_SIZE,
  type ConfidentialInferenceSession,
  getSessionIdentity,
  randomId,
  restoreEncryptedFileDek,
  sealRememberedDek,
  sha256,
  type ContentEncryptionAlgorithm,
  type ConfidentialTaskOutput,
  type EncryptedFileManifestPayload,
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
  encryptedPayload:
    | EncryptedPayload
    | EncryptedFilePayload
    | EncryptedFileManifestPayload;
};

type InferenceTarget = {
  deploymentId: string;
  modelName: string;
  sourceType: ConfidentialModelSource;
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
  source === 'LOCAL_WEIGHTS' ? '加密模型包' : 'OpenAI 兼容 API';

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

export const ConfidentialModelPanel = ({
  domains,
  refreshToken = 0,
}: {
  domains: TrustedDomain[];
  refreshToken?: number;
}) => {
  const [form] = Form.useForm<ImportForm>();
  const [models, setModels] = useState<ConfidentialModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [versionTarget, setVersionTarget] = useState<ConfidentialModel>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ConfidentialModel>();
  const [inferenceTarget, setInferenceTarget] = useState<InferenceTarget>();
  const [inferencePrompt, setInferencePrompt] = useState('');
  const [inferenceResult, setInferenceResult] = useState('');
  const [inferring, setInferring] = useState(false);
  const [modelActionId, setModelActionId] = useState<string>();
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

  useEffect(() => void refresh(), [refresh, refreshToken]);

  useEffect(() => {
    if (!modelActionId) return undefined;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [modelActionId, refresh]);

  const domainOptions = useMemo(
    () =>
      domains
        .filter((item) => item.trustStatus === 'trusted')
        .map((item) => ({ label: item.name, value: item.id })),
    [domains],
  );

  const openImport = (target?: ConfidentialModel) => {
    setVersionTarget(target);
    setFileList([]);
    setProgress(0);
    form.resetFields();
    form.setFieldsValue({
      sourceType: 'LOCAL_WEIGHTS',
      name: target?.name,
      description: target?.description,
      domainId: target?.domainId || domainOptions[0]?.value,
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
    if (!file) throw new Error('请选择完整模型包压缩文件');
    const fileName = file.name.toLowerCase();
    if (
      !fileName.endsWith('.zip') &&
      !fileName.endsWith('.tar') &&
      !fileName.endsWith('.tar.gz')
    ) {
      throw new Error('大模型请上传 ZIP、TAR 或 TAR.GZ 格式的完整模型包');
    }
    const identity = await registerIdentity();
    const publicKey = await ownerEncryptionKey(identity, values.domainId);
    const capabilities = await ConfidentialModelApi.capabilities();
    const chunkSize = capabilities.chunkSize || STREAMING_FILE_CHUNK_SIZE;
    const session = await ConfidentialModelApi.createWeightUpload({
      modelName: values.name,
      originalFileName: file.name,
      originalSize: file.size,
      domainId: values.domainId,
      contentEncryptionAlgorithm: values.algorithm,
      expectedChunks: Math.ceil(file.size / chunkSize),
    });
    setProgress(2);
    const encrypted = await cryptoAdapter.encryptFileStreaming(
      file,
      publicKey,
      async (chunk) => {
        await ConfidentialModelApi.uploadWeightChunk(
          session.uploadSessionId,
          chunk.index,
          chunk.ciphertext,
          chunk.sha256,
        );
      },
      (value) => setProgress(Math.max(2, Math.min(96, value))),
      {
        algorithm: values.algorithm,
        chunkSize,
      },
    );
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
      modelId: versionTarget?.modelId,
      name: values.name,
      description: values.description || '',
      manifest,
      manifestHash,
      ownerSigningPublicKey: identity.signingPublicKey,
      ownerSignature,
      runtimeConfig: {
        engine: 'vllm',
        assetKind: 'LLM_MODEL_PACKAGE',
        packageFormat: fileName.endsWith('.zip')
          ? 'ZIP'
          : fileName.endsWith('.tar.gz')
          ? 'TAR_GZ'
          : 'TAR',
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
    const grantId = randomId('grant');
    const claims = {
      contractVersion: 'ds-confidential/v1',
      grantId,
      jti: randomId('jti'),
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
    // Local model ciphertext is already in managed MinIO.  Only its sealed DEK
    // is authorized here; the control plane streams the stored chunks to
    // CipherGPU over mTLS after approval.  Remote API credentials stay small
    // and continue to use the single encrypted-input execution contract.
    const encryptedInputs =
      model.sourceType === 'LOCAL_WEIGHTS'
        ? []
        : encryptedPayload.format === 'ds-envelope/v2'
        ? encryptedPayload.chunks.map((chunk) => {
            if (!('ciphertext' in chunk)) {
              throw new Error('模型密文已托管到节点，不能作为远程 API 凭据提交');
            }
            return {
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
            };
          })
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
    // Keep the owner's DEK only in this browser session so an explicit stop
    // followed by restart can issue a fresh one-time grant. CipherGPU never
    // retains the previous sealed execution credential.
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
      if (!deployment) {
        // 详情接口会核对运行时并把失联的部署改回 OFFLINE，刷新列表让「重新部署」出现。
        await refresh();
        throw new Error('当前模型没有在线部署，请重新部署后再试');
      }
      setInferencePrompt('');
      setInferenceResult('');
      setInferenceTarget({
        deploymentId: deployment.deploymentId,
        modelName: model.name,
        sourceType: model.sourceType,
      });
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '推理会话不可用');
    }
  };

  const runInference = async () => {
    if (!inferenceTarget || !inferencePrompt.trim()) return;
    setInferring(true);
    setInferenceResult('');
    try {
      const response = await ConfidentialModelApi.runtimeChat(
        inferenceTarget.deploymentId,
        {
          model: inferenceTarget.modelName,
          messages: [{ role: 'user', content: inferencePrompt }],
          max_tokens: 256,
        },
      );
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
      setInferring(false);
    }
  };

  const createRuntimeApiKey = async (model: ConfidentialModel) => {
    const modelDetail = await ConfidentialModelApi.detail(model.modelId);
    const deployment = modelDetail.deployments?.find(
      (item) => item.status === 'ONLINE',
    );
    if (!deployment) throw new Error('当前模型没有在线部署');
    const key = await ConfidentialModelApi.createApiKey(deployment.deploymentId);
    Modal.info({
      title: 'API Key 已创建（仅显示一次）',
      width: 680,
      content: (
        <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="API 地址">
            {`${window.location.origin}/model-api/v1/chat/completions`}
          </Descriptions.Item>
          <Descriptions.Item label="API Key">
            <Typography.Text copyable code>
              {key.apiKey}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="model">{model.name}</Descriptions.Item>
        </Descriptions>
      ),
    });
  };

  const manageRuntimeApiKeys = async (model: ConfidentialModel) => {
    const modelDetail = await ConfidentialModelApi.detail(model.modelId);
    const deployment = modelDetail.deployments?.find(
      (item) => item.status === 'ONLINE',
    );
    if (!deployment) throw new Error('当前模型没有在线部署');
    const keys = await ConfidentialModelApi.apiKeys(deployment.deploymentId);
    Modal.info({
      title: 'API Key 管理',
      width: 720,
      content: keys.length ? (
        <Table
          rowKey="keyId"
          pagination={false}
          size="small"
          dataSource={keys}
          columns={[
            { title: 'Key 前缀', dataIndex: 'keyPrefix' },
            { title: '状态', dataIndex: 'status' },
            { title: '创建时间', dataIndex: 'createdAt' },
            { title: '最后调用', dataIndex: 'lastUsedAt' },
            {
              title: '操作',
              render: (_, key) =>
                key.status === 'ACTIVE' && (
                  <Button
                    danger
                    size="small"
                    onClick={() =>
                      void ConfidentialModelApi.revokeApiKey(key.keyId).then(() => {
                        message.success('API Key 已吊销');
                        Modal.destroyAll();
                      })
                    }
                  >
                    吊销
                  </Button>
                ),
            },
          ]}
        />
      ) : (
        <Typography.Text type="secondary">暂无 API Key，请先创建。</Typography.Text>
      ),
    });
  };

  const submitImport = async () => {
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      await importWeights(values);
      message.success('加密模型版本已导入');
      setImportOpen(false);
      setVersionTarget(undefined);
      await refresh();
    } catch (failure) {
      if (failure instanceof Error) message.error(failure.message);
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (model: ConfidentialModel, action: string) => {
    if (!model.versionId) return;
    if (modelActionId === model.modelId) return;
    setModelActionId(model.modelId);
    try {
      if (action === 'DEPLOY') {
        let material = authorizationMaterials.current.get(model.versionId);
        if (!material && model.sourceType === 'LOCAL_WEIGHTS') {
          const persisted = await ConfidentialModelApi.detail(model.modelId);
          const version = persisted.versions?.find(
            (item) => item.versionId === model.versionId,
          );
          if (version?.manifest && version.assetVersionId) {
            await restoreEncryptedFileDek(version.manifest);
            material = {
              assetVersionId: version.assetVersionId,
              encryptedPayload: version.manifest,
            };
            authorizationMaterials.current.set(model.versionId, material);
          }
        }
        if (!material) {
          message.warning(
            model.sourceType === 'OPENAI_COMPATIBLE'
              ? '当前浏览器没有该版本的凭据 DEK，请通过“新凭据版本”重新输入 API Key'
              : '当前浏览器没有该版本的权重 DEK，请通过“新权重版本”重新导入权重',
          );
          return;
        }
        const deployment = await ConfidentialModelApi.deploy(
          model.modelId,
          model.versionId,
        );
        await authorizeModelDeployment(model, deployment.deploymentId, material);
      } else {
        await ConfidentialModelApi.review(model.modelId, model.versionId, action);
        message.success('模型状态已更新');
      }
      await refresh();
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '操作失败');
    } finally {
      setModelActionId(undefined);
    }
  };

  const continuePublishing = async (model: ConfidentialModel) => {
    if (!model.versionId || modelActionId === model.modelId) return;
    let material = authorizationMaterials.current.get(model.versionId);
    if (!material && model.sourceType === 'LOCAL_WEIGHTS') {
      const persisted = await ConfidentialModelApi.detail(model.modelId);
      const version = persisted.versions?.find(
        (item) => item.versionId === model.versionId,
      );
      if (version?.manifest && version.assetVersionId) {
        await restoreEncryptedFileDek(version.manifest);
        material = {
          assetVersionId: version.assetVersionId,
          encryptedPayload: version.manifest,
        };
        authorizationMaterials.current.set(model.versionId, material);
      }
    }
    if (!material) {
      message.warning('当前浏览器已丢失凭据 DEK，请取消并重新导入凭据');
      return;
    }
    setModelActionId(model.modelId);
    try {
      const modelDetail = await ConfidentialModelApi.detail(model.modelId);
      const deployment = modelDetail.deployments?.find(
        (item) =>
          item.versionId === model.versionId &&
          item.status === 'AUTHORIZATION_REQUIRED',
      );
      if (!deployment) throw new Error('没有找到等待授权的部署');
      await authorizeModelDeployment(model, deployment.deploymentId, material);
      await refresh();
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '继续授权失败');
    } finally {
      setModelActionId(undefined);
    }
  };

  const cancelPublishing = async (
    model: ConfidentialModel,
    replaceCredential = false,
  ) => {
    if (modelActionId === model.modelId) return;
    setModelActionId(model.modelId);
    try {
      const modelDetail = await ConfidentialModelApi.detail(model.modelId);
      const deployments = modelDetail.deployments?.filter(
        (item) => item.status === 'AUTHORIZATION_REQUIRED',
      );
      if (!deployments?.length) throw new Error('没有找到等待授权的部署');
      for (const deployment of deployments) {
        await ConfidentialModelApi.offline(deployment.deploymentId);
        deploymentSessions.current.delete(deployment.deploymentId);
        deploymentTasks.current.delete(deployment.deploymentId);
      }
      message.success(
        replaceCredential
          ? '已取消旧发布，请重新输入凭据并创建不可变新版本'
          : '已取消等待授权的发布，模型恢复为已批准状态',
      );
      await refresh();
      if (replaceCredential) openImport(model);
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '取消发布失败');
    } finally {
      setModelActionId(undefined);
    }
  };

  const restartDeployment = async (model: ConfidentialModel, deploymentId: string) => {
    if (!model.versionId || modelActionId === model.modelId) return;
    let material = authorizationMaterials.current.get(model.versionId);
    if (!material && model.sourceType === 'LOCAL_WEIGHTS') {
      const persisted = await ConfidentialModelApi.detail(model.modelId);
      const version = persisted.versions?.find(
        (item) => item.versionId === model.versionId,
      );
      if (version?.manifest && version.assetVersionId) {
        await restoreEncryptedFileDek(version.manifest);
        material = {
          assetVersionId: version.assetVersionId,
          encryptedPayload: version.manifest,
        };
        authorizationMaterials.current.set(model.versionId, material);
      }
    }
    if (!material) {
      message.warning('当前浏览器没有该版本的解密授权材料，请导入新的加密版本后再部署');
      return;
    }
    setModelActionId(model.modelId);
    try {
      await ConfidentialModelApi.restart(deploymentId);
      await authorizeModelDeployment(model, deploymentId, material);
      message.success('模型已重新授权并启动');
      await refresh();
      if (detail?.modelId === model.modelId) {
        setDetail(await ConfidentialModelApi.detail(model.modelId));
      }
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '重新启动失败');
    } finally {
      setModelActionId(undefined);
    }
  };

  const showRuntimeLogs = async (deploymentId: string) => {
    try {
      const result = await ConfidentialModelApi.runtimeLogs(deploymentId);
      Modal.info({
        title: `vLLM 运行日志 · ${result.status}`,
        width: 900,
        content: (
          <pre
            style={{
              maxHeight: 520,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              marginTop: 16,
            }}
          >
            {result.logs || '当前尚无运行日志'}
          </pre>
        ),
      });
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '读取运行日志失败');
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
            加密模型包导入、审核发布、授权部署与受控推理
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={() => openImport()}
        >
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
            title: '安全级别',
            key: 'profile',
            render: () => <Tag color="success">最高</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) =>
              value === 'PUBLISHING' ? (
                <Tooltip title="部署已创建，正在等待当前浏览器完成一次性 TEK 授权">
                  <Tag color={statusColor[value] || 'default'}>等待授权</Tag>
                </Tooltip>
              ) : value === 'RUNTIME_REQUIRED' ? (
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
                  <>
                    <Button
                      size="small"
                      icon={<DeploymentUnitOutlined />}
                      loading={modelActionId === record.modelId}
                      onClick={() => void act(record, 'DEPLOY')}
                    >
                      部署
                    </Button>
                    {!authorizationMaterials.current.has(record.versionId || '') && (
                      <Button size="small" onClick={() => openImport(record)}>
                        {record.sourceType === 'OPENAI_COMPATIBLE'
                          ? '新凭据版本'
                          : '新权重版本'}
                      </Button>
                    )}
                  </>
                )}
                {record.status === 'PUBLISHING' && (
                  <>
                    {authorizationMaterials.current.has(record.versionId || '') && (
                      <Button
                        size="small"
                        type="primary"
                        loading={modelActionId === record.modelId}
                        onClick={() => void continuePublishing(record)}
                      >
                        继续授权
                      </Button>
                    )}
                    <Button
                      size="small"
                      disabled={modelActionId === record.modelId}
                      onClick={() => void cancelPublishing(record, true)}
                    >
                      {record.sourceType === 'OPENAI_COMPATIBLE'
                        ? '取消并重新导入凭据'
                        : '取消并重新导入权重'}
                    </Button>
                    <Button
                      size="small"
                      danger
                      disabled={modelActionId === record.modelId}
                      onClick={() => void cancelPublishing(record)}
                    >
                      取消发布
                    </Button>
                  </>
                )}
                {record.status === 'ONLINE' && (
                  <>
                    <Button
                      size="small"
                      icon={<SendOutlined />}
                      onClick={() => void openInference(record)}
                    >
                      对话测试
                    </Button>
                    <Button
                      size="small"
                      icon={<ApiOutlined />}
                      onClick={() =>
                        void createRuntimeApiKey(record).catch((failure) =>
                          message.error(failure.message),
                        )
                      }
                    >
                      创建 API Key
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        void manageRuntimeApiKeys(record).catch((failure) =>
                          message.error(failure.message),
                        )
                      }
                    >
                      Key 管理
                    </Button>
                  </>
                )}
                {record.status === 'OFFLINE' && (
                  <>
                    {/* 运行时是临时状态，容器重启或跨实例继承后原部署不再存在，
                        已批准的版本需要重新走一次部署授权才能回到在线。 */}
                    <Button
                      size="small"
                      icon={<DeploymentUnitOutlined />}
                      loading={modelActionId === record.modelId}
                      onClick={() => void act(record, 'DEPLOY')}
                    >
                      重新部署
                    </Button>
                    {record.deployments?.length !== 0 && (
                      <Button size="small" onClick={() => openImport(record)}>
                        导入新版本
                      </Button>
                    )}
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={versionTarget ? `导入新版本 · ${versionTarget.name}` : '导入机密模型'}
        open={importOpen}
        width={680}
        okText="加密并导入"
        confirmLoading={submitting}
        onOk={() => void submitImport()}
        onCancel={() => {
          if (!submitting) {
            setImportOpen(false);
            setVersionTarget(undefined);
          }
        }}
      >
        <Alert
          showIcon
          type="warning"
          message="模型权重加密保护"
          description="客户端完成加密后上传，存储节点仅保存密文和加密清单。"
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模型名称" rules={[{ required: true }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={512} />
          </Form.Item>
          <Form.Item name="domainId" label="可信域" rules={[{ required: true }]}>
            <Select options={domainOptions} />
          </Form.Item>
          <>
            <Form.Item label="加密模型包" required>
              <Alert
                showIcon
                type="info"
                message="大模型请上传完整模型包，不要只上传单个 safetensors"
                description="请使用 ZIP、TAR 或 TAR.GZ 打包：必须包含 config.json、safetensors 权重、tokenizer.json 或 tokenizer.model，以及 tokenizer_config.json；建议包含 generation_config.json、special_tokens_map.json、LICENSE/NOTICE 和 README。禁止 Python/可执行脚本、符号链接及依赖 trust_remote_code 的包。"
                style={{ marginBottom: 12 }}
              />
              <Upload.Dragger
                beforeUpload={() => false}
                maxCount={1}
                fileList={fileList}
                onChange={({ fileList: values }) => setFileList(values.slice(-1))}
              >
                <FileProtectOutlined style={{ fontSize: 28 }} />
                <div style={{ marginTop: 8 }}>
                  选择模型包压缩文件（ZIP、TAR、TAR.GZ）
                </div>
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
          message="密态推理保护"
          description={
            inferenceTarget?.sourceType === 'OPENAI_COMPATIBLE'
              ? '请求在浏览器加密，平台控制面只转发密文；CipherGPU 解密后，上游模型供应商能够看到请求和响应。'
              : '请求在浏览器加密，经任务授权后进入受控计算环境。'
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
              <Descriptions.Item label="安全级别">
                <Tag color="success">最高</Tag>
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
                    record.status === 'DESTROYED' ? null : (
                      <Space>
                        <Button
                          size="small"
                          onClick={() => void showRuntimeLogs(record.deploymentId)}
                        >
                          运行日志
                        </Button>
                        {['OFFLINE', 'FAILED'].includes(record.status) && (
                          <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            loading={modelActionId === detail.modelId}
                            onClick={() =>
                              void restartDeployment(
                                { ...detail, versionId: record.versionId },
                                record.deploymentId,
                              )
                            }
                          >
                            重新启动
                          </Button>
                        )}
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
                        {!['OFFLINE', 'FAILED'].includes(record.status) && (
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
                        )}
                        <Button
                          size="small"
                          danger
                          onClick={async () => {
                            await ConfidentialModelApi.destroy(record.deploymentId);
                            setDetail(
                              await ConfidentialModelApi.detail(detail.modelId),
                            );
                            await refresh();
                          }}
                        >
                          销毁
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
          message="结果数据加密保护"
          description="产物由服务端以密文返回，只有当前浏览器身份可以在本地解封并预览。"
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
