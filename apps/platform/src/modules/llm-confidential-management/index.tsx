import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Space, Table, Tag, Tabs, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { ConfidentialModelPanel } from '@/modules/confidential-compute/model-panel';
import type { TrustedDomain } from '@/security/crypto';
import { confidentialComputeAdapters } from '@/services/confidential-compute';
import {
  ConfidentialModelApi,
  type ConfidentialModel,
} from '@/services/confidential-models';

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
  const [models, setModels] = useState<ConfidentialModel[]>([]);
  const [runtimeRows, setRuntimeRows] = useState<
    Array<{
      deploymentId: string;
      modelId: string;
      modelName: string;
      version?: number;
      status: string;
      endpointPath: string;
      errorCode?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [domainRows, modelRows, runtimeInstances] = await Promise.all([
        confidentialComputeAdapters.api.listDomains(),
        ConfidentialModelApi.list(),
        ConfidentialModelApi.runtimeInstances(),
      ]);
      setDomains(domainRows.filter((item) => item.trustStatus !== 'blocked'));
      setModels(modelRows);
      setRuntimeRows(runtimeInstances);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

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
          onClick={() => void refresh()}
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
            label: '客户模型管理',
            children: <ConfidentialModelPanel domains={domains} />,
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
                    { title: '运行实例', dataIndex: 'deploymentId', ellipsis: true },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
                    },
                    { title: '受控端点', dataIndex: 'endpointPath', ellipsis: true },
                    {
                      title: '故障信息',
                      dataIndex: 'errorCode',
                      render: (value) => value || '—',
                    },
                  ]}
                  expandable={{
                    expandedRowRender: (row) => (
                      <Descriptions size="small" column={2}>
                        <Descriptions.Item label="计算节点">当前节点</Descriptions.Item>
                        <Descriptions.Item label="可信域">受控可信域</Descriptions.Item>
                        <Descriptions.Item label="会话">
                          {row.authorizationSessionId
                            ? '已建立（标识已隐藏）'
                            : '未授权或已停止'}
                        </Descriptions.Item>
                        <Descriptions.Item label="保护状态">
                          <SafetyCertificateOutlined /> 密文存储
                        </Descriptions.Item>
                      </Descriptions>
                    ),
                  }}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
