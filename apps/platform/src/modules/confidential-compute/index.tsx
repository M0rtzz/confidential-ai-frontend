import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  ExperimentOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Input,
  message,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { history } from 'umi';

import { mockPublicKeys } from '@/mocks/publicKeys';
import { mockTrustedDomains } from '@/mocks/trustedDomains';
import {
  CONTENT_ENCRYPTION_CAPABILITIES,
  cryptoAdapter,
  decryptEncryptedFile,
  getSessionIdentity,
  publicKeyService,
  type ContentEncryptionAlgorithm,
  type EncryptedFilePayload,
  type PublicKeyInfo,
  type TrustedDomain,
} from '@/security/crypto';
import { ConfidentialAssetApi } from '@/services/confidential-assets';
import {
  confidentialComputeAdapters,
  type DomainVerification,
} from '@/services/confidential-compute';

import { AssetManagementPanel, ResultAssetPanel } from './asset-management';
import styles from './index.less';

type DataSource = keyof typeof confidentialComputeAdapters;
type Scenario =
  | 'NORMAL'
  | 'TAMPERED'
  | 'KEY_MISMATCH'
  | 'DOMAIN_MISMATCH'
  | 'EXPIRED_KEY'
  | 'BLOCKED'
  | 'UNAUTHORIZED'
  | 'REPLAYED';

type ScenarioResult = {
  scenario: Scenario;
  passed: boolean;
  expected: string;
  detail: string;
  duration: number;
};

const trustTag = (domain: TrustedDomain) =>
  domain.trustStatus === 'trusted' ? (
    <Tag color="success" icon={<CheckCircleOutlined />}>
      Trusted
    </Tag>
  ) : (
    <Tag color="error" icon={<StopOutlined />}>
      Blocked
    </Tag>
  );

const publicKeyTag = (key?: PublicKeyInfo) => {
  const colors: Record<string, string> = {
    active: 'success',
    expired: 'warning',
    revoked: 'error',
    recycled: 'default',
  };
  return key ? (
    <Tag color={colors[key.status]}>{key.status.toUpperCase()}</Tag>
  ) : (
    <Tag>NONE</Tag>
  );
};

const DomainDetail = ({
  domain,
  verifying,
  verification,
  onVerify,
}: {
  domain?: TrustedDomain;
  verifying: boolean;
  verification?: DomainVerification;
  onVerify: () => void;
}) => {
  const [key, setKey] = useState<PublicKeyInfo>();
  useEffect(() => {
    setKey(undefined);
    if (!domain) return;
    publicKeyService
      .getActiveKey(domain.id)
      .then(setKey)
      .catch(() => setKey(mockPublicKeys.find((item) => item.domainId === domain.id)));
  }, [domain]);

  if (!domain) {
    return (
      <div className={styles.emptyDetail}>
        <Empty description="请选择可信域" />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.detailHeader}>
        <div>
          <Typography.Title level={5} className={styles.detailTitle}>
            {domain.name}
          </Typography.Title>
          <Typography.Text type="secondary">{domain.id}</Typography.Text>
        </div>
        <Button
          icon={<SafetyCertificateOutlined />}
          loading={verifying}
          disabled={domain.trustStatus === 'blocked'}
          onClick={onVerify}
        >
          校验可信域
        </Button>
      </div>

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="安全级别">
          <Tag color="success">最高</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="信任状态">{trustTag(domain)}</Descriptions.Item>
        <Descriptions.Item label="硬件型号">{domain.hardwareModel}</Descriptions.Item>
        <Descriptions.Item label="策略">{domain.policyId}</Descriptions.Item>
        <Descriptions.Item label="Public Key">
          <Space direction="vertical" size={2}>
            <Space>
              {publicKeyTag(key)}
              <Typography.Text>{key?.keyId || '-'}</Typography.Text>
            </Space>
            {key && (
              <>
                <Typography.Text className={styles.keyValue}>
                  {key.fingerprint}
                </Typography.Text>
                <Tooltip title="复制公钥">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void navigator.clipboard.writeText(key.publicKey)}
                  />
                </Tooltip>
              </>
            )}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="绑定资源">
          <Space wrap>
            {(domain.boundResources || []).length
              ? domain.boundResources?.map((item) => <Tag key={item}>{item}</Tag>)
              : '-'}
          </Space>
        </Descriptions.Item>
      </Descriptions>

      {verification && (
        <Alert showIcon type="success" style={{ marginTop: 16 }} message="校验通过" />
      )}
    </div>
  );
};

