import request from 'umi-request';

import { responseData } from './data-sandbox';

type ApiResponse<T> = {
  status?: { code?: number; msg?: string };
  data?: T;
};

/** 客户密钥台账条目；私钥不在其中，服务端只保存公钥、版本与状态。 */
export type CustomerKeyItem = {
  kid: string;
  subjectId: string;
  algorithm: string;
  keyVersion: number;
  fingerprint: string;
  status: string;
  createdAt: string;
  revokedAt?: string;
  supersededAt?: string;
  destroyedAt?: string;
  rotatedFromKid?: string;
};

/** 密钥相关的审计事件；哈希链用于核对顺序篡改与中间事件缺失。 */
export type KeyAuditEvent = {
  eventType: string;
  subjectId: string;
  securityProfile: string;
  simulated: boolean;
  createdAt: string;
  eventHash?: string;
  previousHash?: string;
};

const base = '/api/v1alpha1/crypto';

const headers = () => ({ 'User-Token': localStorage.getItem('User-Token') || '' });

const get = <T>(path: string) =>
  request<ApiResponse<T>>(`${base}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));

export const CustomerKeyApi = {
  auditEvents: () => get<KeyAuditEvent[]>('/audit-events'),
};
