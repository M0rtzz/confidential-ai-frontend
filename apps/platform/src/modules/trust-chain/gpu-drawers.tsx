import { Alert, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';

import { formatTime } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { GpuChainApi, responseData } from '@/services/data-sandbox';
import type { DataSandboxResponse } from '@/services/data-sandbox';

import { formatBytes, short } from './common';
import { DetailPanel } from './detail-panel';
import type { GpuPage, GpuTrustedDomain } from './gpu-types';

const { Text } = Typography;

type Row = Record<string, unknown>;

const text = (value: unknown) =>
  value === null || value === undefined ? '-' : String(value);

const Hash = ({ value, size = 16 }: { value: unknown; size?: number }) =>
  value ? (
    <Text code copyable={{ text: String(value) }}>
      {short(value, size)}
    </Text>
  ) : (
    <>-</>
  );

/** 六段明细共用的分页表格：加载、翻页与错误提示一处实现。 */
const PagedPanel = ({
  inline,
  open,
  onClose,
  title,
  fetchPage,
  columns,
  rowKey,
  footer,
  emptyHint,
}: {
  inline?: boolean;
  open: boolean;
  onClose: () => void;
  title: string;
  fetchPage: (page: number, size: number) => Promise<DataSandboxResponse<unknown>>;
  columns: ColumnsType<Row>;
  rowKey: (row: Row) => string;
  footer: string;
  emptyHint: string;
}) => {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<GpuPage<Row>>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (target: number) => {
      setLoading(true);
      try {
        const next = responseData(
          (await fetchPage(target, 20)) as DataSandboxResponse<GpuPage<Row>>,
          { items: [], total: 0, page: target, size: 20 },
        );
        setView(next);
        setPage(next.page || target);
      } catch (failure) {
        message.error(requestErrorMessage(failure, `加载${title}失败`));
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, title],
  );

  useEffect(() => {
    if (open) void load(1);
  }, [open, load]);

  return (
    <DetailPanel
      inline={inline}
      title={title}
      width={860}
      open={open}
      onClose={onClose}
    >
      {view && view.total === 0 && (
        <Alert showIcon type="info" message={emptyHint} style={{ marginBottom: 12 }} />
      )}
      <Table<Row>
        rowKey={rowKey}
        size="small"
        scroll={{ x: 'max-content' }}
        loading={loading}
        dataSource={view?.items || []}
        columns={columns}
        pagination={{
          current: page,
          pageSize: view?.size || 20,
          total: view?.total || 0,
          showSizeChanger: false,
          onChange: (next) => void load(next),
        }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {footer}
      </Typography.Paragraph>
    </DetailPanel>
  );
};

type PanelProps = { open: boolean; onClose: () => void; inline?: boolean };

/** ① 会话身份注册：浏览器生成的 X25519 与 Ed25519 公钥登记记录 */
export const GpuIdentitiesPanel = (props: PanelProps) => (
  <PagedPanel
    {...props}
    title="会话身份注册"
    fetchPage={GpuChainApi.identities}
    rowKey={(row) => String(row.kid)}
    emptyHint="本机构尚未登记会话身份。首次进入密态功能页面时浏览器会自动生成并注册。"
    footer="私钥只存在于浏览器 IndexedDB，服务端仅保存公钥、kid 与状态。公钥列为前 16 位截断，用于快速比对。"
    columns={[
      {
        title: '密钥标识',
        dataIndex: 'kid',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 24)}</Text>
        ),
      },
      { title: '算法', dataIndex: 'algorithm' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: string) => (
          <Tag color={value === 'ACTIVE' ? 'success' : 'default'}>
            {value === 'ACTIVE' ? '生效' : value === 'REVOKED' ? '已吊销' : value}
          </Tag>
        ),
      },
      {
        title: '加密公钥',
        dataIndex: 'encryptionPublicKeyHead',
        render: (value) => <Text code>{text(value)}</Text>,
      },
      {
        title: '签名公钥',
        dataIndex: 'signingPublicKeyHead',
        render: (value) => <Text code>{text(value)}</Text>,
      },
      { title: '登记时间', dataIndex: 'createdAt', render: formatTime },
      { title: '吊销时间', dataIndex: 'revokedAt', render: formatTime },
    ]}
  />
);