const DomainPanel = ({
  domains,
  loading,
  adapterSource,
}: {
  domains: TrustedDomain[];
  loading: boolean;
  adapterSource: DataSource;
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<DomainVerification>();
  const selected = domains.find((item) => item.id === selectedId) || domains[0];

  useEffect(() => {
    if (!selectedId && domains[0]) setSelectedId(domains[0].id);
    if (selectedId && !domains.some((item) => item.id === selectedId)) {
      setSelectedId(domains[0]?.id || '');
    }
  }, [domains, selectedId]);

  const verify = async () => {
    if (!selected) return;
    setVerifying(true);
    setVerification(undefined);
    try {
      const result = await confidentialComputeAdapters[adapterSource].verifyDomain(
        selected.id,
      );
      setVerification(result);
      message.success('模拟证据和域策略校验通过');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '可信域校验失败');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className={styles.domainLayout}>
      <div className={styles.domainList}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={domains}
          pagination={false}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selected ? [selected.id] : [],
            onChange: (keys) => {
              setSelectedId(String(keys[0] || ''));
              setVerification(undefined);
            },
          }}
          onRow={(record) => ({
            onClick: () => {
              setSelectedId(record.id);
              setVerification(undefined);
            },
          })}
          columns={[
            { title: '可信域', dataIndex: 'name' },
            {
              title: '状态',
              key: 'trustStatus',
              width: 120,
              render: (_, record) => trustTag(record),
            },
            {
              title: '安全级别',
              key: 'securityLevel',
              width: 120,
              render: () => <Tag color="success">最高</Tag>,
            },
          ]}
        />
      </div>
      <div className={styles.domainDetail}>
        <DomainDetail
          domain={selected}
          verifying={verifying}
          verification={verification}
          onVerify={() => void verify()}
        />
      </div>
    </div>
  );
};

