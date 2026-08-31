import { useCallback, useState } from 'react';

export type AccountStatus = 'ENABLED' | 'DISABLED';
export type TenantStatus = 'ACTIVE' | 'FROZEN';

export type SandboxUser = {
  id: string;
  account: string;
  displayName: string;
  tenantId: string;
  roleIds: string[];
  status: AccountStatus;
  lastLoginAt?: string;
  createdAt: string;
};

export type SandboxRole = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  system: boolean;
  createdAt: string;
};

export type SandboxTenant = {
  id: string;
  code: string;
  name: string;
  contact: string;
  phone: string;
  status: TenantStatus;
  cpuCores: number;
  memoryGb: number;
  gpuCount: number;
  storageGb: number;
  dataIsolation: boolean;
  computeIsolation: boolean;
  createdAt: string;
};

export const PLATFORM_RESOURCE_TOTALS = {
  cpuCores: 64,
  memoryGb: 256,
  gpuCount: 4,
  storageGb: 4096,
} as const;

export type SystemManagementState = {
  users: SandboxUser[];
  roles: SandboxRole[];
  tenants: SandboxTenant[];
};

export const permissionTree = [
  {
    title: '项目协作',
    key: 'group-project',
    children: [
      { title: '工作台', key: 'workbench:view' },
      { title: '项目管理', key: 'project:manage' },
      { title: '合作节点', key: 'node:manage' },
    ],
  },
  {
    title: '数据管理',
    key: 'group-data',
    children: [
      { title: '数据目录', key: 'data:catalog' },
      { title: '数据抽样与脱敏', key: 'data:governance' },
      { title: '数据使用控制', key: 'data:usage-control' },
    ],
  },
  {
    title: '沙箱资源',
    key: 'group-resource',
    children: [
      { title: '沙箱资源申请', key: 'sandbox:apply' },
      { title: '项目资源审核', key: 'sandbox:review' },
      { title: '数据计算', key: 'compute:use' },
      { title: '模型审批', key: 'model:review' },
    ],
  },
  {
    title: '安全与运维',
    key: 'group-security',
    children: [{ title: '统一日志', key: 'log:view' }],
  },
  {
    title: '系统管理',
    key: 'group-system',
    children: [
      { title: '用户管理', key: 'system:user' },
      { title: '角色管理', key: 'system:role' },
      { title: '租户管理', key: 'system:tenant' },
    ],
  },
];

const leafPermissions = permissionTree.flatMap((group) =>
  group.children.map((item) => String(item.key)),
);

export const permissionLabelMap = permissionTree.reduce<Record<string, string>>(
  (result, group) => {
    group.children.forEach((item) => {
      result[String(item.key)] = item.title;
    });
    return result;
  },
  {},
);

