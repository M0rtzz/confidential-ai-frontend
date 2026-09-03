import { Alert, Button, Descriptions, Drawer, Empty, message, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { formatTime } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

import {
  blockerLabel,
  exportStateLabel,
  formatBytes,
  hexRows,
  keyStateLabel,
  kindLabel,
  policyStateLabel,
  short,
  voteLabel,
} from './common';
import styles from './index.less';
import type { TeeEnvironment } from './types';

const { Text, Paragraph } = Typography;

const keyStateColor: Record<string, string> = {
  ACTIVE: 'success',
  REVOKED: 'default',
  EXPIRED: 'warning',
};

const exportStateColor: Record<string, string> = {
  EXPORTED: 'success',
  APPROVED: 'success',
  PENDING_APPROVAL: 'processing',
  REJECTED: 'error',
  CANCELLED: 'default',
  NOT_EXPORTED: 'default',
};

/** ① 密钥台账：密钥仅中心端一处保管，客户端展示的是委派后的同一份台账 */
export const KeyLedgerDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(responseData(await TrustChainApi.keys(), {}).items || []);
    } catch (error) {
      message.error(requestErrorMessage(error, '加载密钥台账失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Drawer title="密钥台账" width={760} open={open} onClose={onClose}>
      <Table
        rowKey={(row) => `${row.keyId}-${row.keyVersion}`}
        size="small"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: '密钥',
            key: 'key',
            render: (_, row) => `${short(row.keyId, 18)} · v${row.keyVersion}`,
          },
          { title: '资产', dataIndex: 'assetId', render: (v) => short(v, 18) },
          { title: '机构', dataIndex: 'ownerId' },
          {
            title: '状态',
            dataIndex: 'state',
            render: (v: string) => (
              <Tag color={keyStateColor[v] || 'default'}>{keyStateLabel(v)}</Tag>
            ),
          },
          { title: '签发时间', dataIndex: 'issuedAt', render: formatTime },
          { title: '申领次数', dataIndex: 'claimCount' },
          { title: '放行次数', dataIndex: 'releaseCount' },
        ]}
      />
      <Paragraph type="secondary" style={{ marginTop: 12 }}>
        密钥仅中心端一处保管，客户端无本地副本。
      </Paragraph>
    </Drawer>
  );
};

/** ② 密文资产：支持查看密文原始存储的前 256 字节十六进制预览 */
export const ObjectsDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DataSandboxRecord>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(responseData(await TrustChainApi.objects(), {}).items || []);
    } catch (error) {
      message.error(requestErrorMessage(error, '加载密文资产失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const viewRawStorage = async (objectId: string) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      setPreview(responseData(await TrustChainApi.objectPreview(objectId), {}));
    } catch (error) {
      message.error(requestErrorMessage(error, '查看原始存储失败'));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Drawer title="密文资产" width={860} open={open} onClose={onClose}>
      <Table
        rowKey="objectId"
        size="small"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: '对象',
            key: 'object',
            render: (_, row) => short(row.objectId, 18),
          },
          { title: '类型', dataIndex: 'kind', render: kindLabel },
          {
            title: '密文 SHA-256',
            dataIndex: 'ciphertextSha256',
            render: (v) => short(v, 12),
          },
          { title: '字节数', dataIndex: 'sizeBytes', render: formatBytes },
          {
            title: '贡献机构',
            dataIndex: 'contributors',
            render: (v: string[]) => (Array.isArray(v) ? v.join('、') : '-') || '-',
          },
          {
            title: '导出状态',
            dataIndex: 'exportState',
            render: (v: string) => (
              <Tag color={exportStateColor[v] || 'default'}>{exportStateLabel(v)}</Tag>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_, row) => (
              <Button type="link" onClick={() => viewRawStorage(row.objectId)}>
                查看原始存储
              </Button>
            ),
          },
        ]}
      />
      <Drawer
        title={`原始存储：${preview?.objectId || ''}`}
        width={560}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      >
        {previewLoading ? (
          <Empty description="加载中" />
        ) : (
          preview && (
            <>
              <Paragraph type="secondary">
                这是中心端实际持有的字节：仅展示密文前 {preview.previewBytes} 字节（共{' '}
                {formatBytes(preview.sizeBytes)}），不提供整体下载。
              </Paragraph>
              <pre className={styles.hexBlock}>
                {hexRows(preview.hex || '').join('\n')}
              </pre>
            </>
          )
        )}
      </Drawer>
    </Drawer>
  );
};