/** ② 权重与数据密文化：逐版本一把 DEK，内容加密在浏览器完成 */
export const GpuAssetsPanel = (props: PanelProps) => (
  <PagedPanel
    {...props}
    title="权重与数据密文化"
    fetchPage={GpuChainApi.assets}
    rowKey={(row) => String(row.assetVersionId)}
    emptyHint="本机构尚未导入密文资产或模型权重。"
    footer="每个资产版本对应一把 DEK，由客户密钥公钥封装；控制面只保存密文、清单摘要与属主签名。"
    columns={[
      { title: '资产', dataIndex: 'assetName', render: (value) => text(value) },
      {
        title: '版本',
        key: 'version',
        render: (_, row) => `v${text(row.versionNumber)}`,
      },
      { title: '类型', dataIndex: 'assetType', render: (value) => text(value) },
      { title: '加密算法', dataIndex: 'algorithm' },
      { title: '可信域', dataIndex: 'domainId' },
      {
        title: '原文大小',
        dataIndex: 'originalSize',
        render: (value) => formatBytes(Number(value)),
      },
      {
        title: '密文大小',
        dataIndex: 'cipherSize',
        render: (value) => formatBytes(Number(value)),
      },
      {
        title: '清单摘要',
        dataIndex: 'manifestHash',
        render: (value) => <Hash value={value} />,
      },
      { title: '状态', dataIndex: 'status' },
      { title: '创建时间', dataIndex: 'createdAt', render: formatTime },
    ]}
  />
);

/** ③ 可信域校验：状态与协议字段取自控制面登记，不代表硬件隔离已具备 */
export const GpuDomainsPanel = ({
  inline,
  open,
  onClose,
  domains,
}: PanelProps & { domains?: GpuTrustedDomain[] }) => (
  <DetailPanel
    inline={inline}
    title="可信域校验"
    width={860}
    open={open}
    onClose={onClose}
  >
    <Table<GpuTrustedDomain>
      rowKey={(row) => row.id}
      size="small"
      scroll={{ x: 'max-content' }}
      dataSource={domains || []}
      pagination={false}
      columns={[
        { title: '可信域', dataIndex: 'name' },
        { title: '标识', dataIndex: 'id' },
        {
          title: '可用状态',
          dataIndex: 'status',
          render: (value: string) => (
            <Tag color={value === 'active' ? 'success' : 'default'}>
              {value === 'active' ? '可用' : value}
            </Tag>
          ),
        },
        {
          title: '信任状态',
          dataIndex: 'trustStatus',
          render: (value: string) => (
            <Tag color={value === 'trusted' ? 'success' : 'error'}>
              {value === 'trusted' ? '可信' : value === 'blocked' ? '已阻断' : value}
            </Tag>
          ),
        },
        { title: '安全档位', dataIndex: 'securityProfile' },
        { title: '证据类型', dataIndex: 'evidenceType' },
        { title: '硬件型号', dataIndex: 'hardwareModel' },
        { title: '策略', dataIndex: 'policyId' },
      ]}
    />
    <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
      只有同时满足可用与可信的域才能用于密文上传、证明与执行；离线或阻断的域取不到会话公钥。
    </Typography.Paragraph>
  </DetailPanel>
);