const DEFAULT_STATE: SystemManagementState = {
  tenants: [
    {
      id: 'tenant-platform',
      code: 'platform',
      name: '平台运营租户',
      contact: '平台管理员',
      phone: '13800000000',
      status: 'ACTIVE',
      cpuCores: 32,
      memoryGb: 128,
      gpuCount: 2,
      storageGb: 2000,
      dataIsolation: true,
      computeIsolation: true,
      createdAt: '2026-08-20T09:00:00+08:00',
    },
    {
      id: 'tenant-research',
      code: 'joint-modeling',
      name: '联合建模租户',
      contact: '项目负责人',
      phone: '13900000000',
      status: 'ACTIVE',
      cpuCores: 16,
      memoryGb: 64,
      gpuCount: 0,
      storageGb: 500,
      dataIsolation: true,
      computeIsolation: true,
      createdAt: '2026-08-21T10:30:00+08:00',
    },
  ],
  roles: [
    {
      id: 'role-admin',
      name: '沙箱管理员',
      description: '管理沙箱平台、租户、用户、角色及全部资源',
      permissions: leafPermissions,
      system: true,
      createdAt: '2026-08-20T09:00:00+08:00',
    },
    {
      id: 'role-project-manager',
      name: '项目管理员',
      description: '管理项目成员、资源申请与项目级审批',
      permissions: [
        'workbench:view',
        'project:manage',
        'node:manage',
        'data:catalog',
        'sandbox:apply',
        'sandbox:review',
        'compute:use',
      ],
      system: true,
      createdAt: '2026-08-20T09:05:00+08:00',
    },
    {
      id: 'role-developer',
      name: '数据开发人员',
      description: '使用数据目录、数据计算和沙箱能力',
      permissions: [
        'workbench:view',
        'data:catalog',
        'data:governance',
        'data:usage-control',
        'sandbox:apply',
        'compute:use',
      ],
      system: true,
      createdAt: '2026-08-20T09:10:00+08:00',
    },
    {
      id: 'role-auditor',
      name: '审计员',
      description: '查看审批过程、模型记录和统一审计日志',
      permissions: ['workbench:view', 'sandbox:review', 'model:review', 'log:view'],
      system: true,
      createdAt: '2026-08-20T09:15:00+08:00',
    },
  ],
  users: [
    {
      id: 'user-admin',
      account: 'admin',
      displayName: '沙箱管理员',
      tenantId: 'tenant-platform',
      roleIds: ['role-admin'],
      status: 'ENABLED',
      lastLoginAt: '2026-08-23T13:40:00+08:00',
      createdAt: '2026-08-20T09:00:00+08:00',
    },
    {
      id: 'user-project',
      account: 'project_manager',
      displayName: '项目负责人',
      tenantId: 'tenant-research',
      roleIds: ['role-project-manager'],
      status: 'ENABLED',
      lastLoginAt: '2026-08-23T11:20:00+08:00',
      createdAt: '2026-08-21T10:40:00+08:00',
    },
    {
      id: 'user-developer',
      account: 'data_developer',
      displayName: '数据开发人员',
      tenantId: 'tenant-research',
      roleIds: ['role-developer'],
      status: 'ENABLED',
      lastLoginAt: '2026-08-22T18:15:00+08:00',
      createdAt: '2026-08-21T11:00:00+08:00',
    },
  ],
};

const STORAGE_KEY = 'data-sandbox-system-management-v1';

type StoredSandboxTenant = Partial<SandboxTenant> & {
  ownerId?: string;
  projectQuota?: number;
  sandboxQuota?: number;
};

const isValidQuota = (value: unknown, allowZero = false): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  (allowZero ? value >= 0 : value > 0);

const normalizeTenant = (tenant: StoredSandboxTenant): SandboxTenant => {
  const normalized = { ...tenant };
  delete normalized.ownerId;
  delete normalized.projectQuota;
  delete normalized.sandboxQuota;
  return {
    ...normalized,
    cpuCores: isValidQuota(tenant.cpuCores) ? tenant.cpuCores : 16,
    memoryGb: isValidQuota(tenant.memoryGb) ? tenant.memoryGb : 64,
    gpuCount: isValidQuota(tenant.gpuCount, true) ? tenant.gpuCount : 0,
    storageGb: isValidQuota(tenant.storageGb) ? tenant.storageGb : 1024,
  } as SandboxTenant;
};

const cloneDefaultState = (): SystemManagementState =>
  JSON.parse(JSON.stringify(DEFAULT_STATE)) as SystemManagementState;

const loadState = (): SystemManagementState => {
  if (typeof window === 'undefined') return cloneDefaultState();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return cloneDefaultState();
    const state = JSON.parse(stored) as SystemManagementState;
    return {
      ...state,
      tenants: (state.tenants || []).map((tenant) => normalizeTenant(tenant)),
    };
  } catch {
    return cloneDefaultState();
  }
};

const persistState = (state: SystemManagementState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the current page usable when browser storage is unavailable.
  }
};

export const createEntityId = (prefix: string) =>
  prefix + '-' + Date.now().toString(36);

export const useSystemManagementStore = () => {
  const [state, setState] = useState<SystemManagementState>(loadState);

  const updateState = useCallback(
    (updater: (current: SystemManagementState) => SystemManagementState) => {
      setState((current) => {
        const next = updater(current);
        persistState(next);
        return next;
      });
    },
    [],
  );

  return { state, updateState };
};
