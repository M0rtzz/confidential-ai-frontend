import { Button, Card, Col, Row, Space, Tag, Typography, message } from 'antd';
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

const { Text, Paragraph } = Typography;

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

  const jumpTo = (key: SegmentKey) => {
    if (!findSegment(key)) return;
    setOpenDrawer(key);
  };

  /** 段的展示名带上它在本端链路里的实际序号，客户端缺段时不会指错 */
  const segmentName = (key: SegmentKey) => {
    const index = segments.findIndex((item) => item.key === key);
    return index < 0 ? '' : `${circledNumber[index] || index + 1} ${segments[index].label}`;
  };

  const teeExecSegment = findSegment('TEE_EXEC');
  const demoSpan = findSegment('POLICY_CHECK') ? 6 : 8;
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
            onClick={() => jumpTo(segment.key)}
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

      {/* 演示台 */}
      <div className={styles.demoDeck}>
        <Row gutter={16}>
          <Col xs={24} md={12} xl={demoSpan}>
            <Card size="small" title="演示 1：中心端看不到明文" className={styles.demoCard}>
              <Paragraph type="secondary">
                中心端持有的结果对象始终是密文；{segmentName('DATA_ENCRYPT')}
                的「查看原始存储」只展示密文字节，不解密。
              </Paragraph>
              <Button type="link" onClick={() => jumpTo('DATA_ENCRYPT')}>
                查看密文资产
              </Button>
            </Card>
          </Col>
          {findSegment('POLICY_CHECK') && (
            <Col xs={24} md={12} xl={demoSpan}>
              <Card size="small" title="演示 2：越权当场被拒" className={styles.demoCard}>
                <Paragraph type="secondary">
                  超出授权规则（列 / 算子 / 报告类型 / 有效期）的请求会被当场拒绝，
                  可在 {segmentName('POLICY_CHECK')} 中查看授权规则与最近拒绝记录。
                </Paragraph>
                <Button type="link" onClick={() => jumpTo('POLICY_CHECK')}>
                  查看规则与拒绝记录
                </Button>
              </Card>
            </Col>
          )}
          <Col xs={24} md={12} xl={demoSpan}>
            <Card size="small" title="演示 3：容器出不去网" className={styles.demoCard}>
              <Paragraph type="secondary">
                隔离对照容器由部署脚本的 verify-isolation 拉起验证，结论不在本页代跑；
                {segmentName('ATTESTATION')} 展示的是本机的环境检测结论——当前为仿真模式，
                加密、密钥托管、规则校验与投票导出均真实执行，仅缺少硬件背书。
              </Paragraph>
              <Button type="link" onClick={() => jumpTo('ATTESTATION')}>
                查看环境认证结论
              </Button>
            </Card>
          </Col>
          <Col xs={24} md={12} xl={demoSpan}>
            <Card size="small" title="演示 4：一键收回数据" className={styles.demoCard}>
              <Paragraph type="secondary">
                在 {segmentName('KEY_ISSUE')} 中逐把吊销本机构签发的数据密钥，
                对应数据随即算不动。
              </Paragraph>
              <Button type="link" onClick={() => jumpTo('KEY_ISSUE')}>
                前往密钥台账
              </Button>
            </Card>
          </Col>
        </Row>
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
