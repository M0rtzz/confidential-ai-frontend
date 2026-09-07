import { Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatTime, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { keyStateLabel, short } from '@/modules/trust-chain/common';
import { responseData, TrustChainApi } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

const stateColor: Record<string, string> = { ACTIVE: 'success', REVOKED: 'default' };

/**
 * CPU 侧密钥台账。
 *
 * 数据取自既有的可信执行链路聚合接口，本页只做呈现，不新增契约接口，
 * 也不提供签发、申领与吊销的入口——那三项由数据方在各自流程中触发。
 */
export const KeyLedgerPanel = () => {
  const [keys, setKeys] = useState<DataSandboxRecord[]>([]);
  const [policies, setPolicies] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyView, policyView] = await Promise.all([
        TrustChainApi.keys(),
        TrustChainApi.policies(),
      ]);
      setKeys(responseData(keyView, {}).items || []);
      setPolicies(responseData(policyView, {}).items || []);
    } catch (error) {
      message.error(requestErrorMessage(error, '加载密钥台账失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 规则依附于资产，密钥按资产版本签发，因此按 assetId 统计生效规则数。
  const policyCount = useMemo(() => {
    const counts = new Map<string, number>();
    policies
      .filter((item) => item.state === 'ACTIVE')
      .forEach((item) => {
        const assetId = String(item.assetId ?? '');
        counts.set(assetId, (counts.get(assetId) || 0) + 1);
      });
    return counts;
  }, [policies]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <Typography.Text type="secondary">
          共 {keys.length} 条记录，生效{' '}
          {keys.filter((item) => item.state === 'ACTIVE').length} 条
        </Typography.Text>
        <span style={{ marginLeft: 'auto' }}>
          <RefreshButton loading={loading} onClick={load} />
        </span>
      </div>
      <Table
        rowKey={(row) => `${row.keyId}-${row.keyVersion}`}
        size="small"
        scroll={{ x: 'max-content' }}
        loading={loading}
        dataSource={keys}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          {
            title: '密钥',
            key: 'key',
            render: (_, row) => (
              <Typography.Text copyable={{ text: String(row.keyId ?? '') }}>
                {short(row.keyId, 18)} · v{String(row.keyVersion ?? '')}
              </Typography.Text>
            ),
          },
          {
            title: '绑定资产',
            dataIndex: 'assetId',
            render: (value) => (
              <Typography.Text copyable={{ text: String(value ?? '') }}>
                {short(value, 18)}
              </Typography.Text>
            ),
          },
          { title: '所属机构', dataIndex: 'ownerId' },
          {
            title: '状态',
            dataIndex: 'state',
            render: (value: string) => (
              <Tag color={stateColor[value] || 'default'}>{keyStateLabel(value)}</Tag>
            ),
          },
          { title: '签发时间', dataIndex: 'issuedAt', render: formatTime },
          { title: '申领次数', dataIndex: 'claimCount' },
          { title: '放行次数', dataIndex: 'releaseCount' },
          {
            title: '生效规则',
            key: 'policies',
            render: (_, row) => policyCount.get(String(row.assetId ?? '')) || 0,
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        密钥台账只在中心端一处保存。申领次数对应数据方加密，放行次数对应运行时取钥；
        授权规则依附于密钥，密钥吊销后规则自然失效。汇总数字取自接口返回范围，非全量统计。
      </Typography.Paragraph>
    </>
  );
};
