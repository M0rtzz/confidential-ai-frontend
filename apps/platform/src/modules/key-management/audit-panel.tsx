import { Alert, Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatTime, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { short } from '@/modules/trust-chain/common';
import { CustomerKeyApi } from '@/services/customer-keys';
import type { KeyAuditEvent } from '@/services/customer-keys';

/** 与密钥有关的事件类型；其余事件（模型审核、推理等）不在本页展示。 */
const KEY_EVENT_PREFIXES = ['IDENTITY', 'KEY', 'GRANT', 'DEK', 'CUSTOMER_KEY'];

const eventLabel: Record<string, string> = {
  IDENTITY_REGISTERED: '会话身份注册',
  GRANT_SAVED: '一次性授权签署',
  GRANT_CONSUMED: '一次性授权消费',
  KEY_RELEASED: '任务级放钥',
};

export const KeyAuditPanel = () => {
  const [events, setEvents] = useState<KeyAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEvents((await CustomerKeyApi.auditEvents()) || []);
    } catch (failure) {
      setEvents([]);
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
    void load();
  }, [load]);

  const items = useMemo(
    () =>
      events.filter((item) =>
        KEY_EVENT_PREFIXES.some((prefix) => (item.eventType || '').startsWith(prefix)),
      ),
    [events],
  );

  // 审计链按追加写入，每条记录上一条的哈希；断链说明中间事件缺失或顺序被改。
  const broken = useMemo(() => {
    const ordered = [...items].reverse();
    return ordered.some(
      (item, index) =>
        index > 0 &&
        !!item.previousHash &&
        item.previousHash !== ordered[index - 1].eventHash,
    );
  }, [items]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <Typography.Text type="secondary">
          密钥相关事件 {items.length} 条，取自 {events.length} 条审计记录
        </Typography.Text>
        <span style={{ marginLeft: 'auto' }}>
          <RefreshButton loading={loading} onClick={load} />
        </span>
      </div>
      {error && (
        <Alert showIcon type="error" message={error} style={{ marginBottom: 12 }} />
      )}
      {!error && items.length > 0 && (
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
        pagination={{ pageSize: 20, showSizeChanger: false }}
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
