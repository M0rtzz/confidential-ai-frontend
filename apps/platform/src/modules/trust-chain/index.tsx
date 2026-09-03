import { Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { EndRoleBadge } from '@/components/end-role-badge';
import { getEndRole } from '@/components/platform-wrapper';
import { MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';

import { short, stateColor, stateLabel } from './common';
import {
  AttestationDrawer,
  ExportsDrawer,
  KeyLedgerDrawer,
  ObjectsDrawer,
  PolicyDrawer,
} from './drawers';
import styles from './index.less';
import { TasksDrawer } from './receipt-card';
import type { Segment, SegmentKey, TrustChainSummary } from './types';

const { Text } = Typography;

const circledNumber = ['①', '②', '③', '④', '⑤', '⑥'];

export const TrustChainComponent = () => {
  const endRole = getEndRole();
  const [summary, setSummary] = useState<TrustChainSummary>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDrawer, setOpenDrawer] = useState<SegmentKey | ''>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(
        responseData<TrustChainSummary>(
          await TrustChainApi.summary(),
          {} as TrustChainSummary,
        ),
      );
    } catch (requestError: unknown) {
      const text = requestErrorMessage(requestError, '加载可信执行链路概况失败');
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const segments: Segment[] = summary?.segments || [];
  const findSegment = (key: SegmentKey) => segments.find((item) => item.key === key);
  const metric = (key: SegmentKey, label: string) =>
    findSegment(key)?.metrics.find((item) => item.label === label)?.value;

  const teeExecSegment = findSegment('TEE_EXEC');
  const keyIssueCount = metric('KEY_ISSUE', '生效');

  return (
    <MvpPage
      title="可信执行链路"
      description="密钥签发 → 数据加密 → 规则校验 → 环境认证 → TEE 执行 → 出域管控，全链路只读展示"
      error={error}
      onRetry={refresh}
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      {/* 顶部状态条 */}
      <div className={styles.statusBar}>
        <Space size="large" wrap>
          {endRole && <EndRoleBadge endRole={endRole} />}
          {summary?.ownerName && (
            <span>
              本机构：<Text strong>{summary.ownerName}</Text>
            </span>
          )}
          {teeExecSegment && (
            <span>
              TEE 域在线：
              <Tag color={stateColor[teeExecSegment.state]}>
                {stateLabel[teeExecSegment.state]}
              </Tag>
            </span>
          )}
          <span>
            密钥服务：
            <Tag color={summary?.environment?.keyServiceReachable ? 'success' : 'default'}>
              {summary?.environment
                ? summary.environment.keyServiceReachable
                  ? '已连通'
                  : '未连通'
                : '-'}
            </Tag>
          </span>
          <span>
            环境：
            <Text strong>
              {summary?.environment?.runtimeMode === 'SIMULATION'
                ? '仿真，无硬件度量'
                : summary?.environment?.runtimeMode || '-'}
            </Text>
          </span>
          <span>
            生效密钥数：<Text strong>{keyIssueCount ?? '-'}</Text>
          </span>
          {/* 客户端不运行 TEE 容器，没有运行镜像，这一项就不占位 */}
          {summary?.runtimeImageId && (
            <span>
              运行镜像：
              <Text copyable={{ text: summary.runtimeImageId }}>
                {short(summary.runtimeImageId, 24)}
              </Text>
            </span>
          )}
        </Space>
      </div>

      {/* 六段链路图（客户端只返回四段，按数组位置编号） */}
      <div className={styles.chain}>
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            className={styles.segmentCard}
            onClick={() => setOpenDrawer(segment.key)}
          >
            <div className={styles.segmentHeader}>
              <span className={styles.segmentIndex}>{circledNumber[index] || index + 1}</span>
              <span
                className={styles.segmentDot}
                style={{ background: stateColor[segment.state] }}
              />
              <span className={styles.segmentLabel}>{segment.label}</span>
            </div>
            <div className={styles.segmentMetrics}>
              {segment.metrics.map((item) => (
                <div key={item.label} className={styles.segmentMetric}>
                  <Text type="secondary">{item.label}</Text>
                  <Text strong>{item.value}</Text>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <KeyLedgerDrawer
        open={openDrawer === 'KEY_ISSUE'}
        onClose={() => setOpenDrawer('')}
      />
      <ObjectsDrawer
        open={openDrawer === 'DATA_ENCRYPT'}
        onClose={() => setOpenDrawer('')}
      />
      <PolicyDrawer
        open={openDrawer === 'POLICY_CHECK'}
        onClose={() => setOpenDrawer('')}
      />
      <AttestationDrawer
        open={openDrawer === 'ATTESTATION'}
        onClose={() => setOpenDrawer('')}
        environment={summary?.environment}
        runtimeImageId={summary?.runtimeImageId}
      />
      <TasksDrawer open={openDrawer === 'TEE_EXEC'} onClose={() => setOpenDrawer('')} />
      <ExportsDrawer open={openDrawer === 'EGRESS'} onClose={() => setOpenDrawer('')} />
    </MvpPage>
  );
};
