import request from 'umi-request';

const traceId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export type DataSandboxResponse<T = unknown> = {
  status?: { code?: number; msg?: string };
  data?: T;
};

export type DataSandboxRecord = Record<string, any>;

const base = '/api/v1alpha1/data-sandbox';

const get = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${base}${path}`, {
    method: 'GET',
    params,
    credentials: 'include',
    headers: {
      'User-Token': localStorage.getItem('User-Token') || '',
      'Trace-Id': traceId(),
    },
  });

const post = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${base}${path}`, {
    method: 'POST',
    data: data || {},
    credentials: 'include',
    headers: {
      'User-Token': localStorage.getItem('User-Token') || '',
      'Trace-Id': traceId(),
    },
  });

export const DataSandboxApi = {
  modeling: () => get<DataSandboxRecord>('/modeling'),
  modelingComponent: (code: string) =>
    get<DataSandboxRecord>('/modeling/components/detail', { code }),
  saveModelingProfile: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/modeling/profiles/save', data),
  deleteModelingProfile: (id: string) => post('/modeling/profiles/delete', { id }),
  validateModeling: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/modeling/components/validate', data),
  modelingRuns: (projectId = '') =>
    get<DataSandboxRecord[]>('/modeling/runs', { projectId }),
  sandboxes: (params?: DataSandboxRecord) =>
    get<DataSandboxRecord[]>('/sandboxes', params),
  createSandbox: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/sandboxes/create', data),
  sandboxAction: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/sandboxes/action', data),
  devToken: (id: string) =>
    post<{ url: string; expiresAt: string }>('/sandboxes/dev-token', { id }),
  images: () => get<DataSandboxRecord[]>('/images'),
  saveImage: (data: DataSandboxRecord) => post<DataSandboxRecord>('/images/save', data),

  resourceOverview: (ownerId?: string) =>
    get<DataSandboxRecord>('/resources/overview', { ownerId: ownerId || '' }),
  saveQuota: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/resources/quota', data),
  alerts: (status = '') => get<DataSandboxRecord[]>('/resources/alerts', { status }),
  resolveAlert: (id: string) => post('/resources/alerts/resolve', { id }),
  networkAllowlist: (sandboxId = '') =>
    get<DataSandboxRecord[]>('/resources/network/allowlist', { sandboxId }),
  addNetworkAllowlist: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/resources/network/allowlist', data),
  deleteNetworkAllowlist: (id: string) =>
    post('/resources/network/allowlist/delete', { id }),
  limitVerify: (sandboxId: string) =>
    post<DataSandboxRecord>('/operations/limit-verify', { sandboxId }),

  models: (params?: DataSandboxRecord) => get<DataSandboxRecord[]>('/models', params),
  submitModel: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/models/submit', data),
  modelAction: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/models/action', data),
  modelHistory: (id: string) => get<DataSandboxRecord[]>('/models/history', { id }),

  // Z-03 沙箱资源申请与审批
  approvals: (params?: DataSandboxRecord) =>
    get<DataSandboxRecord[]>('/approvals', params),
  approvalDetail: (id: string) => get<DataSandboxRecord>('/approvals/detail', { id }),
  approvalSubmit: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/approvals/submit', data),
  approvalAction: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/approvals/action', data),
  approvalHistory: (id: string) =>
    get<DataSandboxRecord[]>('/approvals/history', { id }),
  approvalConfig: () => get<DataSandboxRecord>('/approvals/config'),

  logs: (params?: DataSandboxRecord) => get<DataSandboxRecord[]>('/logs', params),
  retention: () => get<DataSandboxRecord[]>('/logs/retention'),
  saveRetention: (data: DataSandboxRecord) => post('/logs/retention', data),

  integrations: () => get<DataSandboxRecord>('/integrations'),
  createClient: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/integrations/clients/create', data),
  revokeClient: (id: string) => post('/integrations/clients/revoke', { id }),
  rotateClient: (id: string) =>
    post<DataSandboxRecord>('/integrations/clients/rotate', { id }),
  saveWebhook: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/integrations/webhooks/save', data),
  testWebhook: (id: string) =>
    post<DataSandboxRecord>('/integrations/webhooks/test', { id }),
  retryDelivery: (id: string) =>
    post<DataSandboxRecord>('/integrations/deliveries/retry', { id }),
  saveOidc: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/integrations/oidc/save', data),
  testOidc: () => post<DataSandboxRecord>('/integrations/oidc/test'),
  oidcLogin: (redirectUri: string) =>
    get<DataSandboxRecord>('/integrations/oidc/login', { redirectUri }),
  saveOidcMapping: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/integrations/oidc/mappings/save', data),
  deleteOidcMapping: (id: string) => post('/integrations/oidc/mappings/delete', { id }),

  tenants: () => get<DataSandboxRecord[]>('/tenants'),
  openTenant: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/tenants/open', data),
  resizeTenant: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/tenants/resize', data),
  deployTenant: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/tenants/deploy', data),
  tenantUsage: (tenantId: string) =>
    get<DataSandboxRecord[]>('/billing/usage', { tenantId }),
  calculateBilling: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/billing/calculate', data),
  reportBilling: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/billing/report', data),
  trustedExchanges: (tenantId = '') =>
    get<DataSandboxRecord[]>('/trusted/exchanges', { tenantId }),
  trustedPush: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/trusted/push', data),
  trustedCallback: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/trusted/callback', data),
  verifyTrusted: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/trusted/verify', data),
  trustedPolicies: (tenantId: string) =>
    get<DataSandboxRecord[]>('/trusted/policies', { tenantId }),
  saveTrustedPolicy: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/trusted/policies/save', data),

  operations: () => get<DataSandboxRecord>('/operations'),
  createBackup: () => post<DataSandboxRecord>('/operations/backups/create'),
  restoreBackup: (id: string) =>
    post<DataSandboxRecord>('/operations/backups/restore', { id }),
  verifyBackup: (id: string) =>
    post<DataSandboxRecord>('/operations/backups/verify', { id }),
  drillRecovery: (id: string) =>
    post<DataSandboxRecord>('/operations/backups/drill', { id }),
  rollbackRecoveryPoint: (id: string) =>
    post<DataSandboxRecord>('/operations/recovery-points/rollback', { id }),
  diagnostics: () => post<DataSandboxRecord>('/operations/diagnostics'),
  securityScan: () => post<DataSandboxRecord>('/operations/security/scan'),
  help: () => get<DataSandboxRecord[]>('/operations/help'),
  createTicket: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/operations/tickets/create', data),
  updateTicket: (data: DataSandboxRecord) =>
    post<DataSandboxRecord>('/operations/tickets/update', data),

  exportLogs: async (params: DataSandboxRecord) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value));
    });
    const response = await fetch(`${base}/logs/export?${query}`, {
      credentials: 'include',
      headers: {
        'User-Token': localStorage.getItem('User-Token') || '',
        'Trace-Id': traceId(),
      },
    });
    if (!response.ok) throw new Error(`日志导出失败: HTTP ${response.status}`);
    return response.blob();
  },
};

