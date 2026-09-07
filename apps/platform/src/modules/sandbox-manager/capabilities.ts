/** TEE 环境加密能力；字段对齐后端 TeeCapabilityService.CapabilityView。 */

export type CapabilityOption = {
  value: string;
  label: string;
  description: string;
  available: boolean;
  reason: string;
};

export type RequirementRow = {
  requirement: string;
  supported: string;
  current: string;
  satisfied: boolean;
};

export type TeeCapabilities = {
  environment?: {
    runtimeMode: string;
    hardwareDetected: boolean;
    attestationVerified: boolean;
    deviceChecks: { sgx: boolean; tdx: boolean; csv: boolean };
  };
  cpuEncryptions: CapabilityOption[];
  gpuEncryptions: CapabilityOption[];
  attestationRequirements: CapabilityOption[];
  contentAlgorithms: string[];
  defaultContentAlgorithm: string;
  requirements: RequirementRow[];
};

/** 下拉选项：不可用的项禁选并把原因显示在标题上。 */
export const toSelectOptions = (options?: CapabilityOption[]) =>
  (options || []).map((item) => ({
    value: item.value,
    label: item.available ? item.label : `${item.label}（不可用）`,
    disabled: !item.available,
    title: item.available ? item.description : item.reason,
  }));

const CPU_LABELS: Record<string, string> = {
  NONE: '未启用',
  SGX: 'Intel SGX',
  TDX: 'Intel TDX',
  CSV: '海光 CSV',
};

/** 列表「加密类型」列：把两侧取值合成一个可读标签。 */
export const encryptionSummary = (cpu?: unknown, gpu?: unknown) => {
  const cpuValue = String(cpu || 'NONE');
  const gpuValue = String(gpu || 'NONE');
  const parts: string[] = [];
  if (cpuValue !== 'NONE') parts.push(`CPU · ${CPU_LABELS[cpuValue] || cpuValue}`);
  if (gpuValue !== 'NONE') parts.push(`GPU · ${gpuValue}`);
  return parts.length ? parts.join(' + ') : '未启用';
};
