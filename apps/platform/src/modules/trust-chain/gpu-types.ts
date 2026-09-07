/** GPU 密态执行链路：六段公共类型，字段对齐后端 GpuChainService。 */

import type { SegmentMetric, SegmentState } from './types';

export type GpuSegmentKey =
  | 'IDENTITY'
  | 'ASSET_ENCRYPT'
  | 'DOMAIN_VERIFY'
  | 'ATTESTATION'
  | 'GRANT_RELEASE'
  | 'EXECUTION_EGRESS';

export interface GpuSegment {
  key: GpuSegmentKey;
  label: string;
  state: SegmentState;
  metrics: SegmentMetric[];
}

export interface GpuRuntime {
  securityProfile: string;
  evidenceType: string;
  hardwareModel: string;
  policyId: string;
  simulated: boolean;
  attestationVerified: boolean;
  contractVersion: string;
}

export interface GpuTrustedDomain {
  id: string;
  name: string;
  status: string;
  trustStatus: string;
  securityProfile: string;
  evidenceType: string;
  hardwareModel: string;
  policyId: string;
  warning: string;
}

export interface GpuChainSummary {
  ownerId: string;
  runtime: GpuRuntime;
  domains: GpuTrustedDomain[];
  segments: GpuSegment[];
}

export interface GpuPage<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
