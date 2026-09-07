import request from 'umi-request';

import { responseData } from './data-sandbox';

type ApiResponse<T> = { status?: { code?: number; msg?: string }; data?: T };

export type AiConfig = {
  configured: boolean;
  editable?: boolean;
  configId?: string;
  version?: number;
  format: 'OPENAI_COMPATIBLE';
  baseUrl?: string;
  modelId?: string;
  enabled: boolean;
  apiKeyConfigured?: boolean;
  apiKeyMasked?: string;
  updatedAt?: string;
};

export type SaveAiConfig = {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  clearApiKey: boolean;
  enabled: boolean;
};

const base = '/api/v1alpha1/data-sandbox/ai-config';
const options = () => ({
  credentials: 'include' as const,
  headers: { 'User-Token': localStorage.getItem('User-Token') || '' },
});

export const AiConfigApi = {
  current: () =>
    request<ApiResponse<AiConfig>>(base, { method: 'GET', ...options() }).then(
      (response) => responseData(response, undefined as unknown as AiConfig),
    ),
  save: (data: SaveAiConfig) =>
    request<ApiResponse<AiConfig>>(base, {
      method: 'PUT',
      data,
      ...options(),
    }).then((response) => responseData(response, undefined as unknown as AiConfig)),
  test: () =>
    request<ApiResponse<{ connected: boolean; configVersion: number; modelId: string }>>(
      `${base}/test`,
      { method: 'POST', data: {}, ...options() },
    ).then((response) =>
      responseData(
        response,
        undefined as unknown as {
          connected: boolean;
          configVersion: number;
          modelId: string;
        },
      ),
    ),
};
