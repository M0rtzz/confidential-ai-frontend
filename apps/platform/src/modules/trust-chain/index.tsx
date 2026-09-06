import { Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { EndRoleBadge } from '@/components/end-role-badge';
import { getEndRole } from '@/components/platform-wrapper';
import { MvpPage, RefreshButton, formatTime } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';

import {
  AttestationDrawer,
  ExportsDrawer,
  KeyLedgerDrawer,
  ObjectsDrawer,
  PolicyDrawer,
} from './drawers';
import styles from './index.less';
import { TasksDrawer } from './receipt-card';
import type { SegmentKey, TrustChainSummary } from './types';

export const TrustChainComponent = () => {
  const endRole = getEndRole();
  const [summary, setSummary] = useState<TrustChainSummary>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SegmentKey>('KEY_ISSUE');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = responseData<TrustChainSummary>(
        await TrustChainApi.summary(),
        {} as TrustChainSummary,
      );
      setSummary(next);
      setSelected((previous) =>
        next.segments?.some((item) => item.key === previous)
          ? previous
          : next.segments?.[0]?.key || 'KEY_ISSUE',
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setSummary(undefined);
      setError(requestErrorMessage(failure, '加载可信执行链路概况失败'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const environment = summary?.environment;
  const segments = summary?.segments || [];
  const activeCount = segments
    .find((item) => item.key === 'KEY_ISSUE')
    ?.metrics.find((item) => item.label === '生效')?.value;
  const detailProps = { open: true, inline: true, onClose: () => undefined };

  return (
    <MvpPage
      title="可信执行链路"
      description="密钥签发、数据加密、规则校验、环境认证、TEE 执行与出域管控"
      error={error}
      onRetry={refresh}
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>本端</span>
          {endRole && <EndRoleBadge endRole={endRole} />}
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>本机构</span>
          {summary?.ownerName || '—'}
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>密钥服务</span>
          <Tag color={environment?.keyServiceReachable ? 'success' : 'default'}>
            {environment
              ? environment.keyServiceReachable
                ? '已连通'
                : '未连通'
              : '—'}
          </Tag>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>执行环境</span>
          <Tag
            color={environment?.runtimeMode === 'SIMULATION' ? 'warning' : 'default'}
          >
            {environment?.runtimeMode === 'SIMULATION'
              ? '仿真 · 无硬件可信证明'
              : environment?.runtimeMode || '—'}
          </Tag>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>台账生效密钥</span>
          {activeCount ?? '—'}
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>最近检测</span>
          {formatTime(environment?.checkedAt)}
        </div>
      </div>
      <div className={styles.chainHint}>
        {endRole === 'CENTER' ? '全部机构' : '本机构可见范围'} ·
        当前接口返回记录，非全量统计
      </div>
      <div className={styles.chain} role="tablist" aria-label="可信执行阶段">
        {segments.map((segment, index) => (
          <button
            type="button"
            role="tab"
            id={`trust-stage-${segment.key}`}
            aria-selected={selected === segment.key}
            aria-controls="trust-stage-detail"
            key={segment.key}
            className={`${styles.segmentCard} ${
              selected === segment.key ? styles.segmentActive : ''
            }`}
            onClick={() => setSelected(segment.key)}
          >
            <span className={styles.segmentHeader}>
              <span className={styles.segmentIndex}>{index + 1}</span>
              <span className={styles.segmentLabel}>{segment.label}</span>
            </span>
            <span className={styles.segmentMetrics}>
              {segment.key === 'ATTESTATION'
                ? environment?.runtimeMode === 'SIMULATION'
                  ? '仿真 · 无硬件证明'
                  : environment?.attestationVerified
                  ? '硬件证明已验证'
                  : '硬件证明未验证'
                : segment.metrics.map((metric) => (
                    <span key={metric.label}>
                      {metric.label === '总数' || metric.label === '总任务'
                        ? '记录数'
                        : metric.label}{' '}
                      <strong>{metric.value}</strong>
                    </span>
                  ))}
            </span>
          </button>
        ))}
      </div>
      {summary && (
        <div
          key={`${selected}-${revision}`}
          id="trust-stage-detail"
          role="tabpanel"
          aria-labelledby={`trust-stage-${selected}`}
        >
          {selected === 'KEY_ISSUE' && <KeyLedgerDrawer {...detailProps} />}
          {selected === 'DATA_ENCRYPT' && <ObjectsDrawer {...detailProps} />}
          {selected === 'POLICY_CHECK' && <PolicyDrawer {...detailProps} />}
          {selected === 'ATTESTATION' && (
            <AttestationDrawer
              {...detailProps}
              environment={environment}
              runtimeImageId={summary.runtimeImageId}
            />
          )}
          {selected === 'TEE_EXEC' && <TasksDrawer {...detailProps} />}
          {selected === 'EGRESS' && <ExportsDrawer {...detailProps} />}
        </div>
      )}
    </MvpPage>
  );
};