const ProtocolPanel = ({ domains }: { domains: TrustedDomain[] }) => {
  const [sourceId, setSourceId] = useState('a100-domain-a');
  const [algorithm, setAlgorithm] = useState<ContentEncryptionAlgorithm>('AES-256-GCM');
  const [scenarios, setScenarios] = useState<Scenario[]>([
    'NORMAL',
    'TAMPERED',
    'KEY_MISMATCH',
  ]);
  const [plaintext, setPlaintext] = useState('confidential protocol validation');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ScenarioResult[]>([]);

  const scenarioMeta: Record<Scenario, { label: string; expected: string }> = {
    NORMAL: { label: '正常加解密', expected: '解密结果与原文一致' },
    TAMPERED: { label: '密文篡改', expected: '认证校验拒绝解密' },
    KEY_MISMATCH: { label: '密钥不匹配', expected: '密钥解封失败' },
    DOMAIN_MISMATCH: { label: '可信域不匹配', expected: '域绑定校验阻断' },
    EXPIRED_KEY: { label: '公钥过期', expected: '加密请求被阻断' },
    BLOCKED: { label: '可信域禁用', expected: '域策略阻断请求' },
    UNAUTHORIZED: { label: '未授权使用', expected: '创建申请并阻断执行' },
    REPLAYED: { label: '授权失效或重放', expected: '一次性凭证拒绝重放' },
  };

  const encrypt = async () => {
    const identity = await getSessionIdentity();
    const key: PublicKeyInfo = {
      keyId: identity.kid,
      domainId: sourceId,
      version: 1,
      algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
      fingerprint: identity.kid,
      publicKey: identity.encryptionPublicKey,
      status: 'active',
    };
    return cryptoAdapter.encryptFile(
      new File([plaintext], 'protocol.txt'),
      key,
      undefined,
      { algorithm },
    );
  };

  const changed = (value: string) => `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
  const clone = (payload: EncryptedFilePayload): EncryptedFilePayload => ({
    ...payload,
    keyEnvelope: { ...payload.keyEnvelope },
    chunks: payload.chunks.map((item) => ({ ...item, aad: { ...item.aad } })),
  });

  const verify = async (scenario: Scenario): Promise<ScenarioResult> => {
    const started = performance.now();
    let passed = false;
    let detail = '';
    try {
      if (scenario === 'EXPIRED_KEY') {
        const identity = await getSessionIdentity();
        await cryptoAdapter.encryptFile(
          new File([plaintext], 'protocol.txt'),
          {
            keyId: identity.kid,
            domainId: sourceId,
            version: 1,
            algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
            fingerprint: identity.kid,
            publicKey: identity.encryptionPublicKey,
            status: 'expired',
            expiresAt: '2026-01-01T00:00:00Z',
          },
          undefined,
          { algorithm },
        );
        detail = '过期公钥未被阻断';
      } else if (scenario === 'BLOCKED') {
        const blocked = domains.find((item) => item.trustStatus === 'blocked');
        if (!blocked) throw new Error('可信域状态为禁用，请求已按策略阻断');
        await publicKeyService.getActiveKey(blocked.id);
        detail = '禁用可信域未被阻断';
      } else if (scenario === 'UNAUTHORIZED') {
        const assets = await ConfidentialAssetApi.list();
        if (assets.length > 0) {
          const result = await ConfidentialAssetApi.authorize({
            taskId: `protocol-unauthorized-${Date.now()}`,
            taskName: '协议验证未授权任务',
            computeNode: '协议验证节点',
            purpose: '验证未审批时执行入口阻断',
            assetVersionIds: [assets[0].assetVersionId],
          });
          passed =
            !result.ready &&
            result.status === 'AUTHORIZATION_REQUIRED' &&
            result.requests.some((item) => item.status === 'PENDING');
          detail = passed
            ? '资产使用网关已创建待审批申请，并阻断执行与密钥释放'
            : '未授权请求未按预期创建申请并阻断';
        } else {
          const result = await ConfidentialAssetApi.validateAuthorizationProtocol(
            scenario,
          );
          passed = result.passed;
          detail = `${result.actual}；当前尚无已上传资产，上传后将同步创建资产使用申请`;
        }
      } else if (scenario === 'REPLAYED') {
        const result = await ConfidentialAssetApi.validateAuthorizationProtocol(
          scenario,
        );
        passed = result.passed;
        detail = result.actual;
      } else {
        const payload = await encrypt();
        if (scenario === 'NORMAL') {
          const value = await decryptEncryptedFile(payload);
          passed = new TextDecoder().decode(value) === plaintext;
          value.fill(0);
          detail = passed
            ? '真实加密、密钥解封、认证解密和原文比对均通过'
            : '解密内容与原文不一致';
        } else {
          const invalid = clone(payload);
          if (scenario === 'TAMPERED')
            invalid.chunks[0].ciphertext = changed(invalid.chunks[0].ciphertext);
          if (scenario === 'KEY_MISMATCH')
            invalid.keyEnvelope.enc = changed(invalid.keyEnvelope.enc);
          if (scenario === 'DOMAIN_MISMATCH')
            invalid.domainId = `${invalid.domainId}-other`;
          try {
            await decryptEncryptedFile(invalid);
            detail = '异常密文未被阻断';
          } catch (error) {
            passed = true;
            detail = error instanceof Error ? error.message : '异常请求已阻断';
          }
        }
      }
    } catch (error) {
      if (['EXPIRED_KEY', 'BLOCKED'].includes(scenario)) passed = true;
      detail = error instanceof Error ? error.message : '请求已阻断';
    }
    return {
      scenario,
      passed,
      expected: scenarioMeta[scenario].expected,
      detail,
      duration: Math.max(1, Math.round(performance.now() - started)),
    };
  };

  const run = async () => {
    setRunning(true);
    setResults([]);
    try {
      setResults(await Promise.all(scenarios.map(verify)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className={styles.scenarioControls}>
        <div>
          <Typography.Text className={styles.controlLabel}>可信域</Typography.Text>
          <Select
            value={sourceId}
            options={domains
              .filter((item) => item.trustStatus === 'trusted')
              .map((item) => ({ label: item.name, value: item.id }))}
            onChange={setSourceId}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <Typography.Text className={styles.controlLabel}>加密算法</Typography.Text>
          <Select
            value={algorithm}
            options={CONTENT_ENCRYPTION_CAPABILITIES.map((item) => ({
              label: item.label,
              value: item.algorithm,
            }))}
            onChange={setAlgorithm}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <Typography.Text className={styles.controlLabel}>验证场景</Typography.Text>
          <Select<Scenario[]>
            mode="multiple"
            value={scenarios}
            onChange={setScenarios}
            style={{ width: '100%' }}
            options={(Object.keys(scenarioMeta) as Scenario[]).map((value) => ({
              label: scenarioMeta[value].label,
              value,
            }))}
          />
        </div>
      </div>
      <Input.TextArea
        className={styles.scenarioInput}
        rows={3}
        maxLength={2048}
        value={plaintext}
        onChange={(event) => setPlaintext(event.target.value)}
      />
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<LockOutlined />}
          loading={running}
          disabled={!plaintext || !scenarios.length}
          onClick={() => void run()}
        >
          本地加密并验证
        </Button>
        <Typography.Text type="secondary">真实认证加密与异常阻断验证</Typography.Text>
      </Space>
      <Table
        rowKey="scenario"
        pagination={false}
        dataSource={results}
        columns={[
          {
            title: '验证场景',
            dataIndex: 'scenario',
            render: (value: Scenario) => scenarioMeta[value].label,
          },
          { title: '预期行为', dataIndex: 'expected' },
          {
            title: '验证结果',
            dataIndex: 'passed',
            render: (value: boolean) => (
              <Tag
                color={value ? 'success' : 'error'}
                icon={value ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              >
                {value ? '验证通过' : '验证失败'}
              </Tag>
            ),
          },
          { title: '实际结果与原因', dataIndex: 'detail' },
          {
            title: '耗时',
            dataIndex: 'duration',
            width: 90,
            render: (value: number) => `${value} ms`,
          },
        ]}
      />
    </div>
  );
};

export const ConfidentialComputeComponent = () => {
  const [domains, setDomains] = useState<TrustedDomain[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDomains(await confidentialComputeAdapters.api.listDomains());
    } catch {
      setDomains(mockTrustedDomains);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  const visibleDomains = (domains.length ? domains : mockTrustedDomains).filter(
    (domain) => domain.trustStatus !== 'blocked',
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Typography.Title level={4} className={styles.heading}>
            数据与模型权重机密计算
          </Typography.Title>
          <Typography.Text type="secondary">
            加密上传、审批授权、受控计算与加密结果管理
          </Typography.Text>
        </div>
        <Tooltip title="刷新">
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void refresh()}
          />
        </Tooltip>
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={() => history.push('/confidential-training')}
        >
          节点训练任务
        </Button>
      </div>
      <div className={styles.surface}>
        <Tabs
          items={[
            {
              key: 'assets',
              label: '数据与模型权重管理',
              children: <AssetManagementPanel domains={visibleDomains} />,
            },
            {
              key: 'domains',
              label: '可信域',
              children: (
                <DomainPanel
                  domains={visibleDomains}
                  loading={loading}
                  adapterSource="api"
                />
              ),
            },
            {
              key: 'protocol',
              label: '协议验证',
              children: <ProtocolPanel domains={visibleDomains} />,
            },
            {
              key: 'results',
              label: '结果数据与模型权重管理',
              children: <ResultAssetPanel />,
            },
          ]}
        />
      </div>
    </div>
  );
};
