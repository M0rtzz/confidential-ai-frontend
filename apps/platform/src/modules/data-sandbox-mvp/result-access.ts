import { useCallback, useEffect, useState } from 'react';
import { history } from 'umi';

import type { DataSandboxRecord } from '@/services/data-sandbox';

export const accessTime = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return NaN;
  return Date.parse(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text.replace(' ', 'T')}+08:00`,
  );
};

/** 使用服务端时钟校正页面计时，页面停留期间也会重新计算到期状态。 */
export const useAccessClock = () => {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const syncClock = useCallback((value: unknown) => {
    const time = accessTime(value);
    if (Number.isFinite(time)) {
      setOffset(time - Date.now());
      setNow(time);
    }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [offset]);
  return { now, syncClock };
};

export const expired = (value: unknown, now: number) => {
  const time = accessTime(value);
  return Number.isFinite(time) && time <= now;
};
export const usageDeadline = (row: DataSandboxRecord) =>
  row.useUntil || row.use_until || row.access_end;
export const viewDeadline = (row: DataSandboxRecord) =>
  row.viewUntil || row.view_until || row.access_end;
export const resultManagement = (row: DataSandboxRecord = {}) => {
  const query = new URLSearchParams(window.location.search);
  query.set('tab', 'tee-export-approval');
  query.delete('workspace');
  const resultId = row.resultId || row.result_id || row.tableName || row.table_name;
  query.delete('resultId');
  if (resultId) query.set('resultId', resultId);
  if (row.sandboxId) query.set('sandboxId', row.sandboxId);
  if (row.projectId) query.set('projectId', row.projectId);
  history.push(`/edge?${query.toString()}`);
};
