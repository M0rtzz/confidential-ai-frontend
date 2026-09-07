import request from 'umi-request';

import { responseData } from './data-sandbox';

type ApiResponse<T> = {
  status?: { code?: number; msg?: string };
  data?: T;
};

/** 密钥相关的审计事件；哈希链用于核对顺序篡改与中间事件缺失。 */
export type KeyAuditEvent = {
  eventId: string;
  eventType: string;
  subjectId: string;
  securityProfile: string;
  simulated: number | boolean;
  createdAt: string;
  eventHash?: string;
  previousHash?: string;
};

export type KeyPage<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
};

const chainBase = '/api/v1alpha1/data-sandbox/gpu-chain';

const get = <T>(path: string, params?: Record<string, unknown>) =>
  request<ApiResponse<T>>(`${chainBase}${path}`, {
    method: 'GET',
    params,
    credentials: 'include',
    headers: { 'User-Token': localStorage.getItem('User-Token') || '' },
  }).then((response) => responseData(response, undefined as T));

export const CustomerKeyApi = {
  /**
   * 审计明细走 gpu-chain 下的只读聚合接口。
   *
   * /api/v1alpha1/crypto/audit-events 只返回事件正文，不含 eventHash，
   * 无法核对哈希链连续性，因此不在这里使用。
   */
  auditEvents: (page = 1, size = 20) =>
    get<KeyPage<KeyAuditEvent>>('/audit-events', { page, size }),
};
