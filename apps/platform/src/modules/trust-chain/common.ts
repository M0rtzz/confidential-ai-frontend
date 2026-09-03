import type { SegmentState } from './types';

/** 段状态 → 状态点颜色 / 文案，OK 绿 / WARN 黄 / EMPTY 灰 */
export const stateColor: Record<SegmentState, string> = {
  OK: '#52c41a',
  WARN: '#faad14',
  EMPTY: '#bfbfbf',
};

export const stateLabel: Record<SegmentState, string> = {
  OK: '正常',
  WARN: '告警',
  EMPTY: '空',
};

/** TeeEnvironmentService 给出的阻塞项代码 → 中文说明 */
export const blockerLabel: Record<string, string> = {
  HARDWARE_CHECK_STALE: '硬件检测快照已过期',
  HARDWARE_CHECK_FAILED: '硬件检测未通过',
  HARDWARE_CHECK_UNAVAILABLE: '硬件检测快照不可用',
  KEY_SERVICE_UNAVAILABLE: '密钥服务探测不可达',
  NO_VERIFIED_HARDWARE_RUNTIME: '未取得可信硬件背书',
};

export const short = (value?: unknown, size = 16) => {
  const text = String(value ?? '');
  return text.length > size ? `${text.slice(0, size)}…` : text || '-';
};

export const formatBytes = (value?: number) => {
  if (value === undefined || value === null) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

/** 将十六进制字符串按每行 16 字节（32 个十六进制字符）分组，便于等宽展示 */
export const hexRows = (hex: string) => {
  const clean = hex.replace(/\s+/g, '');
  const rows: string[] = [];
  for (let i = 0; i < clean.length; i += 32) {
    const chunk = clean.slice(i, i + 32);
    const bytes = chunk.match(/.{1,2}/g) || [];
    rows.push(bytes.join(' '));
  }
  return rows;
};
