import { CopyOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatTime, MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { DataDevApi, DataModelApi, responseData } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';
import {
  SystemUserManagementApi,
  type ManagedUserOption,
} from '@/services/system-user-management';

/** 受控 API 调用端点（与后端 ModelApiController 一致）。 */
const INVOKE_ENDPOINT = '/api/v1alpha1/model-api/invoke';

const apiStatusLabels: Record<string, string> = {
  ENABLED: '启用',
  DISABLED: '停用',
  PENDING: '供数方审批中',
  REJECTED: '已驳回',
};

const apiStatusColors: Record<string, string> = {
  ENABLED: 'success',
  DISABLED: 'default',
  PENDING: 'processing',
  REJECTED: 'error',
};

const artifactTypeLabels: Record<string, string> = {
  JAR: 'JAR',
  PYTHON: 'Python',
  SQL: 'SQL',
  FUNCTION: '函数',
};

/** 解析调用示例：JSON 数组 → {rows:[...]}；{"rows":[...]} 直通；对象 → {rows:[对象]}。 */
const parseDebugPayload = (input: string): DataSandboxRecord | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { rows: parsed };
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as DataSandboxRecord;
    if (Array.isArray(obj.rows)) return obj;
    return { rows: [parsed] };
  }
  return null;
};

/** HTTPS 优先使用 Clipboard API，HTTP 部署回退到隐藏文本域复制。 */
const copyText = async (text: string, label: string) => {
  try {
    if (!navigator.clipboard || !window.isSecureContext) {
      throw new Error('Clipboard API is unavailable');
    }
    await navigator.clipboard.writeText(text);
    message.success(`${label} 已复制`);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(textarea);
    }
    message[copied ? 'success' : 'error'](
      copied ? `${label} 已复制` : `${label} 复制失败，请手动复制`,
    );
  }
};

