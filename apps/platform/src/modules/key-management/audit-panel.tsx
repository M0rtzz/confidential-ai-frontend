import { Alert, Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatTime, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { short } from '@/modules/trust-chain/common';
import { CustomerKeyApi } from '@/services/customer-keys';
import type { KeyAuditEvent } from '@/services/customer-keys';

/** 与密钥有关的事件类型；模型审核、推理与训练等事件不在本页展示。 */
const KEY_EVENT_TYPES = new Set([
  'CRYPTO_IDENTITY_REGISTERED',
  'A100_SIMULATED_ATTESTATION_ISSUED',
  'A100_SIMULATED_GRANT_STORED',
  'EXECUTION_GRANT_ISSUED',
  'EXECUTION_GRANT_CONSUMED',
  'CONFIDENTIAL_TRAINING_KEYS_RELEASED',
  'CUSTOMER_KEY_ROTATED',
  'CUSTOMER_KEY_REVOKED',
  'CUSTOMER_KEY_DESTROYED',
]);

const eventLabel: Record<string, string> = {
  CRYPTO_IDENTITY_REGISTERED: '会话身份注册',
  A100_SIMULATED_ATTESTATION_ISSUED: '证明签发',
  A100_SIMULATED_GRANT_STORED: '一次性授权签署',
  EXECUTION_GRANT_ISSUED: '执行授权签发',
  EXECUTION_GRANT_CONSUMED: '执行授权消费',
  CONFIDENTIAL_TRAINING_KEYS_RELEASED: '任务级放钥',
  CUSTOMER_KEY_ROTATED: '客户密钥轮换',
  CUSTOMER_KEY_REVOKED: '客户密钥回收',
  CUSTOMER_KEY_DESTROYED: '客户密钥销毁',
};

const PAGE_SIZE = 20;

export const KeyAuditPanel = () => {
  const [events, setEvents] = useState<KeyAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (target: number) => {
    setLoading(true);
    setError('');
    try {
      const view = await CustomerKeyApi.auditEvents(target, PAGE_SIZE);
      setEvents(view?.items || []);
      setTotal(view?.total || 0);
      setPage(view?.page || target);
    } catch (failure) {
      setEvents([]);
      setTotal(0);
      const text =
        failure instanceof Error && failure.message
          ? failure.message
          : '加载审计链失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const items = useMemo(
    () => events.filter((item) => KEY_EVENT_TYPES.has(item.eventType)),
    [events],
  );

  // 哈希链覆盖全部事件而非仅密钥事件，因此连续性在过滤前的整页上判定。
  const broken = useMemo(() => {
    const ordered = [...events].reverse();
    return ordered.some(
      (item, index) =>
        index > 0 &&
        !!item.previousHash &&
        item.previousHash !== ordered[index - 1].eventHash,
    );
  }, [events]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <Typography.Text type="secondary">
          本页密钥相关事件 {items.length} 条，审计链共 {total} 条
        </Typography.Text>
        <span style={{ marginLeft: 'auto' }}>
          <RefreshButton loading={loading} onClick={() => void load(page)} />
        </span>
      </div>
      {error && (
        <Alert showIcon type="error" message={error} style={{ marginBottom: 12 }} />
      )}
      {!error && events.length > 0 && (
        <Alert
          showIcon
          type={broken ? 'error' : 'success'}
          message={broken ? '哈希链不连续' : '哈希链连续'}
          description={
            broken
              ? '存在前后哈希对不上的记录，可能有事件缺失或顺序被改动，需要排查。'
              : '相邻记录的前后哈希逐条对应，本次返回范围内未发现顺序篡改或事件缺失。'
          }
          style={{ marginBottom: 12 }}
        />
      )}
      <Table
        rowKey={(row) => row.eventHash || `${row.eventType}-${row.createdAt}`}
        size="small"
        scroll={{ x: 'max-content' }}
        loading={loading}
        dataSource={items}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (next) => void load(next),
        }}
        columns={[
          { title: '时间', dataIndex: 'createdAt', render: formatTime },
          {
            title: '事件',
            dataIndex: 'eventType',
            render: (value: string) => eventLabel[value] || value,
          },
          {
            title: '对象',
            dataIndex: 'subjectId',
            render: (value) => (
              <Typography.Text copyable={{ text: String(value ?? '') }}>
                {short(value, 24)}
              </Typography.Text>
            ),
          },
          {
            title: '安全档位',
            dataIndex: 'securityProfile',
            render: (value: string, row) => (
              <Tag color={row.simulated ? 'warning' : 'success'}>
                {value}
                {row.simulated ? ' · 仿真' : ''}
              </Tag>
            ),
          },
          {
            title: '本条哈希',
            dataIndex: 'eventHash',
            render: (value) => (
              <Typography.Text code>{short(value, 16)}</Typography.Text>
            ),
          },
          {
            title: '上条哈希',
            dataIndex: 'previousHash',
            render: (value) => (
              <Typography.Text code>{short(value, 16)}</Typography.Text>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        审计事件不记录私钥、原始 DEK、API Key
        或明文内容。连续性判定只覆盖本次返回的记录范围。
      </Typography.Paragraph>
    </>
  );
};
