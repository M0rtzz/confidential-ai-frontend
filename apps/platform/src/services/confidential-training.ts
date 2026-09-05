import type { EncryptedPayload } from '@/security/crypto';

import { ConfidentialAssetApi } from './confidential-assets';

export type TrainingTaskStatus =
  | 'WAITING_APPROVAL'
  | 'AUTHORIZED_WAITING_START'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'EXPIRED';

export type ConfidentialTrainingTask = {
  taskId: string;
  taskName: string;
  purpose: string;
  computeNode: string;
  dataAssetId: string;
  dataAssetVersionId: string;
  dataAssetName: string;
  modelAssetId: string;
  modelAssetVersionId: string;
  modelAssetName: string;
  dataRequestId: string;
  modelRequestId: string;
  dataApprovalStatus: string;
  modelApprovalStatus: string;
  epochs: number;
  learningRate: string;
  status: TrainingTaskStatus;
  progress: number;
  currentEpoch: number;
  metrics: { loss?: number; accuracy?: number };
  resultDataAssetId?: string;
  resultModelAssetId?: string;
  failureReason?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type LlmProvider = {
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  defaultProvider: boolean;
  status: string;
  credentialConfigured: boolean;
  credentialMasked: string;
  encryptedCredential?: EncryptedPayload;
};

const api = ConfidentialAssetApi.request;

export const ConfidentialTrainingApi = {
  list: () => api<ConfidentialTrainingTask[]>('GET', '/confidential-training-tasks'),
  detail: (taskId: string) =>
    api<ConfidentialTrainingTask>('GET', `/confidential-training-tasks/${taskId}`),
  create: (data: Record<string, unknown>) =>
    api<ConfidentialTrainingTask>('POST', '/confidential-training-tasks', data),
  start: (taskId: string) =>
    api<ConfidentialTrainingTask>(
      'POST',
      `/confidential-training-tasks/${taskId}/start`,
    ),
  progress: (taskId: string, data: Record<string, unknown>) =>
    api<ConfidentialTrainingTask>(
      'POST',
      `/confidential-training-tasks/${taskId}/progress`,
      data,
    ),
  complete: (taskId: string, data: Record<string, unknown>) =>
    api<ConfidentialTrainingTask>(
      'POST',
      `/confidential-training-tasks/${taskId}/complete`,
      data,
    ),
  fail: (taskId: string, reason: string) =>
    api<ConfidentialTrainingTask>(
      'POST',
      `/confidential-training-tasks/${taskId}/fail`,
      {
        reason,
      },
    ),
  providers: () => api<LlmProvider[]>('GET', '/confidential-llm-providers'),
  providerCredential: (providerId: string) =>
    api<LlmProvider>('GET', `/confidential-llm-providers/${providerId}/credential`),
  saveProvider: (data: Record<string, unknown>) =>
    api<LlmProvider>('POST', '/confidential-llm-providers', data),
};
