import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, message, Space, Table, Tag, Tabs, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { ConfidentialModelPanel } from '@/modules/confidential-compute/model-panel';
import type { TrustedDomain } from '@/security/crypto';
import { confidentialComputeAdapters } from '@/services/confidential-compute';
import { ConfidentialModelApi } from '@/services/confidential-models';

const statusColor = (status: string) => {
  if (status === 'ONLINE' || status === 'RUNNING') return 'success';
  if (status === 'FAULT' || status === 'DESTROYED' || status === 'REJECTED')
    return 'error';
  if (status === 'OFFLINE' || status === 'STOPPED') return 'default';
  return 'processing';
};

/** Customer model-package management and operator-safe runtime view. */
export const LlmConfidentialManagement = () => {
  const [domains, setDomains] = useState<TrustedDomain[]>([]);
  const [modelRefreshToken, setModelRefreshToken] = useState(0);
  const [runtimeRows, setRuntimeRows] = useState<
    Array<{
      deploymentId: string;
      modelId: string;
      modelName: string;
      version?: number;
      status: string;
      endpointPath: string;
      authorizationSessionId?: string;
      errorCode?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const domainRows = await confidentialComputeAdapters.api.listDomains();
      setDomains(domainRows.filter((item) => item.trustStatus !== 'blocked'));
      // 模型管理与运行查看在中心端并列展示，两份数据一起刷新。
      setRuntimeRows(await ConfidentialModelApi.runtimeInstances());
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '运行状态刷新失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  const refreshAll = useCallback(async () => {
    setModelRefreshToken((value) => value + 1);
    await refresh();
  }, [refresh]);

  return (
    <div style={{ padding: 24 }}>
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        align="start"
      >
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            大模型密态管理
          </Typography.Title>
          <Typography.Text type="secondary">
            模型包整体加密保存、审核发布、授权启动与受控推理
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void refreshAll()}
        >
          刷新
        </Button>
      </Space>
      <Alert
        showIcon
        type="info"
        message="模型包整体加密"
        description="模型包中的权重、架构配置、分词器和许可证均会作为一个整体加密上传；节点长期仅保存密文分块与加密清单。"
        style={{ marginBottom: 16 }}
      />
      <Tabs
        items={[
          {
            key: 'customer',
            label: '模型管理',
            children: (
              <ConfidentialModelPanel
                domains={domains}
                refreshToken={modelRefreshToken}
              />
            ),
          },
          {
            key: 'operator',
            label: '大模型运行查看',
            children: (
              <>
                <Alert
                  showIcon
                  type="warning"
                  message="计算平台只读视图"
                  description="此视图仅展示运行状态与受控端点，不展示模型权重、模型包内容、明文预览或调用 API Key。"
                  style={{ marginBottom: 16 }}
                />
                <Table
                  rowKey="deploymentId"
                  loading={loading}
                  locale={{ emptyText: '暂无已创建的运行实例' }}
                  dataSource={runtimeRows}
                  columns={[
                    { title: '模型', dataIndex: 'modelName' },
                    {
                      title: '版本',
                      dataIndex: 'version',
                      render: (value) => (value ? `v${value}` : '-'),
                    },
                    {
                      title: '运行实例',
                      dataIndex: 'deploymentId',
                      ellipsis: true,
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
                    },
                    {
                      title: '受控端点',
                      dataIndex: 'endpointPath',
                      ellipsis: true,
                    },
                    {
                      title: '故障信息',
                      dataIndex: 'errorCode',
                      render: (value) => value || '—',
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
