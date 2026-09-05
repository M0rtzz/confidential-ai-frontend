import request from 'umi-request';

import type {
  ContentEncryptionAlgorithm,
  EncryptedFilePayload,
} from '@/security/crypto';

import { responseData } from './data-sandbox';

type ApiResponse<T> = { status?: { code?: number; msg?: string }; data?: T };
export type ConfidentialAssetType = 'DATA' | 'MODEL' | 'RESULT_DATA' | 'RESULT_MODEL';
export type AssetSourceType = 'UPLOAD' | 'AI_GENERATED' | 'COMPUTE_RESULT';

export type ConfidentialAsset = {
  assetId: string;
  assetVersionId: string;
  assetType: ConfidentialAssetType;
  sourceType: AssetSourceType;
  name: string;
  description: string;
  version: number;
  domainId: string;
  algorithm: ContentEncryptionAlgorithm;
  originalFileName: string;
  originalSize: number;
  cipherSize: number;
  storageNode: string;
  manifestHash: string;
  status: string;
  sourceDataName?: string;
  sourceModelName?: string;
  taskId?: string;
  computeNode?: string;
  pendingRequestCount?: number;
  createdAt: string;
};

export type AssetUseRequest = {
  requestId: string;
  assetId: string;
  assetVersionId: string;
  applicant: string;
  computeNode: string;
  taskId: string;
  taskName: string;
  purpose: string;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'EXPIRED';
  validUntil: string;
  approvalComment?: string;
  requestedAt: string;
  decidedAt?: string;
  startedAt?: string;
  completedAt?: string;
};

const base = '/api/v1alpha1';
const headers = () => ({ 'User-Token': localStorage.getItem('User-Token') || '' });
const get = <T>(path: string) =>
  request<ApiResponse<T>>(`${base}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));
const post = <T>(path: string, data: Record<string, unknown> = {}) =>
  request<ApiResponse<T>>(`${base}${path}`, {
    method: 'POST',
    data,
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));

export const ConfidentialAssetApi = {
  generateData: (data: {
    providerId: string;
    prompt: string;
    fields: string[];
    rowCount: number;
  }) =>
    post<{ providerId: string; format: 'CSV'; rowCount: number; csv: string }>(
      '/confidential-assets/generate-data',
      data,
    ),
  list: (assetType?: ConfidentialAssetType) =>
    get<ConfidentialAsset[]>(
      `/confidential-assets${assetType ? `?assetType=${assetType}` : ''}`,
    ),
  createUpload: (data: {
    assetType: 'DATA' | 'MODEL' | 'RESULT_DATA' | 'RESULT_MODEL';
    sourceType: AssetSourceType;
    name: string;
    description: string;
    originalFileName: string;
    originalSize: number;
    domainId: string;
    algorithm: ContentEncryptionAlgorithm;
    expectedChunks: number;
  }) =>
    post<{ uploadSessionId: string; status: string; expiresAt: string }>(
      '/confidential-assets/upload-sessions',
      data,
    ),
  uploadChunk: (
    sessionId: string,
    index: number,
    ciphertext: Uint8Array,
    cipherHash: string,
  ) =>
    request<ApiResponse<{ index: number; status: string }>>(
      `${base}/confidential-assets/upload-sessions/${sessionId}/chunks?index=${index}`,
      {
        method: 'POST',
        data: ciphertext,
        credentials: 'include',
        headers: {
          ...headers(),
          'Content-Type': 'application/octet-stream',
          'X-Cipher-SHA256': cipherHash,
        },
      },
    ).then((response) => responseData(response, undefined as never)),
  commit: (sessionId: string, data: Record<string, unknown>) =>
    post<ConfidentialAsset>(
      `/confidential-assets/upload-sessions/${sessionId}/commit`,
      data,
    ),
  preview: (assetId: string) =>
    post<{
      previewSessionId: string;
      expiresAt: string;
      ciphertextPackage: {
        manifest: Omit<EncryptedFilePayload, 'chunks'> & {
          chunks: Array<Omit<EncryptedFilePayload['chunks'][number], 'ciphertext'>>;
        };
        chunks: Array<{ index: number; sha256: string; ciphertext: string }>;
      };
    }>(`/confidential-assets/${assetId}/preview-sessions`),
  usage: (assetId: string) =>
    get<AssetUseRequest[]>(`/confidential-assets/${assetId}/usage-records`),
  requestUse: (data: Record<string, unknown>) =>
    post<AssetUseRequest>('/confidential-use-requests', data),
  decide: (requestId: string, action: 'APPROVE' | 'REJECT', comment = '') =>
    post<AssetUseRequest>(`/confidential-use-requests/${requestId}/decision`, {
      action,
      comment,
    }),
  authorize: (data: Record<string, unknown>) =>
    post<{
      ready: boolean;
      status: string;
      requests: AssetUseRequest[];
      executionGrant?: {
        grantId: string;
        token: string;
        expiresAt: string;
        singleUse: true;
      };
    }>('/confidential-executions/authorize', data),
  validateAuthorizationProtocol: (scenario: 'UNAUTHORIZED' | 'REPLAYED') =>
    post<{ passed: boolean; actual: string }>(
      '/confidential-executions/protocol-validation',
      { scenario },
    ),
};

export const hydrateEncryptedPayload = (
  payload: Awaited<ReturnType<typeof ConfidentialAssetApi.preview>>,
): EncryptedFilePayload => {
  const ciphertext = new Map(
    payload.ciphertextPackage.chunks.map((chunk) => [chunk.index, chunk]),
  );
  const manifest = payload.ciphertextPackage.manifest;
  return {
    ...manifest,
    chunks: manifest.chunks.map((chunk) => ({
      ...chunk,
      ciphertext: ciphertext.get(chunk.index)?.ciphertext || '',
    })),
  };
};