export const ModelCenterComponent = ({ context }: { context: DataSandboxRecord }) => {
  /* ------------------------------- API 列表 ------------------------------- */
  const [apis, setApis] = useState<DataSandboxRecord[]>([]);
  const [apisLoading, setApisLoading] = useState(false);

  /* ------------------------------- 发布弹窗 ------------------------------- */
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishForm] = Form.useForm();
  const [sourceType, setSourceType] = useState<'ARTIFACT' | 'MODEL'>('ARTIFACT');
  const [artifacts, setArtifacts] = useState<DataSandboxRecord[]>([]);
  const [publishableModels, setPublishableModels] = useState<DataSandboxRecord[]>([]);

  /* ------------------------------- API 详情 ------------------------------- */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DataSandboxRecord>();
  const [updateForm] = Form.useForm();
  const [debugInput, setDebugInput] = useState('[\n  {"age": 28, "balance": 45000}\n]');
  const [authorizedUserOptions, setAuthorizedUserOptions] = useState<
    ManagedUserOption[]
  >([]);
  const [authorizedUsersLoading, setAuthorizedUsersLoading] = useState(false);

  const refreshApis = useCallback(async () => {
    setApisLoading(true);
    try {
      setApis(
        responseData(await DataModelApi.apis({ sandboxId: context.sandbox.id }), []),
      );
    } catch (error: any) {
      message.error(error.message || '加载 API 失败');
    } finally {
      setApisLoading(false);
    }
  }, [context.sandbox.id]);

  const refreshAuthorizedUserOptions = useCallback(async () => {
    setAuthorizedUsersLoading(true);
    try {
      setAuthorizedUserOptions(await SystemUserManagementApi.authorizationOptions());
    } catch (error: any) {
      message.error(error.message || '加载授权用户失败');
    } finally {
      setAuthorizedUsersLoading(false);
    }
  }, []);
  useEffect(() => {
    refreshApis();
  }, [refreshApis]);

  useEffect(() => {
    if (publishOpen || detailOpen) {
      refreshAuthorizedUserOptions();
    }
  }, [publishOpen, detailOpen, refreshAuthorizedUserOptions]);

  /* ------------------------------- 发布来源加载 ------------------------------- */
  const loadPublishSources = useCallback(async () => {
    try {
      const [artifactRes, modelRes] = await Promise.all([
        DataDevApi.artifacts({}),
        DataModelApi.models({}),
      ]);
      const arts = responseData(artifactRes, []);
      const withVersions = await Promise.all(
        arts.map(async (a) => {
          try {
            return {
              ...a,
              versions: responseData(await DataDevApi.versions(a.id), []),
            };
          } catch {
            return { ...a, versions: [] };
          }
        }),
      );
      setArtifacts(withVersions);
      setPublishableModels(
        responseData(modelRes, []).filter(
          (m) =>
            m.canvasModelSaved && (m.status === 'APPROVED' || m.status === 'PUBLISHED'),
        ),
      );
    } catch (error: any) {
      message.error(error.message || '加载发布来源失败');
    }
  }, []);

  useEffect(() => {
    if (publishOpen) {
      publishForm.resetFields();
      setSourceType('ARTIFACT');
      loadPublishSources();
    }
  }, [publishOpen, publishForm, loadPublishSources]);

  const latestVersion = (
    versions: DataSandboxRecord[],
  ): DataSandboxRecord | undefined => {
    if (!versions || !versions.length) return undefined;
    return [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0];
  };

  const artifactOptions = useMemo(
    () =>
      artifacts.map((a) => ({
        value: a.id,
        label: `${a.name} (${artifactTypeLabels[a.type] || a.type} - v${
          latestVersion(a.versions)?.version ?? '?'
        })`,
      })),
    [artifacts],
  );

  const modelOptions = publishableModels.map((m) => ({
    value: m.id,
    label: `${m.name} (v${m.version})`,
  }));

  const sourceId = Form.useWatch('sourceId', publishForm);
  const sourceVersions = useMemo(
    () =>
      (artifacts.find((a) => a.id === sourceId)?.versions || [])
        .slice()
        .sort((a, b) => Number(b.version) - Number(a.version)),
    [artifacts, sourceId],
  );

  const onSourceChange = (value: string) => {
    if (sourceType === 'ARTIFACT') {
      const art = artifacts.find((a) => a.id === value);
      if (art) {
        publishForm.setFieldValue('name', art.name);
        publishForm.setFieldValue('version', latestVersion(art.versions)?.id);
      }
    } else {
      const m = publishableModels.find((mm) => mm.id === value);
      if (m) publishForm.setFieldValue('name', m.name);
    }
  };

  /* ------------------------------- 发布 / 详情操作 ------------------------------- */

  const submitPublish = async () => {
    const values = await publishForm.validateFields();
    const range = values.validRange as [Dayjs, Dayjs] | undefined;
    try {
      const api = responseData(
        await DataModelApi.publish({
          sourceType,
          sourceId: values.sourceId,
          version: sourceType === 'ARTIFACT' ? values.version : undefined,
          apiName: values.name,
          description: values.description || '',
          authUsers: values.authUsers || [],
          ipWhitelist: values.ipWhitelist || [],
          validFrom: range?.[0]?.format('YYYY-MM-DD HH:mm:ss') || '',
          validTo: range?.[1]?.format('YYYY-MM-DD HH:mm:ss') || '',
        }),
        {},
      );
      if (api.approvalRequired || api.status === 'PENDING') {
        // 模型使用了供数方数据：先提交供数方审批，审批通过后自动发布为 API
        message.success(
          api.notice ||
            '已提交供数方审批，审批通过后将自动发布为 API，请到「模型审批管理」查看',
          4,
        );
        setPublishOpen(false);
        refreshApis();
        return;
      }
      message.success('API 已发布');
      setPublishOpen(false);
      refreshApis();
      setDetailItem(api);
      updateForm.setFieldsValue({
        authorizedUsers: Array.isArray(api.authorized_users)
          ? api.authorized_users
          : values.authUsers || [],
        ipWhitelist: Array.isArray(api.ip_whitelist)
          ? api.ip_whitelist
          : values.ipWhitelist || [],
        validRange: range || null,
        description: api.description || values.description || '',
      });
      setDetailOpen(true);
    } catch (error: any) {
      message.error(error.message || '发布失败');
    }
  };

  const toRange = (from?: string, to?: string): [Dayjs, Dayjs] | null => {
    const f = from ? dayjs(from) : null;
    const t = to ? dayjs(to) : null;
    if (!f && !t) return null;
    return [f, t] as [Dayjs, Dayjs];
  };

  const openDetail = async (row: DataSandboxRecord) => {
    try {
      const detail = responseData(await DataModelApi.apiDetail(row.id), {});
      setDetailItem(detail);
      setDetailOpen(true);
      updateForm.setFieldsValue({
        authorizedUsers: Array.isArray(detail.authorized_users)
          ? detail.authorized_users
          : [],
        ipWhitelist: Array.isArray(detail.ip_whitelist) ? detail.ip_whitelist : [],
        validRange: toRange(detail.valid_from, detail.valid_to),
        description: detail.description || '',
      });
    } catch (error: any) {
      message.error(error.message || '加载 API 详情失败');
    }
  };

  const refreshDetail = async (id: string) => {
    if (!id) return;
    try {
      setDetailItem(responseData(await DataModelApi.apiDetail(id), {}));
    } catch (error: any) {
      message.error(error.message || '刷新详情失败');
    }
  };

  const updateApiSettings = async () => {
    const item = detailItem;
    if (!item) return;
    const values = await updateForm.validateFields();
    const range = values.validRange as [Dayjs, Dayjs] | undefined;
    try {
      const detail = responseData(
        await DataModelApi.updateApi({
          id: item.id,
          description: values.description,
          authorizedUsers: values.authorizedUsers || [],
          ipWhitelist: values.ipWhitelist || [],
          validFrom: range?.[0]?.format('YYYY-MM-DD HH:mm:ss') || '',
          validTo: range?.[1]?.format('YYYY-MM-DD HH:mm:ss') || '',
        }),
        {},
      );
      setDetailItem(detail);
      message.success('API 已更新');
      refreshApis();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const toggleApi = async (row: DataSandboxRecord, enable: boolean) => {
    try {
      await (enable ? DataModelApi.enableApi(row.id) : DataModelApi.disableApi(row.id));
      message.success(enable ? '已启用' : '已停用');
      refreshApis();
      refreshDetail(row.id);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const regenerateSecret = async (row: DataSandboxRecord) => {
    Modal.confirm({
      title: '重发调用密钥？',
      content: '确认后旧密钥立即失效。新密钥仅显示一次，请生成后立即复制并妥善保存。',
      okText: '确认重发',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const detail = responseData(await DataModelApi.regenerateSecret(row.id), {});
          setDetailItem(detail);
          message.success('新密钥已生成，请立即复制保存');
        } catch (error: any) {
          message.error(error.message || '重发失败');
        }
      },
    });
  };

  const deleteApi = async (row: DataSandboxRecord) => {
    Modal.confirm({
      title: `删除 API ${row.name}？`,
      onOk: async () => {
        try {
          await DataModelApi.deleteApi(row.id);
          message.success('API 已删除');
          setDetailOpen(false);
          refreshApis();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  /* ------------------------------- 渲染辅助 ------------------------------- */

  const endpoint = `${window.location.origin}${INVOKE_ENDPOINT}`;

  const sourceLabel = (row: DataSandboxRecord): string => {
    const m = row.model as DataSandboxRecord | undefined;
    if (!m) return '-';
    const type = artifactTypeLabels[m.artifact_type] || m.artifact_type || '';
    return `${m.artifact_name || m.name || '-'} (${type} - v${
      m.artifact_version_no ?? m.version ?? '?'
    })`;
  };

  const curlText = useMemo(() => {
    const item = detailItem;
    if (!item?.app_id) return '';
    const payload = parseDebugPayload(debugInput);
    const body = payload ? JSON.stringify(payload) : '{"rows":[]}';
    if (item.secret) {
      return [
        `curl -X POST '${endpoint}'`,
        `  -H 'Content-Type: application/json'`,
        `  -H 'X-APP-ID: ${item.app_id}'`,
        `  -H 'X-APP-SECRET: ${item.secret}'`,
        `  -d '${body}'`,
      ].join(' \\\n');
    }
    return [
      `curl -X POST '${endpoint}'`,
      `  -H 'Content-Type: application/json'`,
      `  -H 'User-Token: <你的登录令牌>'`,
      `  -d '${JSON.stringify({ appId: item.app_id, ...(payload || {}) })}'`,
    ].join(' \\\n');
  }, [detailItem, debugInput, endpoint]);

  const apiColumns = [
    {
      title: 'API',
      dataIndex: 'name',
      render: (v: string, row: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(row)}>
            <strong>{v}</strong>
          </Button>
          <span style={{ color: '#888' }}>{row.app_id}</span>
        </Space>
      ),
    },
    {
      title: '来源',
      render: (_: unknown, row: DataSandboxRecord) => sourceLabel(row),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => (
        <Tag color={apiStatusColors[v]}>{apiStatusLabels[v] || v}</Tag>
      ),
    },
    {
      title: '调用次数',
      dataIndex: 'call_count',
      render: (v: unknown) => Number(v || 0),
    },
    { title: '最近调用', dataIndex: 'last_called_at', render: formatTime },
    {
      title: '有效时间',
      render: (_: unknown, row: DataSandboxRecord) =>
        `${row.valid_from || '-'} ~ ${row.valid_to || '-'}`,
    },
    { title: '创建人', dataIndex: 'created_by' },
    { title: '创建时间', dataIndex: 'created_at', render: formatTime },
    {
      title: '操作',
      width: 220,
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(row)}>
            详情
          </Button>
          {row.status === 'ENABLED' || row.status === 'DISABLED' ? (
            <>
              <Button
                type="link"
                onClick={() => toggleApi(row, row.status !== 'ENABLED')}
              >
                {row.status === 'ENABLED' ? '停用' : '启用'}
              </Button>
              <Button type="link" onClick={() => regenerateSecret(row)}>
                重发密钥
              </Button>
            </>
          ) : (
            <Button type="link" disabled onClick={() => openDetail(row)}>
              {row.status === 'REJECTED' ? '已驳回' : '审批中'}
            </Button>
          )}
          <Button type="link" danger onClick={() => deleteApi(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const item = detailItem;
  const authorizedUserSelectOptions = authorizedUserOptions.map((user) => ({
    value: user.account,
    label:
      user.displayName === user.account
        ? user.account
        : `${user.displayName}（${user.account}）`,
  }));

  return (
    <MvpPage
      title="沙箱智能建模：自定义算法 / API 发布"
      extra={
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              publishForm.resetFields();
              setPublishOpen(true);
            }}
          >
            发布 API
          </Button>
          <RefreshButton loading={apisLoading} onClick={refreshApis} />
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={apisLoading}
        dataSource={apis}
        scroll={{ x: 1200 }}
        columns={apiColumns}
      />

      {/* 发布为受控 API */}
      <Modal
        title="发布为受控 API"
        open={publishOpen}
        onOk={submitPublish}
        onCancel={() => setPublishOpen(false)}
        destroyOnClose
        width={600}
      >
        <Form form={publishForm} layout="vertical">
          <Form.Item label="发布来源">
            <Radio.Group
              value={sourceType}
              onChange={(e) => {
                setSourceType(e.target.value);
                publishForm.resetFields(['sourceId', 'version', 'name']);
              }}
            >
              <Radio.Button value="ARTIFACT">开发制品 (Artifact)</Radio.Button>
              <Radio.Button value="MODEL">模型 (Model)</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {sourceType === 'ARTIFACT' ? (
            <>
              <Form.Item
                name="sourceId"
                label="选择制品"
                rules={[{ required: true, message: '请选择制品' }]}
              >
                <Select
                  placeholder="选择 JAR / Python / SQL / 函数制品"
                  options={artifactOptions}
                  onChange={onSourceChange}
                />
              </Form.Item>
              <Form.Item
                name="version"
                label="制品版本"
                rules={[{ required: true, message: '请选择版本' }]}
              >
                <Select
                  placeholder="默认选中最新版本"
                  options={sourceVersions.map((v) => ({
                    value: v.id,
                    label: `v${v.version}${v.description ? ` · ${v.description}` : ''}`,
                  }))}
                />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="sourceId"
              label="选择模型"
              rules={[{ required: true, message: '请选择模型' }]}
            >
              <Select
                placeholder="仅画布已保存且已通过（APPROVED/PUBLISHED）的模型"
                options={modelOptions}
                onChange={onSourceChange}
              />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label="API 名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="自动取自来源名称，可修改" />
          </Form.Item>
          <Form.Item name="authUsers" label="授权用户（空=仅凭据调用）">
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="请选择已启用用户"
              options={authorizedUserSelectOptions}
              loading={authorizedUsersLoading}
            />
          </Form.Item>
          <Form.Item name="ipWhitelist" label="IP 白名单（空=任意 IP；支持 CIDR）">
            <Select mode="tags" placeholder="如 10.0.0.0/8、1.2.3.4" open={false} />
          </Form.Item>
          <Form.Item name="validRange" label="生效 / 失效时间（空=不限）">
            <DatePicker.RangePicker
              showTime={{ format: 'HH:mm:ss' }}
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: '100%' }}
              presets={[
                { label: '最近 30 天', value: [dayjs(), dayjs().add(30, 'day')] },
                { label: '最近 90 天', value: [dayjs(), dayjs().add(90, 'day')] },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* API 详情 */}
      <Drawer
        title="API 详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={760}
      >
        {item && (
          <>
            <Descriptions
              column={2}
              size="small"
              bordered
              items={[
                { key: 'name', label: '名称', children: item.name },
                { key: 'source', label: '来源', children: sourceLabel(item) },
                {
                  key: 'endpoint',
                  label: 'API Endpoint',
                  children: (
                    <Typography.Text copyable={{ text: endpoint }}>
                      {endpoint}
                    </Typography.Text>
                  ),
                },
                {
                  key: 'app',
                  label: 'App ID',
                  children: (
                    <Typography.Text copyable={{ text: item.app_id }}>
                      {item.app_id}
                    </Typography.Text>
                  ),
                },
                {
                  key: 'secret',
                  label: '调用密钥',
                  children: item.secret ? (
                    <Typography.Text copyable={{ text: item.secret }} code>
                      {item.secret}
                    </Typography.Text>
                  ) : (
                    <span style={{ color: '#888' }}>已隐藏（发布/重发时展示一次）</span>
                  ),
                },
                {
                  key: 'status',
                  label: '状态',
                  children: (
                    <Tag color={apiStatusColors[item.status]}>
                      {apiStatusLabels[item.status] || item.status}
                    </Tag>
                  ),
                },
                {
                  key: 'calls',
                  label: '调用次数 / 最近',
                  children: `${Number(item.call_count || 0)} 次 · ${
                    item.last_called_at ? formatTime(item.last_called_at) : '未调用'
                  }`,
                },
                {
                  key: 'valid',
                  label: '有效时间',
                  children: `${item.valid_from || '-'} ~ ${item.valid_to || '-'}`,
                },
                {
                  key: 'ip',
                  label: 'IP 白名单',
                  children: Array.isArray(item.ip_whitelist)
                    ? item.ip_whitelist.join(', ') || '任意 IP'
                    : item.ip_whitelist || '任意 IP',
                },
                {
                  key: 'users',
                  label: '授权用户',
                  children: Array.isArray(item.authorized_users)
                    ? item.authorized_users.join(', ') || '仅凭据调用'
                    : item.authorized_users || '仅凭据调用',
                },
                {
                  key: 'creator',
                  label: '创建人 / 时间',
                  children: `${item.created_by} · ${formatTime(item.created_at)}`,
                },
              ]}
            />
            <Space style={{ marginTop: 12 }}>
              {item.status === 'ENABLED' ? (
                <Button onClick={() => toggleApi(item, false)}>停用</Button>
              ) : (
                <Button type="primary" onClick={() => toggleApi(item, true)}>
                  启用
                </Button>
              )}
              <Button onClick={() => regenerateSecret(item)}>重发密钥</Button>
              <Button danger onClick={() => deleteApi(item)}>
                删除
              </Button>
            </Space>

            <Typography.Title level={5} style={{ marginTop: 16 }}>
              授权 / 白名单设置
            </Typography.Title>
            <Form form={updateForm} layout="vertical">
              <Form.Item
                name="authorizedUsers"
                label="授权用户（空=仅凭据调用；凭证调用者不受约束）"
              >
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  placeholder="请选择已启用用户"
                  options={authorizedUserSelectOptions}
                  loading={authorizedUsersLoading}
                />
              </Form.Item>
              <Form.Item name="ipWhitelist" label="IP 白名单（空=任意 IP；支持 CIDR）">
                <Select mode="tags" placeholder="IP 或 CIDR" open={false} />
              </Form.Item>
              <Form.Item name="validRange" label="生效 / 失效时间（空=不限）">
                <DatePicker.RangePicker
                  showTime={{ format: 'HH:mm:ss' }}
                  format="YYYY-MM-DD HH:mm:ss"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Button type="primary" onClick={updateApiSettings}>
                保存设置
              </Button>
            </Form>

            <Typography.Title level={5} style={{ marginTop: 16 }}>
              开发者调用指南
            </Typography.Title>
            <Space style={{ marginBottom: 4 }}>
              <Typography.Text type="secondary">
                可直接复制到终端执行；参数即上方调试输入
              </Typography.Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyText(curlText, 'cURL')}
              >
                复制 cURL
              </Button>
            </Space>
            <pre
              style={{
                background: '#f6f8fa',
                padding: 12,
                borderRadius: 6,
                maxHeight: 200,
                overflow: 'auto',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {curlText}
            </pre>

            <Typography.Title level={5} style={{ marginTop: 16 }}>
              调用参数示例
            </Typography.Title>
            <Typography.Text type="secondary">
              输入 JSON 数组或 {'{"rows": [...]}'}，用于生成上方 cURL 示例
            </Typography.Text>
            <Input.TextArea
              rows={5}
              value={debugInput}
              onChange={(e) => setDebugInput(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}
              placeholder={'[{"age": 28, "balance": 45000}]'}
            />
          </>
        )}
      </Drawer>
    </MvpPage>
  );
};
