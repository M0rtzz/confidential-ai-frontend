import { Tag, Tooltip, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { EndRoleBadge } from '@/components/end-role-badge';
import { getEndRole } from '@/components/platform-wrapper';
import { MvpPage, RefreshButton, formatTime } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';

import { blockerLabel, short, stateColor, stateLabel } from './common';
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
      {/* 顶部状态条：本端身份与底座状态一行读完 */}
      <div className={styles.statusBar}>
        {endRole && (
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>本端</span>
            <span className={styles.statusValue}>
              <EndRoleBadge endRole={endRole} />
            </span>
          </div>
        )}
        {summary?.ownerName && (
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>本机构</span>
            <span className={styles.statusValue}>{summary.ownerName}</span>
          </div>
        )}
        {teeExecSegment && (
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>TEE 域</span>
            <span className={styles.statusValue}>
              <Tag color={stateColor[teeExecSegment.state]} style={{ marginInlineEnd: 0 }}>
                {stateLabel[teeExecSegment.state]}
              </Tag>
            </span>
          </div>
        )}
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>密钥服务</span>
          <span className={styles.statusValue}>
            <Tag
              color={summary?.environment?.keyServiceReachable ? 'success' : 'default'}
              style={{ marginInlineEnd: 0 }}
            >
              {summary?.environment
                ? summary.environment.keyServiceReachable
                  ? '已连通'
                  : '未连通'
                : '—'}
            </Tag>
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>执行环境</span>
          <span className={styles.statusValue}>
            {summary?.environment?.runtimeMode === 'SIMULATION'
              ? '仿真 · 无硬件度量'
              : summary?.environment?.runtimeMode || '—'}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>生效密钥</span>
          <span className={styles.statusValue}>{keyIssueCount ?? '—'}</span>
        </div>
        {/* 客户端不运行 TEE 容器，没有运行镜像，这一项就不占位 */}
        {summary?.runtimeImageId && (
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>运行镜像</span>
            <span className={styles.statusValue}>
              <Text copyable={{ text: summary.runtimeImageId }} style={{ fontWeight: 600 }}>
                {short(summary.runtimeImageId, 20)}
              </Text>
            </span>
          </div>
        )}
      </div>

      {/* 链路：中心端六段、客户端四段，段号按实际返回顺序生成 */}
      <div className={styles.chainHint}>点击任一段查看该段的明细台账</div>
      <div className={styles.chain}>
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            className={styles.segmentCard}
            role="button"
            tabIndex={0}
            onClick={() => setOpenDrawer(segment.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') setOpenDrawer(segment.key);
            }}
          >
            <div className={styles.segmentHeader}>
              <span className={styles.segmentIndex}>{index + 1}</span>
              <span className={styles.segmentLabel}>{segment.label}</span>
              <Tooltip title={stateLabel[segment.state]}>
                <span
                  className={styles.segmentDot}
                  style={{ background: stateColor[segment.state] }}
                />
              </Tooltip>
            </div>
            <div className={styles.segmentMetrics}>
              {segment.metrics.map((item) => (
                <div key={item.label} className={styles.segmentMetric}>
                  <span className={styles.metricValue}>{item.value}</span>
                  <span className={styles.metricLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 链路下方的常驻信息面板：只给一个可信度结论，细节归到结论的原因里 */}
      {summary?.environment && (
        <div className={styles.infoPanel}>
          <div className={styles.infoTitle}>环境与底座</div>
          <div className={styles.verdict}>
            <span
              className={styles.verdictDot}
              style={{
                background: summary.environment.realModeReady ? '#52c41a' : '#faad14',
              }}
            />
            <div className={styles.verdictBody}>
              <div className={styles.verdictText}>
                {summary.environment.realModeReady ? '真实模式就绪' : '真实模式未就绪'}
              </div>
              <div className={styles.verdictReason}>
                {summary.environment.realModeReady
                  ? '硬件检测通过并已取得可信硬件背书，可切换到真实执行模式'
                  : summary.environment.blockers?.length
                    ? summary.environment.blockers
                        .map((code) => blockerLabel[code] || code)
                        .join('；')
                    : '未取得可信硬件背书'}
              </div>
            </div>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>本机构</span>
              <span className={styles.infoValue}>
                {summary.ownerName || '-'}
                {summary.ownerId && (
                  <Text type="secondary" style={{ fontWeight: 400 }}>
                    {summary.ownerId}
                  </Text>
                )}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>最近检测</span>
              <span className={styles.infoValue}>
                {formatTime(summary.environment.checkedAt)}
              </span>
            </div>
          </div>
        </div>
      )}

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
