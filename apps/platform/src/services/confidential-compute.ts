import request from 'umi-request';

import { mockAuditEvents } from '@/mocks/audit';
import { mockTrustedDomains } from '@/mocks/trustedDomains';
import type { ConfidentialTaskOutput, TrustedDomain } from '@/security/crypto';

import { responseData } from './data-sandbox';

type ApiResponse<T> = {
  status?: { code?: number; msg?: string };
  data?: T;
};

export type DomainVerification = {
  domain: TrustedDomain;
  runtime: {
    securityProfile: string;
    evidenceType: string;
    simulated: boolean;
    hardwareModel: string;
    attestationVerified: boolean;
  };
  warning: string;
};

export type AuditEvent = {
  eventType: string;
  subjectId: string;
  securityProfile: string;
  simulated: boolean;
  createdAt: string;
  eventHash?: string;
  previousHash?: string;
};

const base = '/api/v1alpha1/crypto';

const get = <T>(path: string) =>
  request<ApiResponse<T>>(`${base}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'User-Token': localStorage.getItem('User-Token') || '',
    },
  }).then((response) => responseData(response, undefined as T));

const post = <T>(path: string, data: Record<string, unknown> = {}) =>
  request<ApiResponse<T>>(`${base}${path}`, {
    method: 'POST',
    data,
    credentials: 'include',
    headers: {
      'User-Token': localStorage.getItem('User-Token') || '',
    },
  }).then((response) => responseData(response, undefined as T));

export interface ConfidentialComputeAdapter {
  readonly source: 'api' | 'mock';
  listDomains(): Promise<TrustedDomain[]>;
  getDomain(domainId: string): Promise<TrustedDomain>;
  verifyDomain(domainId: string): Promise<DomainVerification>;
  listAudits(): Promise<AuditEvent[]>;
}

class ApiConfidentialComputeAdapter implements ConfidentialComputeAdapter {
  readonly source = 'api' as const;

  listDomains() {
    return get<TrustedDomain[]>('/trusted-domains');
  }

  getDomain(domainId: string) {
    return get<TrustedDomain>(`/trusted-domains/${encodeURIComponent(domainId)}`);
  }

  verifyDomain(domainId: string) {
    return post<DomainVerification>(
      `/trusted-domains/${encodeURIComponent(domainId)}/verify`,
    );
  }

  listAudits() {
    return get<AuditEvent[]>('/audit-events');
  }
}

class MockConfidentialComputeAdapter implements ConfidentialComputeAdapter {
  readonly source = 'mock' as const;

  async listDomains() {
    return mockTrustedDomains;
  }

  async getDomain(domainId: string) {
    const domain = mockTrustedDomains.find((item) => item.id === domainId);
    if (!domain) throw new Error('可信域不存在');
    return domain;
  }

  async verifyDomain(domainId: string) {
    const domain = await this.getDomain(domainId);
    if (domain.trustStatus === 'blocked') {
      throw new Error('可信域当前处于 Blocked 状态，禁止上传和解密请求');
    }
    return {
      domain,
      runtime: {
        securityProfile: 'a100-sim',
        evidenceType: 'SIMULATED_LAB_V1',
        simulated: true,
        hardwareModel: 'NVIDIA A100',
        attestationVerified: false,
      },
      warning: domain.warning,
    };
  }

  async listAudits() {
    return mockAuditEvents;
  }
}

export const confidentialComputeAdapters = {
  api: new ApiConfidentialComputeAdapter(),
  mock: new MockConfidentialComputeAdapter(),
};

export const ConfidentialComputeApi = {
  registerIdentity: (data: Record<string, unknown>) => post('/identities', data),
  createTask: (data: Record<string, unknown>) => post('/tasks', data),
  createAttestation: (data: Record<string, unknown>) =>
    post('/attestation-sessions', data),
  saveGrant: (data: Record<string, unknown>) => post('/grants', data),
  startTask: (taskId: string, grantId: string) =>
    post(`/tasks/${encodeURIComponent(taskId)}/start`, { grantId }),
  output: (taskId: string) =>
    get<ConfidentialTaskOutput>(`/tasks/${encodeURIComponent(taskId)}/outputs`),
};