// Unified data asset catalog and usage-control workflow.
const assetBase = '/api/v1alpha1/data-assets';
const assetGet = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${assetBase}${path}`, { method: 'GET', params });
const assetPost = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${assetBase}${path}`, {
    method: 'POST',
    data: data || {},
  });

export const DataAssetApi = {
  catalog: (params?: DataSandboxRecord) =>
    assetGet<DataSandboxRecord[]>('/catalog', params),
  detail: (id: string) => assetGet<DataSandboxRecord>('/detail', { id }),
  preview: (id: string, limit = 5) =>
    assetGet<DataSandboxRecord>('/preview', { id, limit }),
  deleteAsset: (id: string) => assetPost<DataSandboxRecord>('/delete', { id }),
  projectAssets: (projectId: string) =>
    assetGet<DataSandboxRecord[]>('/projects/catalog', { projectId }),
  attachProjectAssets: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord[]>('/projects/attach', data),
  createApiSnapshot: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord>('/api-snapshots', data),
  previewDatabase: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord>('/database/preview', data),
  testDatabase: (data: DataSandboxRecord) =>
    assetPost<{ connected: boolean; tables: string[] }>('/database/test', data),
  importDatabase: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord>('/database/import', data),
  sandboxMounts: (sandboxId: string) =>
    assetGet<DataSandboxRecord[]>('/sandboxes/mounts', { sandboxId }),
  usageRequests: (params?: DataSandboxRecord) =>
    assetGet<DataSandboxRecord[]>('/usage-controls/requests', params),
  saveUsageControl: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord>('/usage-controls/save', data),
  reviewUsageControl: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord>('/usage-controls/review', data),
  mountControls: () => assetGet<DataSandboxRecord[]>('/usage-controls/mounts'),
  saveMountControl: (data: DataSandboxRecord) =>
    assetPost<DataSandboxRecord>('/usage-controls/mounts/save', data),
};

