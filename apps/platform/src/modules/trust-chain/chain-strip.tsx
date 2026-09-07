import type { ReactNode } from 'react';

import styles from './index.less';

type StripSegment = { key: string; label: string };

/** 链路段卡片条；CPU 与 GPU 两个视图共用，段号按返回数组位置生成。 */
export const ChainStrip = <T extends StripSegment>({
  segments,
  selected,
  onSelect,
  renderMetrics,
  ariaLabel,
}: {
  segments: T[];
  selected: string;
  onSelect: (key: string) => void;
  renderMetrics: (segment: T) => ReactNode;
  ariaLabel: string;
}) => (
  <div className={styles.chain} role="tablist" aria-label={ariaLabel}>
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
        onClick={() => onSelect(segment.key)}
      >
        <span className={styles.segmentHeader}>
          <span className={styles.segmentIndex}>{index + 1}</span>
          <span className={styles.segmentLabel}>{segment.label}</span>
        </span>
        <span className={styles.segmentMetrics}>{renderMetrics(segment)}</span>
      </button>
    ))}
  </div>
);