/** ③ 规则校验：授权规则表 + 最近放行/拒绝记录 */
export const PolicyDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [recent, setRecent] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = responseData(await TrustChainApi.policies(), {});
      setItems(data.items || []);
      setRecent(data.recent || []);
    } catch (error) {
      message.error(requestErrorMessage(error, '加载规则校验数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Drawer title="规则校验" width={900} open={open} onClose={onClose}>
      <Typography.Title level={5}>授权规则</Typography.Title>
      <Table
        rowKey={(row) => `${row.policyId}-${row.policyVersion}`}
        size="small"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: '可用列', dataIndex: 'columns', render: (v: string[]) => (v || []).join('、') || '全部列' },
          { title: '可跑算子', dataIndex: 'operators', render: (v: string[]) => (v || []).join('、') || '-' },
          { title: '报告类型', dataIndex: 'reportKinds', render: (v: string[]) => (v || []).join('、') || '-' },
          { title: '有效期', dataIndex: 'expiresAt', render: formatTime },
          {
            title: '状态',
            dataIndex: 'state',
            render: (v: string) => (
              <Tag color={v === 'ACTIVE' ? 'success' : 'default'}>{policyStateLabel(v)}</Tag>
            ),
          },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 16 }}>
        最近放行与拒绝
      </Typography.Title>
      <Table
        rowKey={(row) => `${row.at}-${row.actor}-${row.action}`}
        size="small"
        loading={loading}
        dataSource={recent}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: '时间', dataIndex: 'at', render: formatTime },
          { title: '动作', dataIndex: 'action' },
          {
            title: '结果',
            dataIndex: 'allowed',
            render: (v: boolean) => (
              <Tag color={v ? 'success' : 'error'}>{v ? '放行' : '拒绝'}</Tag>
            ),
          },
          {
            title: '明细',
            dataIndex: 'detail',
            ellipsis: true,
            render: (v: string) => v || '-',
          },
        ]}
      />
    </Drawer>
  );
};

/** ④ 环境认证：仿真模式下 SGX / TDX / CSV 逐项展示，切换真实 TEE 按钮置灰 */
export const AttestationDrawer = ({
  open,
  onClose,
  environment,
  runtimeImageId,
}: {
  open: boolean;
  onClose: () => void;
  environment?: TeeEnvironment;
  runtimeImageId?: string;
}) => (
  <Drawer title="环境认证" width={640} open={open} onClose={onClose}>
    {environment ? (
      <>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="SGX">
            <Tag color={environment.deviceChecks.sgx ? 'success' : 'default'}>
              {environment.deviceChecks.sgx ? '检测到' : '未检测到'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="TDX">
            <Tag color={environment.deviceChecks.tdx ? 'success' : 'default'}>
              {environment.deviceChecks.tdx ? '检测到' : '未检测到'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="CSV">
            <Tag color={environment.deviceChecks.csv ? 'success' : 'default'}>
              {environment.deviceChecks.csv ? '检测到' : '未检测到'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="快照时间">
            {formatTime(environment.checkedAt)}
          </Descriptions.Item>
          <Descriptions.Item label="运行镜像摘要">
            {runtimeImageId ? (
              <Text copyable={{ text: runtimeImageId }}>{short(runtimeImageId, 28)}</Text>
            ) : (
              <Text type="secondary">本端不运行 TEE 容器</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="阻塞项">
            {environment.blockers.length ? (
              environment.blockers.map((code) => (
                <Tag key={code} color="warning" style={{ marginBottom: 4 }}>
                  {blockerLabel[code] || code}
                </Tag>
              ))
            ) : (
              <Text type="secondary">无</Text>
            )}
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <Button disabled>切换到真实 TEE</Button>
          <Alert
            showIcon
            type="info"
            style={{ marginTop: 8 }}
            message="本机没有可信执行硬件，当前为仿真模式：加密、密钥托管、规则校验、投票导出均真实执行，缺少硬件背书。"
          />
        </div>
      </>
    ) : (
      <Empty />
    )}
  </Drawer>
);

/** ⑥ 出域管控：导出工单时间线，报告类结果明文出域、不走投票 */
export const ExportsDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(responseData(await TrustChainApi.exports(), {}).items || []);
    } catch (error) {
      message.error(requestErrorMessage(error, '加载出域工单失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Drawer title="出域管控" width={900} open={open} onClose={onClose}>
      <Table
        rowKey="exportId"
        size="small"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        expandable={{
          rowExpandable: (row) => (row.votes || []).length > 0,
          expandedRowRender: (row) => (
            <Table
              size="small"
              rowKey="ownerId"
              pagination={false}
              dataSource={row.votes || []}
              columns={[
                { title: '机构', dataIndex: 'ownerId' },
                { title: '决定', dataIndex: 'decision', render: voteLabel },
                { title: '时间', dataIndex: 'at', render: formatTime },
              ]}
            />
          ),
        }}
        columns={[
          {
            title: '结果',
            key: 'result',
            render: (_, row) =>
              row.kind === 'REPORT' ? (
                <span>
                  {short(row.resultId, 16)} <Tag color="blue">明文出域，不走投票</Tag>
                </span>
              ) : (
                short(row.resultId, 16)
              ),
          },
          { title: '类型', dataIndex: 'kind', render: kindLabel },
          { title: '发起机构', dataIndex: 'requesterOwnerId' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: string) => (
              <Tag color={exportStateColor[v] || 'default'}>{exportStateLabel(v)}</Tag>
            ),
          },
          { title: '通过时间', dataIndex: 'approvedAt', render: formatTime },
          { title: '创建时间', dataIndex: 'gmtCreate', render: formatTime },
        ]}
      />
    </Drawer>
  );
};
