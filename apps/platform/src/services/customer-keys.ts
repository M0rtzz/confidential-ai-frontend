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

/** 客户密钥台账条目；私钥不在其中，服务端只保存公钥、版本与状态。 */
export type CustomerKeyItem = {
  kid: string;
  subjectId: string;
  algorithm: string;
  keyVersion: number;
  fingerprint: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED' | 'DESTROYED' | string;
  createdAt: string;
  revokedAt?: string;
  supersededAt?: string;
  destroyedAt?: string;
  rotatedFromKid?: string;
};

/** 轮换后的历史资产归属；boundToPrevious 仍需旧密钥备份才能解开。 */
export type RotationStatus = {
  activeKid?: string;
  activeVersion: number;
  total: number;
  boundToActive: number;
  boundToPrevious: string[];
};

const chainBase = '/api/v1alpha1/data-sandbox/gpu-chain';
const keyBase = '/api/v1alpha1/crypto/customer-keys';

const headers = () => ({ 'User-Token': localStorage.getItem('User-Token') || '' });

const get = <T>(prefix: string, path: string, params?: Record<string, unknown>) =>
  request<ApiResponse<T>>(`${prefix}${path}`, {
    method: 'GET',
    params,
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));

const post = <T>(path: string, data: Record<string, unknown> = {}) =>
  request<ApiResponse<T>>(`${keyBase}${path}`, {
    method: 'POST',
    data,
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));

export const CustomerKeyApi = {
  /**
   * 审计明细走 gpu-chain 下的只读聚合接口。
   *
   * /api/v1alpha1/crypto/audit-events 只返回事件正文，不含 eventHash，
   * 无法核对哈希链连续性，因此不在这里使用。
   */
  auditEvents: (page = 1, size = 20) =>
    get<KeyPage<KeyAuditEvent>>(chainBase, '/audit-events', { page, size }),
  list: () => get<CustomerKeyItem[]>(keyBase, ''),
  rotationStatus: () => get<RotationStatus>(keyBase, '/rotation-status'),
  rotate: (data: Record<string, unknown>) =>
    post<Record<string, unknown>>('/rotate', data),
  revoke: (kid: string) =>
    post<Record<string, unknown>>(`/${encodeURIComponent(kid)}/revoke`),
  destroy: (kid: string, confirmKid: string) =>
    post<Record<string, unknown>>(`/${encodeURIComponent(kid)}/destroy`, {
      confirmKid,
    }),
};
