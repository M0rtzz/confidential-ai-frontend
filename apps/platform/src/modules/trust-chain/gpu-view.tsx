import { Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { GpuChainApi, responseData } from '@/services/data-sandbox';

import { ChainStrip } from './chain-strip';
import {
  GpuAssetsPanel,
  GpuAttestationsPanel,
  GpuDomainsPanel,
  GpuExecutionsPanel,
  GpuGrantsPanel,
  GpuIdentitiesPanel,
} from './gpu-drawers';
import type { GpuChainSummary, GpuSegmentKey } from './gpu-types';
import styles from './index.less';

/** 明细面板显示在页内，不弹抽屉；与 CPU 视图保持一致。 */
const inlineProps = { open: true, inline: true, onClose: () => undefined };

export const GpuTrustChainView = ({
  onLoadingChange,
  onError,
  refreshToken,
}: {
  onLoadingChange: (loading: boolean) => void;
  onError: (error: string) => void;
  refreshToken: number;
}) => {
  const [summary, setSummary] = useState<GpuChainSummary>();
  const [selected, setSelected] = useState<GpuSegmentKey>('IDENTITY');
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    onLoadingChange(true);
    onError('');
    try {
      const next = responseData(
        await GpuChainApi.summary<GpuChainSummary>(),
        {} as GpuChainSummary,
      );
      setSummary(next);
      setSelected((previous) =>
        next.segments?.some((item) => item.key === previous)
          ? previous
          : next.segments?.[0]?.key || 'IDENTITY',
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setSummary(undefined);
      onError(requestErrorMessage(failure, '加载 GPU 密态执行链路概况失败'));
    } finally {
      onLoadingChange(false);
    }
  }, [onError, onLoadingChange]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  const runtime = summary?.runtime;
  const segments = summary?.segments || [];
  const usableDomains = (summary?.domains || []).filter(
    (item) => item.status === 'active' && item.trustStatus === 'trusted',
  );

  return (
    <>
      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>本机构</span>
          {summary?.ownerId || '—'}
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>可信域</span>
          <Tag color={usableDomains.length ? 'success' : 'default'}>
            {summary
              ? `${usableDomains.length}/${summary.domains?.length || 0} 可用`
              : '—'}
          </Tag>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>安全档位</span>
          <Tag color={runtime?.simulated ? 'warning' : 'default'}>
            {runtime
              ? `${runtime.securityProfile}${runtime.simulated ? ' · 仿真' : ''}`
              : '—'}
          </Tag>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>证据类型</span>
          {runtime?.evidenceType || '—'}
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>硬件型号</span>
          {runtime?.hardwareModel || '—'}
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>契约</span>
          {runtime?.contractVersion || '—'}
        </div>
      </div>
      <div className={styles.chainHint}>
        本机构可见范围 · 分段计数由数据库统计，明细按页取回
      </div>
      <ChainStrip
        ariaLabel="GPU 密态执行阶段"
        segments={segments}
        selected={selected}
        onSelect={(key) => setSelected(key as GpuSegmentKey)}
        renderMetrics={(segment) =>
          segment.key === 'ATTESTATION'
            ? '实验室模拟证据 · 无 GPU 硬件机密隔离'
            : segment.metrics.map((metric) => (
                <span key={metric.label}>
                  {metric.label} <strong>{metric.value}</strong>
                </span>
              ))
        }
      />
      {summary && (
        <div
          key={`${selected}-${revision}`}
          id="trust-stage-detail"
          role="tabpanel"
          aria-labelledby={`trust-stage-${selected}`}
        >
          {selected === 'IDENTITY' && <GpuIdentitiesPanel {...inlineProps} />}
          {selected === 'ASSET_ENCRYPT' && <GpuAssetsPanel {...inlineProps} />}
          {selected === 'DOMAIN_VERIFY' && (
            <GpuDomainsPanel {...inlineProps} domains={summary.domains} />
          )}
          {selected === 'ATTESTATION' && <GpuAttestationsPanel {...inlineProps} />}
          {selected === 'GRANT_RELEASE' && <GpuGrantsPanel {...inlineProps} />}
          {selected === 'EXECUTION_EGRESS' && <GpuExecutionsPanel {...inlineProps} />}
        </div>
      )}
    </>
  );
};