const computeBase = '/api/v1alpha1/data-compute';
const computeGet = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${computeBase}${path}`, { method: 'GET', params });
const computePost = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${computeBase}${path}`, {
    method: 'POST',
    data: data || {},
  });

export const DataComputeApi = {
  overview: () => computeGet<DataSandboxRecord[]>('/overview'),
  context: (sandboxId: string) =>
    computeGet<DataSandboxRecord>('/context', { sandboxId }),
  workspaceData: (sandboxId: string) =>
    computeGet<DataSandboxRecord>('/workspace/data', { sandboxId }),
  mountRequests: (status = '') =>
    computeGet<DataSandboxRecord[]>('/mount-requests', { status }),
  requestMount: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/mount-requests', data),
  components: (sandboxId: string) =>
    computeGet<DataSandboxRecord[]>('/components', { sandboxId }),
  publishComponent: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/components/publish', data),
  canvases: (sandboxId: string) =>
    computeGet<DataSandboxRecord[]>('/canvases', { sandboxId }),
  saveCanvas: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/canvases/save', data),
  deleteCanvas: (id: string, sandboxId: string) =>
    computePost<DataSandboxRecord>('/canvases/delete', { id, sandboxId }),
  deleteCanvas: (id: string, sandboxId: string) =>
    computePost<DataSandboxRecord>('/canvases/delete', { id, sandboxId }),
  reports: (sandboxId: string, type = '') =>
    computeGet<DataSandboxRecord[]>('/reports', { sandboxId, type }),
  // 沙箱权威库数据目录（Stage 3）：仅沙箱创建人
  sandboxDbDirectory: (sandboxId: string) =>
    computeGet<DataSandboxRecord>('/sandbox-db/directory', { sandboxId }),
  sandboxDbPreview: (sandboxId: string, tableName: string, limit = 20) =>
    computeGet<DataSandboxRecord>('/sandbox-db/table-preview', {
      sandboxId,
      tableName,
      limit,
    }),
  resultControls: (sandboxId: string) =>
    computeGet<DataSandboxRecord[]>('/result-controls', { sandboxId }),
  saveResultControl: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/result-controls/save', data),
  // 仅开发结果表可按权限导出；挂载数据不提供下载。
  sandboxDbTableExport: async (sandboxId: string, tableName: string) => {
    const query = new URLSearchParams({ sandboxId, tableName });
    const response = await fetch(`${computeBase}/sandbox-db/table-export?${query}`, {
      credentials: 'include',
      headers: {
        'User-Token': localStorage.getItem('User-Token') || '',
        'Trace-Id': `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
    });
    if (!response.ok) throw new Error(`表格导出失败: HTTP ${response.status}`);
    return response.blob();
  },
  /* 可视化建模画布（智能建模闭环）：执行 / 状态 / 节点输出日志 / 数据资源 / 模板 / 版本 */
  canvasRun: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/canvas/run', data),
  canvasStopRun: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/canvas/run/stop', data),
  canvasRunStatus: (canvasId: string) =>
    computeGet<DataSandboxRecord>('/canvas/run/status', { canvasId }),
  canvasRuns: (canvasId: string) =>
    computeGet<DataSandboxRecord[]>('/canvas/runs', { canvasId }),
  canvasNodeOutput: (canvasId: string, nodeId: string, runId = '', limit = 50) =>
    computeGet<DataSandboxRecord>('/canvas/node/output', {
      canvasId,
      nodeId,
      runId,
      limit,
    }),
  canvasNodeLogs: (canvasId: string, nodeId: string, runId = '') =>
    computeGet<DataSandboxRecord>('/canvas/node/logs', { canvasId, nodeId, runId }),
  canvasNodeInput: (canvasId: string, nodeId: string, limit = 20) =>
    computeGet<DataSandboxRecord>('/canvas/node/input', {
      canvasId,
      nodeId,
      limit,
    }),
  canvasDataResources: (sandboxId: string) =>
    computeGet<DataSandboxRecord>('/canvas/data-resources', { sandboxId }),
  canvasTemplates: () => computeGet<DataSandboxRecord[]>('/canvas/templates'),
  canvasImportTemplate: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/canvas/templates/import', data),
  canvasVersions: (canvasId: string) =>
    computeGet<DataSandboxRecord[]>('/canvas/versions', { canvasId }),
  canvasModels: (canvasId: string) =>
    computeGet<DataSandboxRecord[]>('/canvas/models', { canvasId }),
  canvasModelReport: (canvasModelId: string, testId = '') =>
    computeGet<DataSandboxRecord>('/canvas/models/report', { canvasModelId, testId }),
  canvasModelTreeStructure: (canvasModelId: string, treeIndex = 0) =>
    computePost<DataSandboxRecord>('/canvas/models/tree-structure', {
      canvasModelId,
      treeIndex,
    }),
  canvasModelCandidates: (canvasId: string) =>
    computeGet<DataSandboxRecord[]>('/canvas/models/candidates', { canvasId }),
  saveCanvasModel: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/canvas/models/save', data),
  canvasRollbackVersion: (data: DataSandboxRecord) =>
    computePost<DataSandboxRecord>('/canvas/versions/rollback', data),
  canvasCompareVersions: (versionIdA: string, versionIdB: string) =>
    computeGet<DataSandboxRecord>('/canvas/versions/compare', {
      versionIdA,
      versionIdB,
    }),
};

// Z-04 数据治理（抽样/脱敏）：独立前缀 /api/v1alpha1/data-governance
const governanceBase = '/api/v1alpha1/data-governance';

const governanceGet = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${governanceBase}${path}`, {
    method: 'GET',
    params,
  });

const governancePost = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${governanceBase}${path}`, {
    method: 'POST',
    data: data || {},
  });

export const DataGovernanceApi = {
  // 策略
  policies: (params?: DataSandboxRecord) =>
    governanceGet<DataSandboxRecord[]>('/policies', params),
  policyDetail: (id: string) =>
    governanceGet<DataSandboxRecord>('/policies/detail', { id }),
  createPolicy: (data: DataSandboxRecord) =>
    governancePost<DataSandboxRecord>('/policies', data),
  updatePolicy: (data: DataSandboxRecord) =>
    governancePost<DataSandboxRecord>('/policies/update', data),
  deletePolicy: (id: string) => governancePost('/policies/delete', { id }),
  // 任务
  tasks: (params?: DataSandboxRecord) =>
    governanceGet<DataSandboxRecord[]>('/tasks', params),
  taskDetail: (id: string) => governanceGet<DataSandboxRecord>('/tasks/detail', { id }),
  submitTask: (data: DataSandboxRecord) =>
    governancePost<DataSandboxRecord>('/tasks/submit', data),
  cancelTask: (id: string) => governancePost('/tasks/cancel', { id }),
  retryTask: (id: string) => governancePost<DataSandboxRecord>('/tasks/retry', { id }),
  // 结果数据集
  results: (nodeId = '') =>
    governanceGet<DataSandboxRecord[]>('/tasks/results', { nodeId }),
  mountResult: (data: DataSandboxRecord) =>
    governancePost<DataSandboxRecord>('/tasks/mount', data),
  // 结果数据展示（仅脱敏后结果可返回行数据；表头携带数据源）
  viewResult: (taskId: string) =>
    governanceGet<DataSandboxRecord>('/tasks/results/view', { taskId }),
  // 血缘 / 预览
  lineage: (nodeId = '', datatableId = '') =>
    governanceGet<DataSandboxRecord[]>('/lineage', { nodeId, datatableId }),
  preview: (nodeId: string, datatableId: string, limit = 20) =>
    governanceGet<DataSandboxRecord>('/preview', { nodeId, datatableId, limit }),
};

// Z-05 数据开发（JAR/SQL/Python 计算任务）：独立前缀 /api/v1alpha1/data-dev
const devBase = '/api/v1alpha1/data-dev';

const dataComputeScope = () => {
  const query = new URLSearchParams(window.location.search);
  const projectId = query.get('projectId') || '';
  const sandboxId = query.get('sandboxId') || '';
  return { ...(projectId ? { projectId } : {}), ...(sandboxId ? { sandboxId } : {}) };
};

const devGet = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${devBase}${path}`, {
    method: 'GET',
    params: { ...dataComputeScope(), ...(params || {}) },
  });

const devPost = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${devBase}${path}`, {
    method: 'POST',
    data: { ...dataComputeScope(), ...(data || {}) },
  });

const devUpload = <T>(
  path: string,
  formData: FormData,
  onUploadProgress?: (percent: number) => void,
) =>
  request<DataSandboxResponse<T>>(`${devBase}${path}`, {
    method: 'POST',
    data: formData,
    ...(onUploadProgress ? { onUploadProgress } : {}),
  });

export const DataDevApi = {
  // 制品
  artifacts: (params?: DataSandboxRecord) =>
    devGet<DataSandboxRecord[]>('/artifacts', params),
  artifactDetail: (id: string) =>
    devGet<DataSandboxRecord>('/artifacts/detail', { id }),
  createArtifact: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/artifacts', data),
  updateArtifact: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/artifacts/update', data),
  deleteArtifact: (id: string) => devPost('/artifacts/delete', { id }),
  // 版本
  createVersion: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/artifacts/versions', data),
  uploadJarVersion: (
    artifactId: string,
    file: File,
    meta: DataSandboxRecord,
    onUploadProgress?: (percent: number) => void,
  ) => {
    const formData = new FormData();
    formData.append('artifactId', artifactId);
    formData.append('file', file);
    formData.append('paramsSchema', meta.paramsSchema || '[]');
    formData.append('defaultParams', meta.defaultParams || '{}');
    formData.append('description', meta.description || '');
    // 版本号用户手填（可选）：不填后端自动递增；填了需与已有版本不重复
    if (meta.version) formData.append('version', String(meta.version));
    return devUpload<DataSandboxRecord>(
      '/artifacts/versions/upload',
      formData,
      onUploadProgress,
    );
  },
  deleteVersion: (id: string) => devPost('/artifacts/versions/delete', { id }),
  versions: (artifactId: string) =>
    devGet<DataSandboxRecord[]>('/artifacts/versions', { artifactId }),
  versionDetail: (versionId: string) =>
    devGet<DataSandboxRecord>('/artifacts/versions/detail', { versionId }),
  downloadJar: async (versionId: string) => {
    const query = new URLSearchParams({ versionId });
    const response = await fetch(`${devBase}/artifacts/versions/download?${query}`, {
      credentials: 'include',
      headers: {
        'User-Token': localStorage.getItem('User-Token') || '',
        'Trace-Id': `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
    });
    if (!response.ok) throw new Error(`JAR 下载失败: HTTP ${response.status}`);
    return response.blob();
  },
  // 依赖白名单
  dependencies: (params?: DataSandboxRecord) =>
    devGet<DataSandboxRecord[]>('/dependencies', params),
  createDependency: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/dependencies', data),
  updateDependency: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/dependencies/update', data),
  deleteDependency: (id: string) => devPost('/dependencies/delete', { id }),
  // 任务
  tasks: (params?: DataSandboxRecord) => devGet<DataSandboxRecord[]>('/tasks', params),
  taskDetail: (id: string) => devGet<DataSandboxRecord>('/tasks/detail', { id }),
  submitTask: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/tasks/submit', data),
  submitSandboxTask: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/tasks/submit-sandbox', data),
  sandboxPreview: (sandboxId: string, tableName: string, limit = 10) =>
    devGet<DataSandboxRecord>('/tasks/sandbox-preview', {
      sandboxId,
      tableName,
      limit,
    }),
  cancelTask: (id: string) => devPost('/tasks/cancel', { id }),
  retryTask: (id: string) => devPost<DataSandboxRecord>('/tasks/retry', { id }),
  previewSource: (nodeId: string, datatableId: string, limit = 20) =>
    devGet<DataSandboxRecord>('/tasks/preview-source', { nodeId, datatableId, limit }),
  results: (nodeId = '') => devGet<DataSandboxRecord[]>('/tasks/results', { nodeId }),
  viewResult: (taskId: string) =>
    devGet<DataSandboxRecord>('/tasks/results/view', { taskId }),
  runLog: (taskId: string, attempt?: number) =>
    devGet<DataSandboxRecord>('/tasks/log', { taskId, attempt }),
  mountResult: (data: DataSandboxRecord) =>
    devPost<DataSandboxRecord>('/tasks/mount', data),
};

