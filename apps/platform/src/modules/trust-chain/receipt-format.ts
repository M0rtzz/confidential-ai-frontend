import type { DataSandboxRecord } from '@/services/data-sandbox';

/** 解码仅用于展示；验证结论取自接口，并检查任务绑定。 */
export const receiptPayload = (
  receipt: DataSandboxRecord,
  taskId: string,
): DataSandboxRecord => {
  if (receipt.signatureVerified !== true || receipt.taskId !== taskId)
    throw new Error('回执未通过验证或任务绑定不符');
  const parts = String(receipt.receiptJws || '').split('.');
  if (parts.length !== 3 || parts.some((part) => !part))
    throw new Error('回执格式无效');
  const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(
    atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')),
    (char) => char.charCodeAt(0),
  );
  const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.taskId !== taskId
  )
    throw new Error('回执内容与任务不符');
  return payload;
};
export const receiptDuration = (startedAt: unknown, finishedAt: unknown): string => {
  if (typeof startedAt !== 'string' || typeof finishedAt !== 'string') return '未提供';
  const duration = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0
    ? `${(duration / 1000).toFixed(1)} 秒`
    : '未提供';
};
export const taskStatusLabel = (status: string) =>
  ({
    SUCCEEDED: '成功',
    FAILED: '失败',
    RUNNING: '运行中',
    CANCELLED: '已取消',
    PENDING: '等待执行',
    ACCEPTED: '已接收',
  }[status] ||
  status ||
  '未提供');
