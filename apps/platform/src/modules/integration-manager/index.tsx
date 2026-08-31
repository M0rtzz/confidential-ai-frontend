import { CopyOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';

import {
  formatTime,
  MvpNotice,
  MvpPage,
  RefreshButton,
} from '@/modules/data-sandbox-mvp/common';
import styles from '@/modules/data-sandbox-mvp/index.less';
import { DataSandboxApi, responseData } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

export const IntegrationManagerComponent = () => {
  const [data, setData] = useState<DataSandboxRecord>({
    clients: [],
    webhooks: [],
    deliveries: [],
    oidc: {},
  });
  const [loading, setLoading] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [oidcMappingOpen, setOidcMappingOpen] = useState(false);
  const [credential, setCredential] = useState<DataSandboxRecord>();
  const [clientForm] = Form.useForm();
  const [webhookForm] = Form.useForm();
  const [oidcForm] = Form.useForm();
  const [oidcMappingForm] = Form.useForm();
  const [tenantForm] = Form.useForm();
  const [trustedForm] = Form.useForm();
  const [tenants, setTenants] = useState<DataSandboxRecord[]>([]);
  const [exchanges, setExchanges] = useState<DataSandboxRecord[]>([]);
  const [tenantSecret, setTenantSecret] = useState<DataSandboxRecord>();

  const copyText = async (text: string, label: string) => {
    if (!text) {
      message.error(`${label}为空，无法复制`);
      return;
    }
    try {
      if (!navigator.clipboard || !window.isSecureContext) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
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
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      message[copied ? 'success' : 'error'](
        copied ? `${label}已复制` : `${label}复制失败，请手动复制`,
      );
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = responseData(await DataSandboxApi.integrations(), {});
      setData(next);
      setTenants(responseData(await DataSandboxApi.tenants(), []));
      setExchanges(responseData(await DataSandboxApi.trustedExchanges(), []));
      oidcForm.setFieldsValue({
        issuer: next.oidc?.issuer,
        clientId: next.oidc?.client_id,
        scopes: next.oidc?.scopes,
        enabled: !!next.oidc?.enabled,
      });
    } catch (error: any) {
      message.error(error.message || '加载对接配置失败');
    } finally {
      setLoading(false);
    }
  }, [oidcForm]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <MvpPage
      title="系统对接"
      description="API 文档、调用凭证、回调、同步记录、失败重试与 OIDC 配置测试"
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <MvpNotice />
      <Tabs
        items={[
          {
            key: 'api',
            label: 'API 与凭证',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Descriptions column={2} title="OpenAPI 文档">
                    <Descriptions.Item label="Swagger UI">
                      <Typography.Link
                        href={data.openapi || '/swagger-ui/index.html'}
                        target="_blank"
                      >
                        打开接口文档
                      </Typography.Link>
                    </Descriptions.Item>
                    <Descriptions.Item label="OpenAPI JSON">
                      <Typography.Link
                        href={data.openapiJson || '/v3/api-docs'}
                        target="_blank"
                      >
                        下载定义
                      </Typography.Link>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
                <div style={{ marginBottom: 12, textAlign: 'right' }}>
                  <Button type="primary" onClick={() => setClientOpen(true)}>
                    创建调用凭证
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  dataSource={data.clients || []}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    { title: 'Client ID', dataIndex: 'client_id' },
                    { title: '权限范围', dataIndex: 'scopes' },
                    { title: '版本', dataIndex: 'secret_version' },
                    { title: '到期时间', dataIndex: 'expires_at', render: formatTime },
                    {
                      title: '状态',
                      dataIndex: 'enabled',
                      render: (v: number) => (
                        <Tag color={v ? 'success' : 'default'}>
                          {v ? '启用' : '已吊销'}
                        </Tag>
                      ),
                    },
                    { title: '创建时间', dataIndex: 'created_at', render: formatTime },
                    {
                      title: '操作',
                      render: (_: unknown, row: DataSandboxRecord) =>
                        !!row.enabled && (
                          <Space>
                            <Button
                              type="link"
                              onClick={async () => {
                                try {
                                  setCredential(
                                    responseData(
                                      await DataSandboxApi.rotateClient(row.id),
                                      {},
                                    ),
                                  );
                                  refresh();
                                } catch (error: any) {
                                  message.error(error.message);
                                }
                              }}
                            >
                              轮换
                            </Button>
                            <Button
                              danger
                              type="link"
                              onClick={async () => {
                                await DataSandboxApi.revokeClient(row.id);
                                message.success('凭证已吊销');
                                refresh();
                              }}
                            >
                              吊销
                            </Button>
                          </Space>
                        ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'webhook',
            label: 'Webhook 回调',
            children: (
              <>
                <div style={{ marginBottom: 12, textAlign: 'right' }}>
                  <Button type="primary" onClick={() => setWebhookOpen(true)}>
                    新增 Webhook
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  dataSource={data.webhooks || []}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    { title: '地址', dataIndex: 'url', ellipsis: true },
                    { title: '订阅事件', dataIndex: 'events' },
                    {
                      title: '状态',
                      dataIndex: 'enabled',
                      render: (v: number) => (
                        <Tag color={v ? 'success' : 'default'}>
                          {v ? '启用' : '停用'}
                        </Tag>
                      ),
                    },
                    {
                      title: '操作',
                      render: (_: unknown, row: DataSandboxRecord) => (
                        <Button
                          type="link"
                          onClick={async () => {
                            try {
                              const result = responseData(
                                await DataSandboxApi.testWebhook(row.id),
                                {},
                              );
                              message[
                                result.status === 'SUCCESS' ? 'success' : 'error'
                              ](`回调测试：${result.status}`);
                              refresh();
                            } catch (error: any) {
                              message.error(error.message);
                            }
                          }}
                        >
                          测试
                        </Button>
                      ),
                    },
                  ]}
                />
                <Typography.Title level={5}>同步与投递记录</Typography.Title>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={data.deliveries || []}
                  columns={[
                    { title: '事件', dataIndex: 'event_type' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (v: string) => (
                        <Tag color={v === 'SUCCESS' ? 'success' : 'error'}>{v}</Tag>
                      ),
                    },
                    { title: '尝试次数', dataIndex: 'attempts' },
                    { title: 'HTTP', dataIndex: 'response_code' },
                    { title: '时间', dataIndex: 'updated_at', render: formatTime },
                    {
                      title: '操作',
                      render: (_: unknown, row: DataSandboxRecord) =>
                        row.status === 'FAILED' && (
                          <Button
                            type="link"
                            onClick={async () => {
                              await DataSandboxApi.retryDelivery(row.id);
                              message.success('已执行重试');
                              refresh();
                            }}
                          >
                            重试
                          </Button>
                        ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'tenant',
            label: '租户与可信交换',
            children: (
              <>
                <Card
                  size="small"
                  title="租户开通与自动部署"
                  style={{ marginBottom: 16 }}
                >
                  <Form
                    form={tenantForm}
                    layout="inline"
                    onFinish={async (values) => {
                      try {
                        const result = responseData(
                          await DataSandboxApi.openTenant(values),
                          {},
                        );
                        setTenantSecret(result);
                        tenantForm.resetFields();
                        message.success('租户已开通');
                        refresh();
                      } catch (error: any) {
                        message.error(error.message);
                      }
                    }}
                  >
                    <Form.Item
                      name="name"
                      label="租户名称"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="实验室租户" />
                    </Form.Item>
                    <Form.Item name="ownerId" label="机构 ID">
                      <Input placeholder="默认当前机构" />
                    </Form.Item>
                    <Form.Item name="cpuCores" label="CPU">
                      <Input placeholder="4" />
                    </Form.Item>
                    <Form.Item name="memoryGb" label="内存 GB">
                      <Input placeholder="16" />
                    </Form.Item>
                    <Form.Item name="storageGb" label="存储 GB">
                      <Input placeholder="100" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">
                      开通租户
                    </Button>
                  </Form>
                  <Table
                    style={{ marginTop: 16 }}
                    rowKey="id"
                    size="small"
                    dataSource={tenants}
                    columns={[
                      { title: '名称', dataIndex: 'name' },
                      { title: '机构', dataIndex: 'owner_id' },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        render: (v: string) => (
                          <Tag color={v === 'ACTIVE' ? 'success' : 'processing'}>
                            {v}
                          </Tag>
                        ),
                      },
                      {
                        title: '规格',
                        render: (_: unknown, row: DataSandboxRecord) =>
                          `${row.cpu_cores} CPU / ${row.memory_gb} GB / ${row.storage_gb} GB`,
                      },
                      {
                        title: '操作',
                        render: (_: unknown, row: DataSandboxRecord) => (
                          <Space>
                            <Button
                              size="small"
                              onClick={async () => {
                                await DataSandboxApi.deployTenant({ tenantId: row.id });
                                message.success('部署已提交');
                                refresh();
                              }}
                            >
                              部署
                            </Button>
                            <Button
                              size="small"
                              onClick={async () => {
                                const bill = responseData(
                                  await DataSandboxApi.calculateBilling({
                                    tenantId: row.id,
                                  }),
                                  {},
                                );
                                message.success(
                                  `费用已计算：${bill.amount} ${bill.currency}`,
                                );
                                refresh();
                              }}
                            >
                              计费
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
                <Card size="small" title="可信平台交换（签名、验签、幂等）">
                  <Form
                    form={trustedForm}
                    layout="inline"
                    onFinish={async (values) => {
                      try {
                        responseData(await DataSandboxApi.trustedPush(values), {});
                        message.success('数据推送已记录');
                        trustedForm.resetFields();
                        await refresh();
                      } catch (error: any) {
                        message.error(error.message);
                      }
                    }}
                  >
                    <Form.Item
                      name="tenantId"
                      label="租户 ID"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="ten-..." />
                    </Form.Item>
                    <Form.Item
                      name="eventType"
                      label="事件"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="data.push" />
                    </Form.Item>
                    <Form.Item
                      name="idempotencyKey"
                      label="幂等键"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="request-001" />
                    </Form.Item>
                    <Form.Item name="payload" label="数据">
                      <Input placeholder='{"dataset":"demo"}' />
                    </Form.Item>
                    <Form.Item name="signingSecret" label="签名密钥">
                      <Input.Password placeholder="租户开通时生成的密钥" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">
                      签名推送
                    </Button>
                  </Form>
                  <Table
                    style={{ marginTop: 16 }}
                    rowKey="id"
                    size="small"
                    dataSource={exchanges}
                    columns={[
                      { title: '事件', dataIndex: 'event_type' },
                      { title: '方向', dataIndex: 'direction' },
                      { title: '幂等键', dataIndex: 'idempotency_key' },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        render: (v: string) => (
                          <Tag color={v === 'SUCCESS' ? 'success' : 'error'}>{v}</Tag>
                        ),
                      },
                      {
                        title: '签名值（非密钥）',
                        dataIndex: 'signature',
                        render: (value: string) => (
                          <Space size={4}>
                            <Typography.Text
                              code
                              title={value}
                              style={{ maxWidth: 180 }}
                              ellipsis
                            >
                              {value
                                ? `${value.slice(0, 10)}...${value.slice(-8)}`
                                : '-'}
                            </Typography.Text>
                            {!!value && (
                              <Button
                                aria-label="复制签名值"
                                icon={<CopyOutlined />}
                                size="small"
                                type="text"
                                onClick={() => copyText(value, '签名值')}
                              />
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'oidc',
            label: 'SSO / OIDC',
            children: (
              <Card title="OIDC 配置与发现测试">
                <Alert
                  type="info"
                  showIcon
                  message="OIDC Discovery 与角色映射分别配置；启用前应在身份提供方登记回调地址并完成登录联调。"
                  style={{ marginBottom: 16 }}
                />
                <Form
                  form={oidcForm}
                  layout="vertical"
                  onFinish={async (values) => {
                    try {
                      responseData(await DataSandboxApi.saveOidc(values), {});
                      message.success('OIDC 配置已保存');
                      refresh();
                    } catch (error: any) {
                      message.error(error.message);
                    }
                  }}
                >
                  <Form.Item
                    name="issuer"
                    label="Issuer URL"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="https://idp.example.com/realms/data" />
                  </Form.Item>
                  <Form.Item name="clientId" label="Client ID">
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="clientSecret"
                    label={`Client Secret${
                      data.oidc?.has_client_secret ? '（已配置，留空不修改）' : ''
                    }`}
                  >
                    <Input.Password />
                  </Form.Item>
                  <Form.Item name="scopes" label="Scopes">
                    <Input />
                  </Form.Item>
                  <Form.Item name="enabled" label="启用配置" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit">
                      保存配置
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const result = responseData(
                            await DataSandboxApi.testOidc(),
                            {},
                          );
                          message[result.status === 'SUCCESS' ? 'success' : 'error'](
                            result.message || result.status,
                          );
                          refresh();
                        } catch (error: any) {
                          message.error(error.message);
                        }
                      }}
                    >
                      测试连接
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const result = responseData(
                            await DataSandboxApi.oidcLogin(
                              `${window.location.origin}/api/v1alpha1/data-sandbox/integrations/oidc/callback`,
                            ),
                            {},
                          );
                          if (result.authorizationUrl) {
                            window.location.assign(result.authorizationUrl);
                          }
                        } catch (error: any) {
                          message.error(error.message);
                        }
                      }}
                    >
                      发起 OIDC 登录
                    </Button>
                  </Space>
                </Form>
                <pre className={styles.code}>
                  {data.oidc?.discovery_message || '尚未执行 Discovery 测试'}
                </pre>
                <div style={{ margin: '20px 0 12px', textAlign: 'right' }}>
                  <Button type="primary" onClick={() => setOidcMappingOpen(true)}>
                    新增权限映射
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={data.oidcMappings || []}
                  columns={[
                    { title: '声明字段', dataIndex: 'claim_name' },
                    { title: '声明值', dataIndex: 'claim_value' },
                    { title: '平台角色', dataIndex: 'platform_role' },
                    { title: '机构 ID', dataIndex: 'owner_id' },
                    {
                      title: '状态',
                      dataIndex: 'enabled',
                      render: (value: number) => (
                        <Tag color={value ? 'success' : 'default'}>
                          {value ? '启用' : '停用'}
                        </Tag>
                      ),
                    },
                    {
                      title: '操作',
                      render: (_: unknown, row: DataSandboxRecord) => (
                        <Button
                          danger
                          type="link"
                          onClick={() =>
                            Modal.confirm({
                              title: '删除该 OIDC 权限映射？',
                              onOk: async () => {
                                await DataSandboxApi.deleteOidcMapping(row.id);
                                message.success('权限映射已删除');
                                refresh();
                              },
                            })
                          }
                        >
                          删除
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="租户签名密钥（仅显示一次）"
        open={!!tenantSecret}
        onCancel={() => setTenantSecret(undefined)}
        footer={
          <Button type="primary" onClick={() => setTenantSecret(undefined)}>
            我已保存
          </Button>
        }
      >
        <Alert
          type="warning"
          showIcon
          message="请将该密钥配置到可信数据流通平台，关闭后无法再次查看。"
        />
        <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="Tenant ID">
            <Typography.Text code>{tenantSecret?.id || ''}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Signing Secret">
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password readOnly value={tenantSecret?.signingSecret || ''} />
              <Button
                icon={<CopyOutlined />}
                onClick={() => copyText(tenantSecret?.signingSecret || '', '签名密钥')}
              >
                复制
              </Button>
            </Space.Compact>
          </Descriptions.Item>
        </Descriptions>
      </Modal>
      <Modal
        title="创建 API 调用凭证"
        open={clientOpen}
        onCancel={() => setClientOpen(false)}
        onOk={() => clientForm.submit()}
      >
        <Form
          form={clientForm}
          layout="vertical"
          initialValues={{ scopes: 'sandbox:read sandbox:write', validityDays: 90 }}
          onFinish={async (values) => {
            try {
              const result = responseData(
                await DataSandboxApi.createClient(values),
                {},
              );
              setCredential(result);
              setClientOpen(false);
              clientForm.resetFields();
              refresh();
            } catch (error: any) {
              message.error(error.message);
            }
          }}
        >
          <Form.Item name="name" label="凭证名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="scopes" label="权限范围">
            <Input />
          </Form.Item>
          <Form.Item name="validityDays" label="有效期（天）">
            <InputNumber min={1} max={3650} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="调用凭证（仅显示一次）"
        open={!!credential}
        onCancel={() => setCredential(undefined)}
        footer={
          <Button type="primary" onClick={() => setCredential(undefined)}>
            我已保存
          </Button>
        }
      >
        <Alert type="warning" showIcon message="关闭后无法再次查看 Client Secret。" />
        <pre className={styles.code}>{`Client ID: ${
          credential?.client_id || ''
        }\nClient Secret: ${credential?.client_secret || ''}`}</pre>
      </Modal>
      <Modal
        title="新增 OIDC 权限映射"
        open={oidcMappingOpen}
        onCancel={() => setOidcMappingOpen(false)}
        onOk={() => oidcMappingForm.submit()}
      >
        <Form
          form={oidcMappingForm}
          layout="vertical"
          initialValues={{ claimName: 'groups', platformRole: 'USER', enabled: true }}
          onFinish={async (values) => {
            try {
              await DataSandboxApi.saveOidcMapping(values);
              message.success('OIDC 权限映射已保存');
              setOidcMappingOpen(false);
              oidcMappingForm.resetFields();
              refresh();
            } catch (error: any) {
              message.error(error.message);
            }
          }}
        >
          <Form.Item name="claimName" label="声明字段" rules={[{ required: true }]}>
            <Input placeholder="groups" />
          </Form.Item>
          <Form.Item name="claimValue" label="声明值" rules={[{ required: true }]}>
            <Input placeholder="data-sandbox-admins" />
          </Form.Item>
          <Form.Item name="platformRole" label="平台角色" rules={[{ required: true }]}>
            <Input placeholder="ADMIN / OPERATOR / USER" />
          </Form.Item>
          <Form.Item name="ownerId" label="机构 ID">
            <Input />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="新增 Webhook"
        open={webhookOpen}
        onCancel={() => setWebhookOpen(false)}
        onOk={() => webhookForm.submit()}
      >
        <Form
          form={webhookForm}
          layout="vertical"
          initialValues={{ events: 'sandbox.created,model.published', enabled: true }}
          onFinish={async (values) => {
            try {
              responseData(await DataSandboxApi.saveWebhook(values), {});
              message.success('Webhook 已保存');
              setWebhookOpen(false);
              webhookForm.resetFields();
              refresh();
            } catch (error: any) {
              message.error(error.message);
            }
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="url"
            label="回调地址"
            rules={[{ required: true, type: 'url' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="events" label="事件（逗号分隔，* 表示全部）">
            <Input />
          </Form.Item>
          <Form.Item name="secret" label="签名密钥">
            <Input.Password />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </MvpPage>
  );
};
