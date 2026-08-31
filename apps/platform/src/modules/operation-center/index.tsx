import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';

import {
  DataSandboxApi,
  DataSandboxRecord,
  responseData,
} from '@/services/data-sandbox';
import {
  formatError,
  formatTime,
  MvpPage,
  RefreshButton,
} from '@/modules/data-sandbox-mvp/common';
import styles from '@/modules/data-sandbox-mvp/index.less';

export const OperationCenterComponent = () => {
  const [overview, setOverview] = useState<DataSandboxRecord>({
    counts: {},
    backups: [],
    tickets: [],
  });
  const [help, setHelp] = useState<DataSandboxRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DataSandboxRecord>();
  const [securityScan, setSecurityScan] = useState<DataSandboxRecord>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketForm] = Form.useForm();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ops, articles] = await Promise.all([
        DataSandboxApi.operations(),
        DataSandboxApi.help(),
      ]);
      setOverview(responseData(ops, {}));
      setHelp(responseData(articles, []));
    } catch (requestError: unknown) {
      const detail = formatError(requestError, '加载运维信息失败');
      setError(detail);
      message.error(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  const counts = overview.counts || {};

  return (
    <MvpPage
      title="运维与配套服务"
      description="备份恢复、监控告警、运维控制台、帮助、诊断与服务支持"
      error={error}
      onRetry={refresh}
      extra={
        <>
          <RefreshButton loading={loading} onClick={refresh} />
          <Button
            onClick={async () => {
              try {
                setDiagnostics(responseData(await DataSandboxApi.diagnostics(), {}));
              } catch (error: any) {
                message.error(error.message);
              }
            }}
          >
            一键诊断
          </Button>
          <Button
            onClick={async () => {
              try {
                setSecurityScan(responseData(await DataSandboxApi.securityScan(), {}));
                refresh();
              } catch (error: any) {
                message.error(error.message);
              }
            }}
          >
            安全扫描
          </Button>
          <Button type="primary" onClick={() => setTicketOpen(true)}>
            提交工单
          </Button>
        </>
      }
    >
      <div className={styles.cards}>
        <Card>
          <Statistic
            title="运行中沙箱"
            value={counts.runningSandboxes || 0}
            suffix={`/ ${counts.sandboxes || 0}`}
          />
        </Card>
        <Card>
          <Statistic title="待审批模型" value={counts.pendingApprovals || 0} />
        </Card>
        <Card>
          <Statistic
            title="未恢复告警"
            value={counts.openAlerts || 0}
            valueStyle={{ color: counts.openAlerts ? '#cf1322' : undefined }}
          />
        </Card>
        <Card>
          <Statistic title="失败回调" value={counts.failedCallbacks || 0} />
        </Card>
      </div>
      <Descriptions bordered size="small" column={2} title="运行配置">
        <Descriptions.Item label="系统状态">
          <Tag color="success">{overview.status || 'UNKNOWN'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Kuscia 沙箱运行接入">
          {overview.kusciaIntegrationEnabled ? '已开启' : 'MVP 模拟状态（未开启）'}
        </Descriptions.Item>
        <Descriptions.Item label="快照目录">{overview.snapshotRoot}</Descriptions.Item>
        <Descriptions.Item label="备份目录">{overview.backupRoot}</Descriptions.Item>
      </Descriptions>
      <Card
        className={styles.section}
        title="备份与恢复"
        extra={
          <Button
            type="primary"
            onClick={async () => {
              try {
                const backup = responseData(await DataSandboxApi.createBackup(), {});
                message[backup.status === 'COMPLETED' ? 'success' : 'error'](
                  `备份状态：${backup.status}`,
                );
                refresh();
              } catch (error: any) {
                message.error(error.message);
              }
            }}
          >
            立即备份
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          message="在线恢复采用两阶段方式：先校验并暂存，再由部署包停机切换数据库，避免直接覆盖运行中的 SQLite。"
          style={{ marginBottom: 12 }}
        />
        <Table
          rowKey="id"
          size="small"
          dataSource={overview.backups || []}
          columns={[
            { title: '备份 ID', dataIndex: 'id' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => (
                <Tag
                  color={
                    v === 'COMPLETED'
                      ? 'success'
                      : v === 'FAILED'
                      ? 'error'
                      : 'processing'
                  }
                >
                  {v}
                </Tag>
              ),
            },
            {
              title: '大小',
              dataIndex: 'size_bytes',
              render: (v: number) => (v ? `${(v / 1024 / 1024).toFixed(2)} MB` : '-'),
            },
            { title: '创建时间', dataIndex: 'created_at', render: formatTime },
            { title: '校验时间', dataIndex: 'verified_at', render: formatTime },
            {
              title: '演练',
              dataIndex: 'drill_status',
              render: (value: string) => (
                <Tag
                  color={
                    value === 'PASSED'
                      ? 'success'
                      : value === 'FAILED'
                      ? 'error'
                      : 'default'
                  }
                >
                  {value || 'NOT_RUN'}
                </Tag>
              ),
            },
            {
              title: '操作',
              render: (_: unknown, row: DataSandboxRecord) =>
                ['COMPLETED', 'RESTORE_STAGED'].includes(row.status) && (
                  <Space size={0}>
                    <Button
                      type="link"
                      onClick={async () => {
                        try {
                          await DataSandboxApi.verifyBackup(row.id);
                          message.success('备份完整性校验通过');
                          refresh();
                        } catch (error: any) {
                          message.error(error.message);
                        }
                      }}
                    >
                      校验
                    </Button>
                    <Button
                      type="link"
                      onClick={async () => {
                        try {
                          await DataSandboxApi.drillRecovery(row.id);
                          message.success('恢复演练通过');
                          refresh();
                        } catch (error: any) {
                          message.error(error.message);
                        }
                      }}
                    >
                      演练
                    </Button>
                    <Button
                      type="link"
                      onClick={async () => {
                        try {
                          const result = responseData(
                            await DataSandboxApi.restoreBackup(row.id),
                            {},
                          );
                          Modal.info({ title: '恢复已暂存', content: result.message });
                          refresh();
                        } catch (error: any) {
                          message.error(error.message);
                        }
                      }}
                    >
                      恢复暂存
                    </Button>
                  </Space>
                ),
            },
          ]}
        />
      </Card>
      <Card className={styles.section} title="恢复点管理">
        <Table
          rowKey="id"
          size="small"
          dataSource={overview.recoveryPoints || []}
          columns={[
            { title: '恢复点 ID', dataIndex: 'id' },
            { title: '备份 ID', dataIndex: 'backup_id' },
            { title: '类型', dataIndex: 'point_type' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: string) => <Tag>{value}</Tag>,
            },
            { title: '校验时间', dataIndex: 'verified_at', render: formatTime },
            { title: '演练状态', dataIndex: 'drill_status' },
            { title: '创建时间', dataIndex: 'created_at', render: formatTime },
            {
              title: '操作',
              render: (_: unknown, row: DataSandboxRecord) => (
                <Button
                  type="link"
                  onClick={() =>
                    Modal.confirm({
                      title: '暂存该恢复点用于回滚？',
                      content: '此操作只生成待恢复数据库，不会直接覆盖当前运行库。',
                      onOk: async () => {
                        const result = responseData(
                          await DataSandboxApi.rollbackRecoveryPoint(row.id),
                          {},
                        );
                        message.success(result.message || '恢复点已暂存');
                        refresh();
                      },
                    })
                  }
                >
                  回滚暂存
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card className={styles.section} title="帮助文档">
        <Collapse
          items={help.map((article) => ({
            key: article.id,
            label: article.title,
            children: article.content,
          }))}
        />
      </Card>
      <Card className={styles.section} title="服务支持工单">
        <Table
          rowKey="id"
          size="small"
          dataSource={overview.tickets || []}
          columns={[
            { title: '标题', dataIndex: 'title' },
            { title: '分类', dataIndex: 'category' },
            { title: '优先级', dataIndex: 'priority' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => <Tag>{v}</Tag>,
            },
            { title: '提交人', dataIndex: 'submitter' },
            { title: '更新时间', dataIndex: 'updated_at', render: formatTime },
          ]}
        />
      </Card>
      <Modal
        title="系统诊断结果"
        width={720}
        open={!!diagnostics}
        onCancel={() => setDiagnostics(undefined)}
        footer={<Button onClick={() => setDiagnostics(undefined)}>关闭</Button>}
      >
        <Alert
          type={diagnostics?.status === 'HEALTHY' ? 'success' : 'warning'}
          showIcon
          message={`总体状态：${diagnostics?.status || '-'}`}
        />
        <Table
          rowKey="name"
          pagination={false}
          dataSource={diagnostics?.checks || []}
          columns={[
            { title: '检查项', dataIndex: 'name' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => (
                <Tag
                  color={
                    v === 'PASSED' ? 'success' : v === 'SKIPPED' ? 'default' : 'error'
                  }
                >
                  {v}
                </Tag>
              ),
            },
            { title: '详情', dataIndex: 'message' },
          ]}
        />
      </Modal>
      <Modal
        title="安全扫描结果"
        width={820}
        open={!!securityScan}
        onCancel={() => setSecurityScan(undefined)}
        footer={<Button onClick={() => setSecurityScan(undefined)}>关闭</Button>}
      >
        <Alert
          type={securityScan?.status === 'PASSED' ? 'success' : 'warning'}
          showIcon
          message={`扫描状态：${securityScan?.status || '-'}`}
          description="问题按识别、分派、修复、复测、关闭流程处理；报告不包含密钥明文。"
          style={{ marginBottom: 12 }}
        />
        <Table
          rowKey="code"
          pagination={false}
          dataSource={securityScan?.findings || []}
          columns={[
            { title: '风险项', dataIndex: 'code' },
            {
              title: '等级',
              dataIndex: 'severity',
              render: (value: string) => (
                <Tag color={value === 'HIGH' ? 'error' : 'warning'}>{value}</Tag>
              ),
            },
            { title: '影响数量', dataIndex: 'affected' },
            { title: '修复建议', dataIndex: 'remediation' },
          ]}
          locale={{ emptyText: '未发现安全风险' }}
        />
      </Modal>
      <Modal
        title="提交服务支持工单"
        open={ticketOpen}
        onCancel={() => setTicketOpen(false)}
        onOk={() => ticketForm.submit()}
      >
        <Form
          form={ticketForm}
          layout="vertical"
          initialValues={{ category: 'TECHNICAL', priority: 'NORMAL' }}
          onFinish={async (values) => {
            try {
              responseData(await DataSandboxApi.createTicket(values), {});
              message.success('工单已提交');
              setTicketOpen(false);
              ticketForm.resetFields();
              refresh();
            } catch (error: any) {
              message.error(error.message);
            }
          }}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="category" label="分类">
              <Select
                style={{ width: 180 }}
                options={['TECHNICAL', 'DATA', 'MODEL', 'ACCOUNT'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
            <Form.Item name="priority" label="优先级">
              <Select
                style={{ width: 150 }}
                options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="问题描述" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
        </Form>
      </Modal>
    </MvpPage>
  );
};
