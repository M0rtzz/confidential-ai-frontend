/** 可信执行链路：六段链路的公共类型定义，字段名严格对齐 SPEC 第 2~11 节 */

export type SegmentState = 'OK' | 'WARN' | 'EMPTY';

export type SegmentKey =
  | 'KEY_ISSUE'
  | 'DATA_ENCRYPT'
  | 'POLICY_CHECK'
  | 'ATTESTATION'
  | 'TEE_EXEC'
  | 'EGRESS';

export interface SegmentMetric {
  label: string;
  value: string | number;
}

export interface Segment {
  key: SegmentKey;
  label: string;
  state: SegmentState;
  metrics: SegmentMetric[];
}

/** 对齐后端 TeeEnvironmentService.Environment，原样嵌入 summary */
export interface TeeEnvironment {
  contractVersion: string;
  runtimeMode: string;
  checkedAt: string | null;
  hardwareDetected: boolean;
  deviceChecks: { sgx: boolean; tdx: boolean; csv: boolean };
  attestationVerified: boolean;
  keyServiceReachable: boolean;
  realModeReady: boolean;
  blockers: string[];
}

export interface TrustChainSummary {
  endRole: 'CENTER' | 'CLIENT';
  ownerId: string;
  ownerName: string;
  contractVersion: string;
  environment: TeeEnvironment;
  runtimeImageId: string;
  segments: Segment[];
}
