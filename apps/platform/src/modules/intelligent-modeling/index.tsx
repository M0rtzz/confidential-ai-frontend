import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { parse } from 'query-string';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { history, useLocation } from 'umi';

import {
  DataSandboxApi,
  DataSandboxRecord,
  responseData,
} from '@/services/data-sandbox';
import { MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import styles from '@/modules/data-sandbox-mvp/index.less';

const componentLabels: Record<string, string> = {
  DATA_ALIGNMENT: '数据对齐',
  LOGISTIC_REGRESSION: '逻辑回归',
  LINEAR_REGRESSION: '线性回归',
  OUTLIER_HANDLING: '异常值处理',
  MISSING_VALUE_HANDLING: '缺失值处理',
  UNIQUE_VALUE_FILTER: '唯一值筛选',
  FEATURE_BINNING: '特征分箱',
  STANDARDIZATION: '标准化',
  CORRELATION: '相关系数',
};

export const IntelligentModelingComponent = () => {
  const ownerId = String(parse(useLocation().search).ownerId || '');
  const [overview, setOverview] = useState<DataSandboxRecord>({
    components: [],
    profiles: [],
    projects: [],
    runs: [],
  });
  const [selected, setSelected] = useState<DataSandboxRecord>();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(responseData(await DataSandboxApi.modeling(), {}));
    } catch (error: any) {
      message.error(error.message || '加载建模目录失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const components = overview.components || [];
  const runs = overview.runs || [];
  const projects = overview.projects || [];
  const selectedDefaults = useMemo(() => {
    if (!selected) return {};
    try {
      return JSON.parse(selected.default_params_json || '{}');
    } catch (_) {
      return {};
    }
  }, [selected]);
  const choose = (row: DataSandboxRecord) => {
    setSelected(row);
    let resources = {};
    try {
      resources = JSON.parse(row.default_resources_json || '{}');
    } catch (_) {
      /* server data is validated */
    }
    form.setFieldsValue({
      name: `${row.name}默认预设`,
      params: JSON.stringify(selectedDefaults),
      ...resources,
    });
  };
  useEffect(() => {
    if (selected) form.setFieldsValue({ params: JSON.stringify(selectedDefaults) });
  }, [selectedDefaults, selected, form]);
  const save = async (values: DataSandboxRecord) => {
    try {
      const params = JSON.parse(values.params || '{}');
      const result = await DataSandboxApi.validateModeling({
        componentCode: selected.code,
        params,
        resources: values,
      });
      if (!responseData(result, {}).valid) throw new Error('参数校验失败');
      await DataSandboxApi.saveModelingProfile({
        componentCode: selected.code,
        name: values.name,
        params,
        resources: {
          cpuCores: values.cpuCores,
          memoryGb: values.memoryGb,
          gpuCount: values.gpuCount,
          storageGb: values.storageGb,
          timeoutSeconds: values.timeoutSeconds,
        },
      });
      message.success('预设已保存');
      refresh();
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  };
  return (
    <MvpPage
      title="沙箱智能建模"
      description="九个内置建模组件的参数预设与真实 DAG 执行入口"
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <Alert
        showIcon
        type="info"
        message="组件目录只包含当前验收范围：数据对齐、逻辑回归、线性回归、异常值处理、缺失值处理、唯一值筛选、特征分箱、标准化、相关系数。实际数据绑定和执行请进入项目建模 DAG。"
      />
      <Tabs
        defaultActiveKey="catalog"
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'catalog',
            label: '组件目录',
            children: (
              <Table
                rowKey="code"
                size="small"
                dataSource={components}
                pagination={false}
                columns={[
                  {
                    title: '组件',
                    dataIndex: 'name',
                    render: (v: string, row: DataSandboxRecord) => (
                      <Button type="link" onClick={() => choose(row)}>
                        {v || componentLabels[row.code] || row.code}
                      </Button>
                    ),
                  },
                  { title: '类别', dataIndex: 'category' },
                  { title: '运行组件', dataIndex: 'runtime_code' },
                  { title: '版本', dataIndex: 'version' },
                  { title: '说明', dataIndex: 'description' },
                ]}
              />
            ),
          },
          {
            key: 'profile',
            label: '参数与资源预设',
            children: selected ? (
              <Card title={`${selected.name} · ${selected.runtime_code}`}>
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={save}
                  initialValues={{
                    cpuCores: 2,
                    memoryGb: 4,
                    gpuCount: 0,
                    storageGb: 10,
                    timeoutSeconds: 3600,
                  }}
                >
                  <Form.Item name="name" label="预设名称" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="params"
                    label="组件参数 JSON"
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea rows={8} />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item name="cpuCores" label="CPU（核）">
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="memoryGb" label="内存（GB）">
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="gpuCount" label="GPU">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="storageGb" label="存储（GB）">
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="timeoutSeconds" label="超时（秒）">
                    <InputNumber min={60} style={{ width: 220 }} />
                  </Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit">
                      校验并保存预设
                    </Button>
                    <Button
                      onClick={() =>
                        history.push(
                          `/edge?${ownerId ? `ownerId=${ownerId}&` : ''}tab=my-project`,
                        )
                      }
                    >
                      选择项目
                    </Button>
                  </Space>
                </Form>
              </Card>
            ) : (
              <Alert type="warning" message="请先在组件目录点击组件名称" />
            ),
          },
          {
            key: 'runs',
            label: '执行记录',
            children: (
              <Table
                rowKey={(r) => `${r.project_id}-${r.job_id}`}
                size="small"
                dataSource={runs}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: '项目', dataIndex: 'project_name' },
                  { title: '任务', dataIndex: 'name' },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (v: string) => <Tag>{v}</Tag>,
                  },
                  { title: '子任务', dataIndex: 'task_count' },
                  { title: '创建时间', dataIndex: 'gmt_create' },
                  {
                    title: '操作',
                    render: (_: unknown, row: DataSandboxRecord) => (
                      <Button
                        type="link"
                        onClick={() =>
                          history.push(
                            `/dag?projectId=${row.project_id}&mode=MPC&type=DAG`,
                          )
                        }
                      >
                        进入项目 DAG
                      </Button>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      <Card className={styles.section} title="可用项目" style={{ marginTop: 16 }}>
        <Table
          rowKey="project_id"
          size="small"
          dataSource={projects}
          pagination={false}
          columns={[
            { title: '项目', dataIndex: 'name' },
            { title: '项目 ID', dataIndex: 'project_id' },
            { title: '计算模式', dataIndex: 'compute_mode' },
            {
              title: '操作',
              render: (_: unknown, row: DataSandboxRecord) => (
                <Button
                  type="primary"
                  onClick={() =>
                    history.push(
                      `/dag?projectId=${row.project_id}&mode=${
                        row.compute_mode || 'MPC'
                      }&type=DAG`,
                    )
                  }
                >
                  进入项目建模
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </MvpPage>
  );
};
