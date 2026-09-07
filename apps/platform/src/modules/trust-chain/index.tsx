import { Segmented, Tag, Tooltip } from 'antd';
import { parse, stringify } from 'query-string';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { history, useLocation } from 'umi';

import { EndRoleBadge } from '@/components/end-role-badge';
import { getEndRole } from '@/components/platform-wrapper';
import { MvpPage, RefreshButton, formatTime } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';

import { ChainStrip } from './chain-strip';
import {
  AttestationDrawer,
  ExportsDrawer,
  KeyLedgerDrawer,
  ObjectsDrawer,
  PolicyDrawer,
} from './drawers';
import { GpuTrustChainView } from './gpu-view';
import styles from './index.less';
import { TasksDrawer } from './receipt-card';
import type { SegmentKey, TrustChainSummary } from './types';

type ChainView = 'CPU' | 'GPU';

/** 视图选择写进查询参数，便于分享与演示时直接定位到某一侧。 */
const VIEW_PARAM = 'chain';

const CpuTrustChainView = ({
  onLoadingChange,
  onError,
  refreshToken,
}: {
  onLoadingChange: (loading: boolean) => void;
  onError: (error: string) => void;
  refreshToken: number;
}) => {
  const endRole = getEndRole();
  const [summary, setSummary] = useState<TrustChainSummary>();
  const [selected, setSelected] = useState<SegmentKey>('KEY_ISSUE');
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    onLoadingChange(true);
    onError('');
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
      onError(requestErrorMessage(failure, '加载可信执行链路概况失败'));
    } finally {
      onLoadingChange(false);
    }
  }, [onError, onLoadingChange]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  const environment = summary?.environment;
  const segments = summary?.segments || [];
  const activeCount = segments
    .find((item) => item.key === 'KEY_ISSUE')
    ?.metrics.find((item) => item.label === '生效')?.value;
  const detailProps = { open: true, inline: true, onClose: () => undefined };

  return (
    <>
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
      <ChainStrip
        ariaLabel="可信执行阶段"
        segments={segments}
        selected={selected}
        onSelect={(key) => setSelected(key as SegmentKey)}
        renderMetrics={(segment) =>
          segment.key === 'ATTESTATION' ? (
            <span className={styles.segmentNote}>执行环境身份与完整性校验</span>
          ) : (
            segment.metrics.map((metric) => (
              <span key={metric.label}>
                <span>
                  {metric.label === '总数' || metric.label === '总任务'
                    ? '记录数'
                    : metric.label}
                </span>
                <strong>{metric.value}</strong>
              </span>
            ))
          )
        }
      />
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
    </>
  );
};

export const TrustChainComponent = () => {
  const endRole = getEndRole();
  const { search } = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  // GPU 密态执行由中心端承担，客户端调不到中心端的数据面，切换项不可用。
  const gpuAvailable = endRole === 'CENTER';
  const view: ChainView = useMemo(() => {
    const value = parse(search)[VIEW_PARAM];
    return value === 'GPU' && gpuAvailable ? 'GPU' : 'CPU';
  }, [search, gpuAvailable]);

  const switchView = (next: ChainView) => {
    if (next === view) return;
    setError('');
    const params = { ...parse(search), [VIEW_PARAM]: next };
    history.replace(`/edge?${stringify(params)}`);
  };

  const options = [
    { label: 'CPU 可信执行', value: 'CPU' },
    {
      label: gpuAvailable ? (
        'GPU 密态执行'
      ) : (
        <Tooltip title="GPU 密态执行由中心端承担，客户端不展示">
          <span>GPU 密态执行</span>
        </Tooltip>
      ),
      value: 'GPU',
      disabled: !gpuAvailable,
    },
  ];

  return (
    <MvpPage
      title="可信执行链路"
      description={
        view === 'CPU'
          ? '密钥签发、数据加密、规则校验、环境认证、TEE 执行与出域管控'
          : '会话身份、权重密文化、可信域校验、一次性证明、授权放钥与输出出域'
      }
      error={error}
      onRetry={() => setRefreshToken((value) => value + 1)}
      extra={
        <>
          <Segmented
            value={view}
            options={options}
            onChange={(value) => switchView(value as ChainView)}
          />
          <RefreshButton
            loading={loading}
            onClick={() => setRefreshToken((value) => value + 1)}
          />
        </>
      }
    >
      {view === 'CPU' ? (
        <CpuTrustChainView
          onLoadingChange={setLoading}
          onError={setError}
          refreshToken={refreshToken}
        />
      ) : (
        <GpuTrustChainView
          onLoadingChange={setLoading}
          onError={setError}
          refreshToken={refreshToken}
        />
      )}
    </MvpPage>
  );
};