// Z-06 模型中心：/api/v1alpha1/models（模型注册/审批/测试）+ /api/v1alpha1/model-api（发布/凭证/调用）
const modelBase = '/api/v1alpha1/models';
const modelApiBase = '/api/v1alpha1/model-api';

const modelGet = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${modelBase}${path}`, {
    method: 'GET',
    params: { ...dataComputeScope(), ...(params || {}) },
  });

const modelPost = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${modelBase}${path}`, {
    method: 'POST',
    data: { ...dataComputeScope(), ...(data || {}) },
  });

const modelApiGet = <T>(path: string, params?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${modelApiBase}${path}`, { method: 'GET', params });

const modelApiPost = <T>(path: string, data?: Record<string, any>) =>
  request<DataSandboxResponse<T>>(`${modelApiBase}${path}`, {
    method: 'POST',
    data: data || {},
  });

export const DataModelApi = {
  /* 模型注册 */
  models: (params?: DataSandboxRecord) => modelGet<DataSandboxRecord[]>('', params),
  modelDetail: (id: string) => modelGet<DataSandboxRecord>('/detail', { id }),
  register: (data: DataSandboxRecord) =>
    modelPost<DataSandboxRecord>('/register', data),
  updateModel: (data: DataSandboxRecord) =>
    modelPost<DataSandboxRecord>('/update', data),
  deleteModel: (id: string) => modelPost('/delete', { id }),
  /* 审批 */
  submitApproval: (data: DataSandboxRecord) =>
    modelPost<DataSandboxRecord>('/approvals/submit', data),
  approvals: (params?: DataSandboxRecord) =>
    modelGet<DataSandboxRecord[]>('/approvals', params),
  approvalDetail: (id: string) =>
    modelGet<DataSandboxRecord>('/approvals/detail', { id }),
  approvalHistory: (id: string) =>
    modelGet<DataSandboxRecord[]>('/approvals/history', { id }),
  approvalAction: (data: DataSandboxRecord) =>
    modelPost<DataSandboxRecord>('/approvals/action', data),
  /* 测试 */
  executeTest: (data: DataSandboxRecord) =>
    modelPost<DataSandboxRecord>('/tests/execute', data),
  tests: (params?: DataSandboxRecord) =>
    modelGet<DataSandboxRecord[]>('/tests', params),
  testDetail: (id: string) => modelGet<DataSandboxRecord>('/tests/detail', { id }),
  testLog: (id: string, attempt?: number) =>
    modelGet<DataSandboxRecord>('/tests/log', { id, attempt }),
  cancelTest: (id: string) => modelPost<DataSandboxRecord>('/tests/cancel', { id }),
  retryTest: (id: string) => modelPost<DataSandboxRecord>('/tests/retry', { id }),
  /* API 发布 */
  createApi: (data: DataSandboxRecord) =>
    modelApiPost<DataSandboxRecord>('/create', data),
  /* 统一发布；MODEL 使用跨机构数据时先进入供数方审批，通过后才启用 */
  publish: (data: DataSandboxRecord) =>
    modelApiPost<DataSandboxRecord>('/publish', data),
  /* 制品(选版本) → API 一键发布：自动注册 APPROVED 模型 + 自动建 API */
  createApiFromArtifact: (data: DataSandboxRecord) =>
    modelApiPost<DataSandboxRecord>('/create-from-artifact', data),
  apis: (params?: DataSandboxRecord) =>
    modelApiGet<DataSandboxRecord[]>('/list', params),
  apiDetail: (id: string) => modelApiGet<DataSandboxRecord>('/detail', { id }),
  updateApi: (data: DataSandboxRecord) =>
    modelApiPost<DataSandboxRecord>('/update', data),
  regenerateSecret: (id: string) =>
    modelApiPost<DataSandboxRecord>('/regenerate-secret', { id }),
  enableApi: (id: string) => modelApiPost<DataSandboxRecord>('/enable', { id }),
  disableApi: (id: string) => modelApiPost<DataSandboxRecord>('/disable', { id }),
  deleteApi: (id: string) => modelApiPost('/delete', { id }),
  /* 调用（两路鉴权） */
  invokeWithCredential: (appId: string, secret: string, data: DataSandboxRecord) =>
    request<DataSandboxResponse<DataSandboxRecord>>(`${modelApiBase}/invoke`, {
      method: 'POST',
      data,
      headers: { 'X-APP-ID': appId, 'X-APP-SECRET': secret },
    }),
  invokeWithToken: (data: DataSandboxRecord) =>
    request<DataSandboxResponse<DataSandboxRecord>>(`${modelApiBase}/invoke`, {
      method: 'POST',
      data,
    }),
  /* 模型 API 供数方审批（我的申请 / 待我审批 / 详情 / 动作 / 撤回 / 在线调试） */
  approvalMine: (params?: DataSandboxRecord) =>
    modelApiGet<DataSandboxRecord[]>('/approvals/mine', params),
  approvalPending: (params?: DataSandboxRecord) =>
    modelApiGet<DataSandboxRecord[]>('/approvals/pending', params),
  modelApiApprovalDetail: (id: string) =>
    modelApiGet<DataSandboxRecord>('/approvals/detail', { id }),
  modelApiApprovalAction: (data: DataSandboxRecord) =>
    modelApiPost<DataSandboxRecord>('/approvals/action', data),
  modelApiApprovalCancel: (id: string) =>
    modelApiPost<DataSandboxRecord>('/approvals/cancel', { id }),
  modelApiApprovalTest: (data: DataSandboxRecord) =>
    modelApiPost<DataSandboxRecord>('/approvals/test', data),
};

export const responseData = <T>(response: DataSandboxResponse<T>, fallback: T): T => {
  if (response.status?.code !== 0) {
    throw new Error(response.status?.msg || '请求失败');
  }
  return response.data === undefined ? fallback : response.data;
};