/** ④ 证明与一次性 TEK：TaskSpec 绑定版本与接收人，最长有效 5 分钟 */
export const GpuAttestationsPanel = (props: PanelProps) => (
  <PagedPanel
    {...props}
    title="证明与一次性 TEK"
    fetchPage={GpuChainApi.attestations}
    rowKey={(row) => String(row.sessionId)}
    emptyHint="本机构尚无证明会话。发起模型部署或协议验证后会产生记录。"
    footer="证明会话绑定任务及临时公钥，仅在有效期内使用，不支持跨任务复用。"
    columns={[
      {
        title: '会话',
        dataIndex: 'sessionId',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 20)}</Text>
        ),
      },
      {
        title: '任务',
        dataIndex: 'taskId',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 20)}</Text>
        ),
      },
      {
        title: 'TaskSpec 摘要',
        dataIndex: 'taskSpecDigest',
        render: (v) => <Hash value={v} />,
      },
      {
        title: 'TEK 公钥摘要',
        dataIndex: 'teePubkeyHash',
        render: (v) => <Hash value={v} />,
      },
      {
        title: '证据摘要',
        dataIndex: 'evidenceHash',
        render: (v) => <Hash value={v} />,
      },
      {
        title: '证据类型',
        dataIndex: 'evidenceType',
        render: (value: string, row) => (
          <Tag color={row.simulated ? 'warning' : 'success'}>
            {value}
            {row.simulated ? ' · 仿真' : ''}
          </Tag>
        ),
      },
      { title: '硬件型号', dataIndex: 'hardwareModel' },
      { title: '签发时间', dataIndex: 'issuedAt', render: formatTime },
      { title: '过期时间', dataIndex: 'expiresAt', render: formatTime },
      { title: '状态', dataIndex: 'status' },
    ]}
  />
);

/** ⑤ 一次性授权放钥：grant 的 maxUses 固定为 1，jti 不可复用 */
export const GpuGrantsPanel = (props: PanelProps) => (
  <PagedPanel
    {...props}
    title="一次性授权放钥"
    fetchPage={GpuChainApi.grants}
    rowKey={(row) => String(row.grantId)}
    emptyHint="本机构尚无一次性授权记录。"
    footer="grant 由客户以 Ed25519 会话身份签署，只可使用一次；消费后 DEK 才由 CipherGPU 在内存中解封。"
    columns={[
      {
        title: '授权',
        dataIndex: 'grantId',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 20)}</Text>
        ),
      },
      {
        title: 'jti',
        dataIndex: 'jti',
        render: (value) => <Hash value={value} size={20} />,
      },
      {
        title: '绑定任务',
        dataIndex: 'taskId',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 20)}</Text>
        ),
      },
      { title: '声明摘要', dataIndex: 'claimsHash', render: (v) => <Hash value={v} /> },
      {
        title: '状态',
        key: 'state',
        render: (_, row) =>
          row.revokedAt ? (
            <Tag color="error">已吊销</Tag>
          ) : row.consumedAt ? (
            <Tag color="success">已消费</Tag>
          ) : (
            <Tag color="processing">待消费</Tag>
          ),
      },
      { title: '签署时间', dataIndex: 'createdAt', render: formatTime },
      { title: '消费时间', dataIndex: 'consumedAt', render: formatTime },
      { title: '过期时间', dataIndex: 'expiresAt', render: formatTime },
    ]}
  />
);

/** ⑥ 密态执行与输出出域：产出由新的 ODK 加密，逐接收人封装 */
export const GpuExecutionsPanel = (props: PanelProps) => (
  <PagedPanel
    {...props}
    title="密态执行与输出出域"
    fetchPage={GpuChainApi.executions}
    rowKey={(row) => String(row.executionId)}
    emptyHint="本机构尚无密态执行记录。"
    footer="输出明文不经控制面返回：CipherGPU 用新的 ODK 加密产物，并为每个接收人单独封装，由接收人在浏览器本地解开。"
    columns={[
      {
        title: '执行',
        dataIndex: 'executionId',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 20)}</Text>
        ),
      },
      {
        title: '任务',
        dataIndex: 'taskId',
        render: (value) => (
          <Text copyable={{ text: String(value) }}>{short(value, 20)}</Text>
        ),
      },
      {
        title: '镜像摘要',
        dataIndex: 'imageDigest',
        render: (v) => <Hash value={v} />,
      },
      {
        title: 'SBOM 摘要',
        dataIndex: 'sbomDigest',
        render: (v) => <Hash value={v} />,
      },
      {
        title: '产出清单摘要',
        dataIndex: 'outputManifestHash',
        render: (v) => <Hash value={v} />,
      },
      { title: '安全档位', dataIndex: 'securityProfile' },
      { title: '状态', dataIndex: 'status' },
      { title: '开始时间', dataIndex: 'createdAt', render: formatTime },
      { title: '完成时间', dataIndex: 'completedAt', render: formatTime },
    ]}
  />
);
