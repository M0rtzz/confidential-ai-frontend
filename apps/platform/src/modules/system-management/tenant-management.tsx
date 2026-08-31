import { PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
} from 'antd';
import { useMemo, useState } from 'react';

import { formatTime, MvpPage } from '@/modules/data-sandbox-mvp/common';

import styles from './index.less';
import type { SandboxTenant } from './store';
import {
  createEntityId,
  PLATFORM_RESOURCE_TOTALS,
  useSystemManagementStore,
} from './store';

const tenantStatus = {
  ACTIVE: { label: '正常', color: 'success' },
  FROZEN: { label: '冻结', color: 'error' },
} as const;

export const TenantManagementComponent = () => {
  const { state, updateState } = useSystemManagementStore();
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<SandboxTenant>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<SandboxTenant>();

  const filteredTenants = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return state.tenants.filter((tenant) => {
      const matchesKeyword =
        !normalized ||
        tenant.name.toLowerCase().includes(normalized) ||
        tenant.code.toLowerCase().includes(normalized);
      return matchesKeyword && (!statusFilter || tenant.status === statusFilter);
    });
  }, [keyword, state.tenants, statusFilter]);

  const activeCount = state.tenants.filter(
    (tenant) => tenant.status === 'ACTIVE',
  ).length;
  const allocatedQuota = state.tenants.reduce(
    (totals, tenant) => ({
      cpuCores: totals.cpuCores + tenant.cpuCores,
      memoryGb: totals.memoryGb + tenant.memoryGb,
      gpuCount: totals.gpuCount + tenant.gpuCount,
      storageGb: totals.storageGb + tenant.storageGb,
    }),
    { cpuCores: 0, memoryGb: 0, gpuCount: 0, storageGb: 0 },
  );
  const quotaAvailableForForm = state.tenants
    .filter((tenant) => tenant.id !== editing?.id)
    .reduce(
      (available, tenant) => ({
        cpuCores: available.cpuCores - tenant.cpuCores,
        memoryGb: available.memoryGb - tenant.memoryGb,
        gpuCount: available.gpuCount - tenant.gpuCount,
        storageGb: available.storageGb - tenant.storageGb,
      }),
      { ...PLATFORM_RESOURCE_TOTALS },
    );

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({
      status: 'ACTIVE',
      cpuCores: 16,
      memoryGb: 64,
      gpuCount: 0,
      storageGb: 1024,
      dataIsolation: true,
      computeIsolation: true,
    } as SandboxTenant);
    setModalOpen(true);
  };

  const openEdit = (tenant: SandboxTenant) => {
    setEditing(tenant);
    form.setFieldsValue(tenant);
    setModalOpen(true);
  };

  const saveTenant = async () => {
    const values = await form.validateFields();
    const code = values.code.trim();
    const duplicated = state.tenants.some(
      (tenant) =>
        tenant.id !== editing?.id && tenant.code.toLowerCase() === code.toLowerCase(),
    );
    if (duplicated) {
      message.error('租户编码已存在');
      return;
    }
    const exceededResource = [
      {
        label: 'CPU',
        value: values.cpuCores,
        available: quotaAvailableForForm.cpuCores,
        unit: '核',
      },
      {
        label: '内存',
        value: values.memoryGb,
        available: quotaAvailableForForm.memoryGb,
        unit: 'GB',
      },
      {
        label: 'GPU',
        value: values.gpuCount,
        available: quotaAvailableForForm.gpuCount,
        unit: '卡',
      },
      {
        label: '存储',
        value: values.storageGb,
        available: quotaAvailableForForm.storageGb,
        unit: 'GB',
      },
    ].find(
      ({ value, available }) =>
        !Number.isFinite(value) || value > Math.max(available, 0),
    );
    if (exceededResource) {
      message.error(
        `${exceededResource.label}配额超出可分配资源，当前最多可分配 ${Math.max(
          exceededResource.available,
          0,
        )} ${exceededResource.unit}`,
      );
      return;
    }
    updateState((current) => ({
      ...current,
      tenants: editing
        ? current.tenants.map((tenant) =>
            tenant.id === editing.id
              ? {
                  ...tenant,
                  ...values,
                  code,
                  name: values.name.trim(),
                }
              : tenant,
          )
        : [
            {
              ...values,
              id: createEntityId('tenant'),
              code,
              name: values.name.trim(),
              createdAt: new Date().toISOString(),
            },
            ...current.tenants,
          ],
    }));
    message.success(editing ? '租户已更新' : '租户已创建');
    setModalOpen(false);
  };

  const toggleTenant = (tenant: SandboxTenant) => {
    const status = tenant.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    updateState((current) => ({
      ...current,
      tenants: current.tenants.map((item) =>
        item.id === tenant.id ? { ...item, status } : item,
      ),
    }));
    message.success(status === 'ACTIVE' ? '租户已解冻' : '租户已冻结');
  };

  const deleteTenant = (tenant: SandboxTenant) => {
    if (state.users.some((user) => user.tenantId === tenant.id)) {
      message.warning('租户下仍有用户，无法删除');
      return;
    }
    updateState((current) => ({
      ...current,
      tenants: current.tenants.filter((item) => item.id !== tenant.id),
    }));
    message.success('租户已删除');
  };

  return (
    <MvpPage
      title="租户管理"
      description="管理当前节点服务器上的租户、资源配额与数据计算隔离策略"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增租户
        </Button>
      }
    >
      <Row gutter={[16, 16]} className={styles.stats}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic title="租户总数" value={state.tenants.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic title="正常租户" value={activeCount} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic
              title="CPU 配额"
              value={allocatedQuota.cpuCores}
              suffix={`/ ${PLATFORM_RESOURCE_TOTALS.cpuCores} 核`}
            />
            <div className={styles.statDetail}>已分配 / 资源总额</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic
              title="内存配额"
              value={allocatedQuota.memoryGb}
              suffix={`/ ${PLATFORM_RESOURCE_TOTALS.memoryGb} GB`}
            />
            <div className={styles.statDetail}>已分配 / 资源总额</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic
              title="GPU 配额"
              value={allocatedQuota.gpuCount}
              suffix={`/ ${PLATFORM_RESOURCE_TOTALS.gpuCount} 卡`}
            />
            <div className={styles.statDetail}>已分配 / 资源总额</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic
              title="存储配额"
              value={allocatedQuota.storageGb}
              suffix={`/ ${PLATFORM_RESOURCE_TOTALS.storageGb} GB`}
            />
            <div className={styles.statDetail}>已分配 / 资源总额</div>
          </Card>
        </Col>
      </Row>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Input.Search
            allowClear
            placeholder="搜索租户名称或编码"
            onSearch={setKeyword}
            style={{ width: 280 }}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'ACTIVE', label: '正常' },
              { value: 'FROZEN', label: '冻结' },
            ]}
          />
        </div>
        <span>共 {filteredTenants.length} 个租户</span>
      </div>
      <Table
        rowKey="id"
        dataSource={filteredTenants}
        pagination={{
          pageSize: 10,
          showTotal: (total) => '共 ' + total + ' 条',
        }}
        scroll={{ x: 1180 }}
        columns={[
          {
            title: '租户',
            dataIndex: 'name',
            width: 200,
            render: (value: string, row: SandboxTenant) => (
              <>
                <span className={styles.cellTitle}>{value}</span>
                <span className={styles.cellDescription}>{row.code}</span>
              </>
            ),
          },
          {
            title: '联系人',
            dataIndex: 'contact',
            width: 150,
            render: (value: string, row: SandboxTenant) => (
              <>
                <span className={styles.cellTitle}>{value || '-'}</span>
                <span className={styles.cellDescription}>{row.phone || '-'}</span>
              </>
            ),
          },
          {
            title: '资源配额',
            key: 'quota',
            width: 240,
            render: (_: unknown, row: SandboxTenant) => (
              <div className={styles.quota}>
                <div className={styles.quotaLine}>
                  <span className={styles.quotaItem}>CPU {row.cpuCores} 核</span>
                  <span className={styles.quotaItem}>内存 {row.memoryGb} GB</span>
                </div>
                <div className={styles.quotaLine}>
                  <span className={styles.quotaItem}>GPU {row.gpuCount} 卡</span>
                  <span className={styles.quotaItem}>存储 {row.storageGb} GB</span>
                </div>
              </div>
            ),
          },
          {
            title: '隔离策略',
            key: 'isolation',
            width: 140,
            render: (_: unknown, row: SandboxTenant) => (
              <div className={styles.isolation}>
                <Tag color={row.dataIsolation ? 'blue' : 'default'}>数据隔离</Tag>
                <Tag color={row.computeIsolation ? 'purple' : 'default'}>计算隔离</Tag>
              </div>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (value: keyof typeof tenantStatus) => (
              <Tag color={tenantStatus[value].color}>{tenantStatus[value].label}</Tag>
            ),
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 180,
            render: formatTime,
          },
          {
            title: '操作',
            key: 'actions',
            fixed: 'right',
            width: 190,
            render: (_: unknown, row: SandboxTenant) => (
              <Space size={0}>
                <Button type="link" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title={
                    '确定' + (row.status === 'ACTIVE' ? '冻结' : '解冻') + '该租户？'
                  }
                  onConfirm={() => toggleTenant(row)}
                >
                  <Button type="link">
                    {row.status === 'ACTIVE' ? '冻结' : '解冻'}
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="确定删除该租户？"
                  onConfirm={() => deleteTenant(row)}
                >
                  <Button danger type="link">
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={modalOpen}
        title={editing ? '编辑租户' : '新增租户'}
        width={680}
        onCancel={() => setModalOpen(false)}
        onOk={saveTenant}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="租户编码"
                rules={[{ required: true, message: '请输入租户编码' }]}
              >
                <Input disabled={!!editing} placeholder="如 joint-modeling" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="name"
                label="租户名称"
                rules={[{ required: true, message: '请输入租户名称' }]}
              >
                <Input placeholder="请输入租户名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact" label="联系人">
                <Input placeholder="请输入联系人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="cpuCores"
                label="CPU 配额（核）"
                rules={[{ required: true, message: '请输入 CPU 配额' }]}
              >
                <InputNumber
                  min={0.1}
                  max={Math.max(quotaAvailableForForm.cpuCores, 0.1)}
                  step={0.5}
                  precision={1}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="memoryGb"
                label="内存配额（GB）"
                rules={[{ required: true, message: '请输入内存配额' }]}
              >
                <InputNumber
                  min={1}
                  max={Math.max(quotaAvailableForForm.memoryGb, 1)}
                  precision={0}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="gpuCount"
                label="GPU 配额（卡）"
                rules={[{ required: true, message: '请输入 GPU 配额' }]}
              >
                <InputNumber
                  min={0}
                  max={Math.max(quotaAvailableForForm.gpuCount, 0)}
                  precision={0}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="storageGb"
                label="存储容量（GB）"
                rules={[{ required: true, message: '请输入存储容量' }]}
              >
                <InputNumber
                  min={1}
                  max={Math.max(quotaAvailableForForm.storageGb, 1)}
                  precision={0}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="dataIsolation" label="数据隔离" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="computeIsolation"
                label="计算隔离"
                valuePropName="checked"
              >
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="租户状态">
                <Select
                  options={[
                    { value: 'ACTIVE', label: '正常' },
                    { value: 'FROZEN', label: '冻结' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </MvpPage>
  );
};
