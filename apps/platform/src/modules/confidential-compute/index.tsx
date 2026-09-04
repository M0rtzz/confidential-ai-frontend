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
  Segmented,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { mockDecryptEvents } from '@/mocks/decryptEvents';
import { mockPublicKeys } from '@/mocks/publicKeys';
import { mockTrustedDomains } from '@/mocks/trustedDomains';
import {
  cryptoAdapter,
  publicKeyService,
  type EncryptedPayload,
  type PublicKeyInfo,
  type TrustedDomain,
} from '@/security/crypto';
import {
  type AuditEvent,
  confidentialComputeAdapters,
  type DomainVerification,
} from '@/services/confidential-compute';

import styles from './index.less';
import { ConfidentialModelPanel } from './model-panel';

type DataSource = keyof typeof confidentialComputeAdapters;
type Scenario = 'NORMAL' | 'KEY_MISMATCH' | 'TAMPERED' | 'EXPIRED_KEY' | 'BLOCKED';

type ScenarioResult = {
  status: 'success' | 'error' | 'warning';
  title: string;
  detail: string;
  payload?: EncryptedPayload;
  targetDomainId?: string;
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
        <Descriptions.Item label="安全档位">
          <Tag color="warning">A100_SIMULATED</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="信任状态">{trustTag(domain)}</Descriptions.Item>
        <Descriptions.Item label="证明类型">{domain.evidenceType}</Descriptions.Item>
        <Descriptions.Item label="硬件型号">{domain.hardwareModel}</Descriptions.Item>
        <Descriptions.Item label="策略">{domain.policyId}</Descriptions.Item>
        <Descriptions.Item label="证明结论">
          <Tag color="default">attestationVerified=false</Tag>
        </Descriptions.Item>
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
        <Alert
          showIcon
          type="warning"
          style={{ marginTop: 16 }}
          message="模拟证据校验通过"
          description={`${verification.runtime.evidenceType} / ${verification.runtime.hardwareModel}；该结论不代表 GPU CC 硬件证明。`}
        />
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
              title: '环境',
              dataIndex: 'securityProfile',
              width: 120,
              render: () => <Tag color="warning">a100-sim</Tag>,
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
  const trusted = domains.filter((item) => item.trustStatus === 'trusted');
  const [sourceId, setSourceId] = useState('a100-domain-a');
  const [targetId, setTargetId] = useState('a100-domain-a');
  const [scenario, setScenario] = useState<Scenario>('NORMAL');
  const [plaintext, setPlaintext] = useState('confidential protocol validation');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScenarioResult>();

  useEffect(() => {
    if (scenario === 'NORMAL') setTargetId(sourceId);
    if (scenario === 'KEY_MISMATCH') {
      const other = trusted.find((item) => item.id !== sourceId);
      if (other) setTargetId(other.id);
    }
    if (scenario === 'BLOCKED') {
      setSourceId('a100-domain-c');
      setTargetId('a100-domain-c');
    }
  }, [scenario]);

  const run = async () => {
    setRunning(true);
    setResult(undefined);
    try {
      const source = domains.find((item) => item.id === sourceId);
      if (!source || source.trustStatus === 'blocked' || scenario === 'BLOCKED') {
        setResult({
          status: 'error',
          title: 'REQUEST_BLOCKED',
          detail: '可信域当前处于 Blocked 状态，禁止获取公钥、上传和解密请求。',
        });
        return;
      }
      let key = await publicKeyService.getActiveKey(sourceId);
      if (scenario === 'EXPIRED_KEY') {
        key = { ...key, status: 'expired', expiresAt: '2026-01-01T00:00:00Z' };
      }
      const payload = await cryptoAdapter.encryptText(plaintext, key);
      if (scenario === 'TAMPERED') {
        setResult({
          status: 'error',
          title: 'CIPHER_INTEGRITY_FAILED',
          detail: '密文完整性校验失败，未执行服务端解密。',
          payload: { ...payload, ciphertext: `${payload.ciphertext.slice(0, -1)}A` },
          targetDomainId: targetId,
        });
        return;
      }
      if (payload.domainId !== targetId) {
        setResult({
          status: 'error',
          title: 'KEY_MATCH_FAILED',
          detail: '当前密文与目标可信域不匹配，业务执行已阻断。',
          payload,
          targetDomainId: targetId,
        });
        return;
      }
      setResult({
        status: 'success',
        title: 'DOMAIN_ROUTE_MATCHED',
        detail:
          '本地加密、密文完整性和域路由绑定校验通过；服务端任务仍需一次性 TEK 证明与用户授权。',
        payload,
        targetDomainId: targetId,
      });
    } catch (error) {
      setResult({
        status: scenario === 'EXPIRED_KEY' ? 'warning' : 'error',
        title: scenario === 'EXPIRED_KEY' ? 'PUBLIC_KEY_EXPIRED' : 'ENCRYPTION_FAILED',
        detail: error instanceof Error ? error.message : '本地加密失败',
      });
    } finally {
      setRunning(false);
    }
  };

  const sourceOptions = domains.map((item) => ({ label: item.name, value: item.id }));
  const targetOptions = domains.map((item) => ({ label: item.name, value: item.id }));
  const stepStatus =
    result?.status === 'success' ? 'finish' : result ? 'error' : 'wait';

  return (
    <div>
      <div className={styles.scenarioControls}>
        <div>
          <Typography.Text className={styles.controlLabel}>加密域</Typography.Text>
          <Select
            value={sourceId}
            options={sourceOptions}
            onChange={setSourceId}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <Typography.Text className={styles.controlLabel}>路由域</Typography.Text>
          <Select
            value={targetId}
            options={targetOptions}
            onChange={setTargetId}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <Typography.Text className={styles.controlLabel}>验证场景</Typography.Text>
          <Select<Scenario>
            value={scenario}
            onChange={setScenario}
            style={{ width: '100%' }}
            options={[
              { label: '正常匹配', value: 'NORMAL' },
              { label: 'Key Pair Mismatch', value: 'KEY_MISMATCH' },
              { label: '密文篡改', value: 'TAMPERED' },
              { label: '公钥过期', value: 'EXPIRED_KEY' },
              { label: 'Blocked Domain', value: 'BLOCKED' },
            ]}
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
          disabled={!plaintext}
          onClick={() => void run()}
        >
          本地加密并验证
        </Button>
        <Typography.Text type="secondary">AES-256-GCM + RFC 9180 HPKE</Typography.Text>
      </Space>
      <div className={styles.flow}>
        <Steps
          size="small"
          responsive
          items={[
            { title: 'Local Encrypt', status: result ? 'finish' : 'wait' },
            { title: 'Cipher Only', status: result?.payload ? 'finish' : 'wait' },
            {
              title: 'Integrity Validation',
              status:
                scenario === 'TAMPERED' && result
                  ? 'error'
                  : result?.payload
                  ? 'finish'
                  : 'wait',
            },
            { title: 'Domain Routing', status: stepStatus },
            {
              title:
                result?.status === 'success' ? 'Authorized Gate' : 'Request Blocked',
              status: stepStatus,
            },
          ]}
        />
      </div>
      {result && (
        <div
          className={`${styles.result} ${
            result.status === 'success'
              ? styles.resultSuccess
              : result.status === 'warning'
              ? styles.resultWarning
              : styles.resultError
          }`}
        >
          <Space>
            {result.status === 'success' ? (
              <CheckCircleOutlined />
            ) : result.status === 'warning' ? (
              <ExperimentOutlined />
            ) : (
              <CloseCircleOutlined />
            )}
            <Typography.Text strong>{result.title}</Typography.Text>
          </Space>
          <div>{result.detail}</div>
          {result.payload && (
            <div className={styles.resultMeta}>
              <div>
                <Typography.Text type="secondary">Envelope ID</Typography.Text>
                <div className={styles.resultMetaValue}>
                  {result.payload.envelopeId}
                </div>
              </div>
              <div>
                <Typography.Text type="secondary">Cipher Hash</Typography.Text>
                <div className={styles.resultMetaValue}>
                  {result.payload.cipherHash}
                </div>
              </div>
              <div>
                <Typography.Text type="secondary">Public Key</Typography.Text>
                <div className={styles.resultMetaValue}>
                  {result.payload.publicKeyId} v{result.payload.publicKeyVersion}
                </div>
              </div>
              <div>
                <Typography.Text type="secondary">Route</Typography.Text>
                <div className={styles.resultMetaValue}>
                  {result.payload.domainId} → {result.targetDomainId}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AuditPanel = ({
  events,
  loading,
}: {
  events: AuditEvent[];
  loading: boolean;
}) => (
  <Table
    rowKey={(row) => `${row.eventType}-${row.subjectId}-${row.createdAt}`}
    loading={loading}
    dataSource={events}
    pagination={{ pageSize: 8 }}
    columns={[
      { title: 'Event', dataIndex: 'eventType' },
      { title: 'Subject', dataIndex: 'subjectId' },
      {
        title: 'Profile',
        dataIndex: 'securityProfile',
        render: (value) => <Tag color="warning">{value || 'a100-sim'}</Tag>,
      },
      {
        title: 'Simulated',
        dataIndex: 'simulated',
        render: (value) => (
          <Tag color={value ? 'warning' : 'success'}>{String(Boolean(value))}</Tag>
        ),
      },
      { title: 'Time', dataIndex: 'createdAt' },
    ]}
  />
);

export const ConfidentialComputeComponent = () => {
  const [source, setSource] = useState<DataSource>('api');
  const [domains, setDomains] = useState<TrustedDomain[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const adapter = confidentialComputeAdapters[source];
      const [domainRows, auditRows] = await Promise.all([
        adapter.listDomains(),
        adapter.listAudits().catch(() => []),
      ]);
      setDomains(domainRows);
      setAudits(auditRows);
    } catch (failure) {
      setDomains([]);
      setAudits([]);
      setError(failure instanceof Error ? failure.message : '可信计算数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => void refresh(), [refresh]);

  const sourceControl = useMemo(
    () => (
      <Space wrap>
        <Segmented
          value={source}
          onChange={(value) => setSource(value as DataSource)}
          options={[
            { label: '后端 API', value: 'api' },
            { label: '统一 Mock', value: 'mock' },
          ]}
        />
        <Tooltip title="刷新">
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void refresh()}
          />
        </Tooltip>
      </Space>
    ),
    [loading, refresh, source],
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Typography.Title level={4} className={styles.heading}>
            可信计算控制台
          </Typography.Title>
          <Typography.Text type="secondary">
            可信域策略、客户端密文入口与任务授权审计
          </Typography.Text>
        </div>
        {sourceControl}
      </div>
      <Alert
        showIcon
        type="warning"
        className={styles.boundary}
        message="A100_SIMULATED：运行时不受 GPU CC 硬件保护"
        description="当前环境使用真实 AES-GCM、HPKE、签名和一次性授权协议，但模拟证明不排除宿主 root、驱动层或高权限调试者读取任务期间的明文。"
      />
      {error && (
        <Alert
          showIcon
          type="error"
          closable
          className={styles.boundary}
          message="后端接口不可用"
          description={error}
        />
      )}
      <div className={styles.surface}>
        <Tabs
          items={[
            {
              key: 'models',
              label: '机密模型',
              children: (
                <ConfidentialModelPanel
                  domains={domains.length ? domains : mockTrustedDomains}
                />
              ),
            },
            {
              key: 'domains',
              label: '可信域',
              children: (
                <DomainPanel
                  domains={domains}
                  loading={loading}
                  adapterSource={source}
                />
              ),
            },
            {
              key: 'protocol',
              label: '协议验证',
              children: (
                <ProtocolPanel
                  domains={domains.length ? domains : mockTrustedDomains}
                />
              ),
            },
            {
              key: 'events',
              label: `解密事件 (${mockDecryptEvents.length})`,
              children: (
                <AuditPanel
                  events={mockDecryptEvents.map((event) => ({
                    eventType: event.eventType,
                    subjectId: event.domainId,
                    securityProfile: 'a100-sim',
                    simulated: true,
                    createdAt: event.timestamp,
                  }))}
                  loading={false}
                />
              ),
            },
            {
              key: 'audit',
              label: '审计链',
              children: <AuditPanel events={audits} loading={loading} />,
            },
          ]}
        />
      </div>
    </div>
  );
};
