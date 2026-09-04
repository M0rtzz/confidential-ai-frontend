import request from 'umi-request';

import type {
  ContentEncryptionAlgorithm,
  EncryptedFilePayload,
  EncryptedPayload,
} from '@/security/crypto';
import type {
  EncryptedInferenceRequest,
  EncryptedInferenceResponse,
} from '@/security/crypto';

import { responseData } from './data-sandbox';

type ApiResponse<T> = {
  status?: { code?: number; msg?: string };
  data?: T;
};

export type ConfidentialModelSource = 'LOCAL_WEIGHTS' | 'OPENAI_COMPATIBLE';

export type ConfidentialModelVersion = {
  versionId: string;
  version: number;
  sourceType: ConfidentialModelSource;
  domainId: string;
  securityProfile: 'a100-sim';
  runtimeSecurityRequirement: 'controlled-sim-ok' | 'public';
  contentEncryptionAlgorithm?: ContentEncryptionAlgorithm;
  assetVersionId?: string;
  manifestHash?: string;
  baseUrl?: string;
  upstreamModelId?: string;
  credentialId?: string;
  credentialMasked?: string;
  status: string;
  approvalId?: string;
  createdAt: string;
};

export type ModelDeployment = {
  deploymentId: string;
  versionId: string;
  deploymentType: ConfidentialModelSource;
  securityProfile: 'a100-sim';
  status: string;
  endpointPath: string;
  authorizationSessionId?: string;
  errorCode?: string;
};

export type ConfidentialModel = {
  modelId: string;
  name: string;
  description: string;
  sourceType: ConfidentialModelSource;
  status: string;
  latestVersion: number;
  versionId?: string;
  domainId?: string;
  contentEncryptionAlgorithm?: ContentEncryptionAlgorithm;
  runtimeSecurityRequirement?: string;
  securityProfile: 'a100-sim';
  simulated: true;
  versions?: ConfidentialModelVersion[];
  deployments?: ModelDeployment[];
};

export type CryptoCapabilities = {
  format: 'ds-envelope/v2';
  defaultAlgorithm: ContentEncryptionAlgorithm;
  chunkSize: number;
  contentEncryptionAlgorithms: Array<{
    algorithm: ContentEncryptionAlgorithm;
    keySize: number;
    nonceSize: number;
    tagSize: number;
    keyDerivation: 'HKDF-SHA256';
    implementationVersion: '1';
    enabled: boolean;
    recommended: boolean;
  }>;
};

const base = '/api/v1alpha1/confidential-models';

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

export const ConfidentialModelApi = {
  capabilities: () => get<CryptoCapabilities>('/capabilities'),
  list: () => get<ConfidentialModel[]>(''),
  detail: (modelId: string) =>
    get<ConfidentialModel>(`/${encodeURIComponent(modelId)}`),
  createWeightUpload: (data: {
    modelName: string;
    originalFileName: string;
    originalSize: number;
    domainId: string;
    contentEncryptionAlgorithm: ContentEncryptionAlgorithm;
    expectedChunks: number;
  }) =>
    post<{ uploadSessionId: string; status: string }>('/weight-upload-sessions', data),
  uploadWeightChunk: (
    uploadSessionId: string,
    index: number,
    ciphertext: Uint8Array,
    cipherHash: string,
  ) =>
    request<ApiResponse<{ index: number; cipherHash: string; status: string }>>(
      `${base}/weight-upload-sessions/${encodeURIComponent(
        uploadSessionId,
      )}/chunks?index=${index}`,
      {
        method: 'POST',
        data: ciphertext,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Cipher-SHA256': cipherHash,
          'User-Token': localStorage.getItem('User-Token') || '',
        },
      },
    ).then((response) => responseData(response, undefined as never)),
  commitWeights: (data: {
    uploadSessionId: string;
    modelId?: string;
    name: string;
    description: string;
    manifest: Omit<EncryptedFilePayload, 'chunks'> & {
      chunks: Array<Omit<EncryptedFilePayload['chunks'][number], 'ciphertext'>>;
    };
    manifestHash: string;
    ownerSigningPublicKey: string;
    ownerSignature: string;
    runtimeConfig: Record<string, unknown>;
    runtimeSecurityRequirement: 'controlled-sim-ok';
  }) => post<ConfidentialModel>('/weight-versions', data),
  createOpenAi: (data: {
    modelId?: string;
    name: string;
    description: string;
    domainId: string;
    baseUrl: string;
    upstreamModelId: string;
    encryptedCredential: EncryptedPayload;
    runtimeConfig: Record<string, unknown>;
    runtimeSecurityRequirement: 'controlled-sim-ok';
  }) => post<ConfidentialModel>('/openai-compatible-versions', data),
  review: (modelId: string, versionId: string, action: string, comment = '') =>
    post<ConfidentialModel>(
      `/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(
        versionId,
      )}/review`,
      { action, comment },
    ),
  deploy: (modelId: string, versionId: string) =>
    post<ModelDeployment>(`/${encodeURIComponent(modelId)}/deployments`, { versionId }),
  offline: (deploymentId: string) =>
    post<ModelDeployment>(`/deployments/${encodeURIComponent(deploymentId)}/offline`),
  authorize: (deploymentId: string, taskId: string, grantId: string) =>
    post<ModelDeployment>(
      `/deployments/${encodeURIComponent(deploymentId)}/authorize`,
      {
        taskId,
        grantId,
      },
    ),
  infer: (payload: EncryptedInferenceRequest) =>
    request<ApiResponse<EncryptedInferenceResponse>>(
      '/api/v1alpha1/confidential-inference/chat/completions',
      {
        method: 'POST',
        data: payload,
        credentials: 'include',
        headers: {
          'User-Token': localStorage.getItem('User-Token') || '',
        },
        errorHandler: (failure) => {
          const body = failure.data as
            | (ApiResponse<unknown> & {
                data?: { errorCode?: string };
                error?: { code?: string; message?: string };
              })
            | undefined;
          const reason =
            body?.data?.errorCode ||
            body?.error?.code ||
            body?.status?.msg ||
            body?.error?.message;
          throw new Error(reason ? `密态推理失败：${reason}` : failure.message);
        },
      },
    ).then((response) => responseData(response, undefined as never)),
};
