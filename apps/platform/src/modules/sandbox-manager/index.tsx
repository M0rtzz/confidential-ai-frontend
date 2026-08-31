import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { parse } from 'query-string';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'umi';

import {
  DataAssetApi,
  DataSandboxApi,
  DataSandboxRecord,
  responseData,
} from '@/services/data-sandbox';
import API from '@/services/secretpad';
import { formatTime, MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { LoginService } from '@/modules/login/login.service';
import { useModel } from '@/util/valtio-helper';
import { checkAllApproved } from '@/modules/p2p-project-list/components/common';

const formatError = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** 挂载门禁同时遵循数据目录的使用时间窗与访问时间窗。 */
const withinAssetValidity = (asset: DataSandboxRecord) => {
  const now = dayjs();
  const starts = [asset.control_valid_from, asset.access_start];
  const ends = [asset.control_valid_until, asset.access_end];
  if (
    starts.some(
      (value) => value && dayjs(value).isValid() && now.isBefore(dayjs(value)),
    )
  ) {
    return false;
  }
  return !ends.some(
    (value) => value && dayjs(value).isValid() && now.isAfter(dayjs(value)),
  );
};

export const SandboxManagerComponent = () => {
  const { search } = useLocation();
  const ownerId = String(parse(search).ownerId || '');
  const loginService = useModel(LoginService);
  const currentUser = loginService?.userInfo as DataSandboxRecord | undefined;
  const currentNodeId = String(currentUser?.platformNodeId || ownerId);
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [images, setImages] = useState<DataSandboxRecord[]>([]);
  const [projects, setProjects] = useState<DataSandboxRecord[]>([]);
  const [createAssets, setCreateAssets] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [allowlistOpen, setAllowlistOpen] = useState(false);
  const [allowlistSandboxId, setAllowlistSandboxId] = useState('');
  const [allowlistItems, setAllowlistItems] = useState<DataSandboxRecord[]>([]);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [changeItem, setChangeItem] = useState<DataSandboxRecord>();
  const [changeType, setChangeType] = useState('');
  const [changeAssets, setChangeAssets] = useState<DataSandboxRecord[]>([]);
  const [renewItem, setRenewItem] = useState<DataSandboxRecord>();
  const [mounts, setMounts] = useState<DataSandboxRecord[]>([]);
  const [mountsOpen, setMountsOpen] = useState(false);
  const [recyclingId, setRecyclingId] = useState('');
  const [form] = Form.useForm();
  const [imageForm] = Form.useForm();
  const [allowlistForm] = Form.useForm();
  const [changeForm] = Form.useForm();
  const [renewForm] = Form.useForm();
  // 门禁直通角色：平台管理员（与后端 SandboxApprovalGate.isAdmin 一致）
  const isAdmin =
    loginService?.userInfo?.ownerId === 'kuscia-system' &&
    loginService?.userInfo?.name === 'admin';

  // Z-03 门禁：approval.required 开启且非 admin 时，创建/续期/回收须走申请单审批
  useEffect(() => {
    DataSandboxApi.approvalConfig()
      .then((res) => setApprovalRequired(Boolean(responseData(res, {})?.required)))
      .catch(() => setApprovalRequired(false));
  }, []);

  const gated = () => approvalRequired && !isAdmin;

  const guideToApproval = (text: string) => {
    Modal.confirm({
      title: '需走审批流程',
      content: `${text}需提交申请单审批，请在左侧「沙箱申请审批」菜单提交，审批通过后自动执行。`,
      okText: '知道了',
      cancelButtonProps: { style: { display: 'none' } },
    });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sandboxResponse, imageResponse, projectResponse] = await Promise.all([
        // 沙箱创建审批以节点 platformNodeId 作为 owner_id 保存；登录用户的
        // ownerId 可能是机构/账号 ID，使用它会把审批后创建的沙箱过滤掉。
        DataSandboxApi.sandboxes({ ownerId: currentNodeId }),
        DataSandboxApi.images(),
        API.P2PProjectController.listP2PProject(),
      ]);
      setItems(responseData(sandboxResponse, []));
      setImages(responseData(imageResponse, []));
      setProjects(responseData(projectResponse, []));
    } catch (requestError: unknown) {
      const detail = formatError(requestError, '加载沙箱失败');
      setError(detail);
      message.error(detail);
    } finally {
      setLoading(false);
    }
  }, [currentNodeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const action = async (id: string, name: string, extra: DataSandboxRecord = {}) => {
    try {
      responseData(
        await DataSandboxApi.sandboxAction({ id, action: name, ...extra }),
        {},
      );
      if (name === 'START') {
        message.info('启动中，约 30 秒内完成（后台同步），可稍后刷新查看状态');
      } else {
        message.success('操作已提交');
      }
      refresh();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // Z-02 网络白名单：仅 ALLOW_LIST 策略沙箱提供管理入口
  const loadAllowlist = async (sandboxId: string) => {
    setAllowlistLoading(true);
    try {
      setAllowlistItems(
        responseData(await DataSandboxApi.networkAllowlist(sandboxId), []),
      );
    } catch (error: any) {
      message.error(error.message || '加载白名单失败');
    } finally {
      setAllowlistLoading(false);
    }
  };
  const openAllowlist = async (sandboxId: string) => {
    setAllowlistSandboxId(sandboxId);
    setAllowlistOpen(true);
    allowlistForm.resetFields();
    loadAllowlist(sandboxId);
  };
  const addAllowlist = async (values: DataSandboxRecord) => {
    try {
      responseData(
        await DataSandboxApi.addNetworkAllowlist({
          sandboxId: allowlistSandboxId,
          ...values,
        }),
        {},
      );
      message.success('白名单已添加');
      allowlistForm.resetFields();
      loadAllowlist(allowlistSandboxId);
    } catch (error: any) {
      message.error(error.message || '添加白名单失败');
    }
  };
  const deleteAllowlist = async (id: string) => {
    try {
      responseData(await DataSandboxApi.deleteNetworkAllowlist(id), {});
      message.success('白名单已删除');
      loadAllowlist(allowlistSandboxId);
    } catch (error: any) {
      message.error(error.message || '删除白名单失败');
    }
  };

  const openChange = async (record: DataSandboxRecord, type: string) => {
    setChangeItem(record);
    setChangeType(type);
    changeForm.resetFields();
    if (type === 'SPEC_CHANGE')
      changeForm.setFieldsValue({
        cpuCores: record.cpu_cores,
        memoryGb: record.memory_gb,
        gpuCount: record.gpu_count,
        storageGb: record.storage_gb,
      });
    if (type === 'CONFIG_CHANGE')
      changeForm.setFieldsValue({
        imageId: record.image_id,
        networkPolicy: record.network_policy,
      });
    if (type === 'DATA_CHANGE') {
      const [projectData, currentMounts] = await Promise.all([
        DataAssetApi.projectAssets(record.project_id),
        DataAssetApi.sandboxMounts(record.id),
      ]);
      const projectAssets = responseData(projectData, []).filter(
        (asset: DataSandboxRecord) =>
          asset.data_stage === 'PROCESSED' && withinAssetValidity(asset),
      );
      const mountedAssets = responseData(currentMounts, []).map(
        (mount: DataSandboxRecord) => ({
          ...mount,
          id: mount.asset_id,
          name: mount.asset_name,
        }),
      );
      setChangeAssets(
        Array.from(
          new Map(
            [...projectAssets, ...mountedAssets].map((asset) => [asset.id, asset]),
          ).values(),
        ),
      );
      changeForm.setFieldsValue({
        datasetAssetIds: mountedAssets.map((asset) => asset.id),
      });
    }
  };

  const submitChange = async (values: DataSandboxRecord) => {
    if (!changeItem) return;
    try {
      const selectedAssetIds = Array.isArray(values.datasetAssetIds)
        ? values.datasetAssetIds
        : [];
      const datasetNames = selectedAssetIds.map((assetId) => {
        const asset = changeAssets.find((item) => item.id === assetId);
        return asset?.name || assetId;
      });
      responseData(
        await DataSandboxApi.approvalSubmit({
          approvalType: changeType,
          sandboxId: changeItem.id,
          ...values,
          ...(changeType === 'DATA_CHANGE' ? { datasetNames } : {}),
        }),
        {},
      );
      message.success('变更申请已提交');
      setChangeItem(undefined);
    } catch (error: any) {
      message.error(error.message || '提交变更申请失败');
    }
  };

  const openRenew = (record: DataSandboxRecord) => {
    setRenewItem(record);
    renewForm.resetFields();
    renewForm.setFieldsValue({
      expiresAt: record.expires_at ? dayjs(record.expires_at) : undefined,
    });
  };

  const submitRenew = async (values: DataSandboxRecord) => {
    if (!renewItem) return;
    try {
      responseData(
        await DataSandboxApi.approvalSubmit({
          approvalType: 'RENEW',
          sandboxId: renewItem.id,
          ...values,
          expiresAt: values.expiresAt.format('YYYY-MM-DDTHH:mm:ss'),
        }),
        {},
      );
      message.success('续期申请已提交');
      setRenewItem(undefined);
    } catch (error: any) {
      message.error(error.message || '提交续期申请失败');
    }
  };

  const submitRecycle = async (record: DataSandboxRecord) => {
    setRecyclingId(record.id);
    try {
      responseData(
        await DataSandboxApi.approvalSubmit({
          approvalType: 'RECYCLE',
          sandboxId: record.id,
          sandboxName: record.name,
        }),
        {},
      );
      message.success('销毁申请已提交，请到“项目资源审核”查看审批进度');
      await refresh();
    } catch (error: unknown) {
      message.error(formatError(error, '销毁申请提交失败'));
    } finally {
      setRecyclingId('');
    }
  };

  const columns = [
    {
      title: '沙箱名称',
      dataIndex: 'name',
      render: (name: string, record: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <strong>{name}</strong>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.id}</span>
        </Space>
      ),
    },
    {
      title: '所属项目名',
      dataIndex: 'project_name',
      render: (value: string, record: DataSandboxRecord) =>
        value || record.project_id || '-',
    },
    {
      title: '资源配额',
      render: (_: unknown, record: DataSandboxRecord) =>
        `${record.cpu_cores}C / ${record.memory_gb}GB / GPU ${record.gpu_count} / ${record.storage_gb}GB`,
    },
    { title: '到期时间', dataIndex: 'expires_at', render: formatTime },
    {
      title: '操作',
      width: 300,
      render: (_: unknown, record: DataSandboxRecord) => (
        <Space wrap>
          {(() => {
            const creator = record.created_by === loginService?.userInfo?.name;
            const expired = record.status === 'EXPIRED';
            return (
              <>
                <Button
                  size="small"
                  type="link"
                  disabled={!creator}
                  onClick={() => openRenew(record)}
                >
                  续期
                </Button>
                <Button
                  disabled={!creator}
                  size="small"
                  type="link"
                  hidden={expired}
                  onClick={() => openChange(record, 'SPEC_CHANGE')}
                >
                  变更规格
                </Button>
                <Button
                  disabled={!creator}
                  size="small"
                  type="link"
                  hidden={expired}
                  onClick={() => openChange(record, 'DATA_CHANGE')}
                >
                  变更数据
                </Button>
                <Button
                  size="small"
                  type="link"
                  hidden={expired}
                  onClick={async () => {
                    setMounts(
                      responseData(await DataAssetApi.sandboxMounts(record.id), []),
                    );
                    setMountsOpen(true);
                  }}
                >
                  挂载数据
                </Button>
                <Popconfirm
                  title="销毁后将回收全部配额，确定继续？"
                  okText="确定销毁"
                  cancelText="取消"
                  onConfirm={() => submitRecycle(record)}
                >
                  <Button
                    disabled={!creator || Boolean(recyclingId)}
                    loading={recyclingId === record.id}
                    danger
                    size="small"
                    type="link"
                  >
                    销毁
                  </Button>
                </Popconfirm>
              </>
            );
          })()}
        </Space>
      ),
    },
  ];

  return (
    <MvpPage
      title="沙箱列表"
      description="查看项目沙箱，并提交延期、规格、数据挂载与销毁申请"
      error={error}
      onRetry={refresh}
      extra={
        <>
          <RefreshButton loading={loading} onClick={refresh} />
          <Button
            type="primary"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            申请沙箱
          </Button>
        </>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="创建数据沙箱"
        open={createOpen}
        width={680}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            expiresAt: dayjs().add(7, 'day').second(0),
            cpuCores: 2,
            memoryGb: 4,
            gpuCount: 0,
            storageGb: 20,
          }}
          onFinish={async (values) => {
            try {
              const defaultImage = images.find(
                (item) => item.enabled && item.id !== 'img-secretflow',
              );
              if (!defaultImage) {
                message.error('暂无可用的环境镜像，无法申请沙箱');
                return;
              }
              responseData(
                await DataSandboxApi.approvalSubmit({
                  ...values,
                  expiresAt: values.expiresAt.format('YYYY-MM-DDTHH:mm:ss'),
                  ownerId: currentNodeId,
                  imageId: defaultImage.id,
                  networkPolicy: 'INTERNAL_ONLY',
                  approvalType: 'CREATE',
                }),
                {},
              );
              message.success('沙箱申请已提交');
              setCreateOpen(false);
              form.resetFields();
              refresh();
            } catch (error: any) {
              message.error(error.message || '创建失败');
            }
          }}
        >
          <Form.Item name="name" label="沙箱名称" rules={[{ required: true }]}>
            <Input placeholder="例如：客户流失分析环境" />
          </Form.Item>
          <Form.Item
            name="description"
            label="沙箱描述"
            rules={[{ max: 500, message: '描述不能超过500个字符' }]}
          >
            <Input.TextArea
              rows={3}
              showCount
              maxLength={500}
              placeholder="说明沙箱用途、开发任务或使用范围"
            />
          </Form.Item>
          <Form.Item name="projectId" label="所属项目" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              onChange={async (projectId) => {
                form.setFieldValue('datasetAssetIds', []);
                setCreateAssets(
                  responseData(await DataAssetApi.projectAssets(projectId), []).filter(
                    (asset: DataSandboxRecord) =>
                      asset.data_stage === 'PROCESSED' && withinAssetValidity(asset),
                  ),
                );
              }}
              options={projects
                .filter(
                  (p) =>
                    p.status !== 'ARCHIVED' && checkAllApproved(p as API.ProjectVO),
                )
                .map((p) => ({ value: p.projectId, label: p.projectName }))}
            />
          </Form.Item>
          <Form.Item name="datasetAssetIds" label="挂载数据">
            <Select
              mode="multiple"
              placeholder="仅可选择项目内有效的抽样脱敏数据"
              options={createAssets.map((a) => ({
                value: a.id,
                label: `${a.name}（${a.provider_node_id}）`,
              }))}
            />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="cpuCores" label="CPU（核）">
              <InputNumber min={0.1} />
            </Form.Item>
            <Form.Item name="memoryGb" label="内存（GB）">
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="gpuCount" label="GPU（运行时配额）">
              <InputNumber min={0} max={4} />
            </Form.Item>
            <Form.Item name="storageGb" label="存储（GB）">
              <InputNumber min={1} />
            </Form.Item>
          </Space>
          <Form.Item
            name="expiresAt"
            label="到期时间"
            rules={[{ required: true, message: '请选择到期时间' }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm:ss' }}
              format="YYYY-MM-DD HH:mm:ss"
              disabledDate={(current) =>
                current && current.isBefore(dayjs().startOf('day'))
              }
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`申请沙箱续期：${renewItem?.name || ''}`}
        open={!!renewItem}
        onCancel={() => setRenewItem(undefined)}
        onOk={() => renewForm.submit()}
        okText="提交申请"
        cancelText="取消"
      >
        <Form form={renewForm} layout="vertical" onFinish={submitRenew}>
          <Form.Item label="当前到期时间">
            {formatTime(renewItem?.expires_at)}
          </Form.Item>
          <Form.Item
            name="expiresAt"
            label="新的到期时间"
            rules={[{ required: true, message: '请选择新的到期时间' }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm:ss' }}
              format="YYYY-MM-DD HH:mm:ss"
              disabledDate={(current) =>
                current
                  .endOf('day')
                  .isBefore(dayjs(renewItem?.expires_at || undefined).startOf('day'))
              }
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="申请原因"
            rules={[{ max: 500, message: '申请原因不能超过500个字符' }]}
          >
            <Input.TextArea
              rows={3}
              showCount
              maxLength={500}
              placeholder="说明本次续期的业务原因"
            />
          </Form.Item>
          <Typography.Text type="secondary">
            审批通过后，到期时间将设置为上述固定时间点。
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title={
          {
            SPEC_CHANGE: '申请规格变更',
            DATA_CHANGE: '申请挂载数据变更',
            CONFIG_CHANGE: '申请环境配置变更',
          }[changeType]
        }
        open={!!changeItem}
        onCancel={() => setChangeItem(undefined)}
        onOk={() => changeForm.submit()}
      >
        <Form form={changeForm} layout="vertical" onFinish={submitChange}>
          {changeType === 'SPEC_CHANGE' && (
            <Space wrap>
              <Form.Item name="cpuCores" label="CPU（核）">
                <InputNumber min={0.1} />
              </Form.Item>
              <Form.Item name="memoryGb" label="内存（GB）">
                <InputNumber min={1} />
              </Form.Item>
              <Form.Item name="gpuCount" label="GPU">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name="storageGb" label="存储（GB）">
                <InputNumber min={1} />
              </Form.Item>
            </Space>
          )}
          {changeType === 'DATA_CHANGE' && (
            <Form.Item name="datasetAssetIds" label="挂载数据">
              <Select
                mode="multiple"
                options={changeAssets.map((asset) => ({
                  value: asset.id,
                  label: `${asset.name}（${asset.provider_node_id}）`,
                }))}
              />
            </Form.Item>
          )}
          {changeType === 'CONFIG_CHANGE' && (
            <>
              <Form.Item name="imageId" label="环境镜像">
                <Select
                  options={images
                    .filter((image) => image.enabled)
                    .map((image) => ({ value: image.id, label: image.name }))}
                />
              </Form.Item>
              <Form.Item name="networkPolicy" label="网络策略">
                <Select
                  options={[
                    { value: 'INTERNAL_ONLY', label: '仅平台内网' },
                    { value: 'ALLOW_LIST', label: '出口白名单' },
                    { value: 'NO_NETWORK', label: '完全断网' },
                  ]}
                />
              </Form.Item>
            </>
          )}
          <Form.Item name="reason" label="申请原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="沙箱挂载数据"
        open={mountsOpen}
        width={850}
        footer={null}
        onCancel={() => setMountsOpen(false)}
      >
        <Table
          rowKey="id"
          dataSource={mounts}
          columns={[
            { title: '数据', dataIndex: 'asset_name' },
            { title: '提供方', dataIndex: 'provider_node_id' },
            { title: '挂载路径', dataIndex: 'mount_path' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => <Tag>{v}</Tag>,
            },
            { title: '有效期', dataIndex: 'expires_at', render: formatTime },
          ]}
        />
      </Modal>

      <Modal
        title="环境镜像管理"
        open={imageOpen}
        width={860}
        onCancel={() => setImageOpen(false)}
        footer={null}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={images}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '镜像地址', dataIndex: 'image_ref' },
            {
              title: 'Kuscia AppImage',
              dataIndex: 'kuscia_app_image',
              render: (v: string) => v || '未配置',
            },
            {
              title: '状态',
              dataIndex: 'enabled',
              render: (v: number) => (
                <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag>
              ),
            },
          ]}
        />
        <Form
          form={imageForm}
          layout="inline"
          style={{ marginTop: 20 }}
          initialValues={{ enabled: true }}
          onFinish={async (values) => {
            try {
              responseData(await DataSandboxApi.saveImage(values), {});
              message.success('镜像已保存');
              imageForm.resetFields();
              refresh();
            } catch (error: any) {
              message.error(error.message);
            }
          }}
        >
          <Form.Item name="name" rules={[{ required: true }]}>
            <Input placeholder="镜像名称" />
          </Form.Item>
          <Form.Item name="imageRef" rules={[{ required: true }]}>
            <Input style={{ width: 260 }} placeholder="OCI 镜像地址" />
          </Form.Item>
          <Form.Item name="kusciaAppImage">
            <Input placeholder="Kuscia AppImage" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            新增镜像
          </Button>
        </Form>
      </Modal>

      <Modal
        title={`出口白名单（${allowlistSandboxId}）`}
        open={allowlistOpen}
        width={760}
        onCancel={() => setAllowlistOpen(false)}
        footer={null}
      >
        <Table
          rowKey="id"
          size="small"
          loading={allowlistLoading}
          pagination={false}
          dataSource={allowlistItems}
          columns={[
            { title: '目标地址', dataIndex: 'host' },
            { title: '端口', dataIndex: 'port' },
            {
              title: '协议',
              dataIndex: 'proto',
              render: (v: string) => <Tag>{v || 'tcp'}</Tag>,
            },
            { title: '备注', dataIndex: 'remark', render: (v: string) => v || '-' },
            { title: '创建时间', dataIndex: 'created_at', render: formatTime },
            {
              title: '操作',
              render: (_: unknown, row: DataSandboxRecord) => (
                <Button
                  danger
                  size="small"
                  type="link"
                  onClick={() => deleteAllowlist(row.id)}
                >
                  删除
                </Button>
              ),
            },
          ]}
        />
        <Form
          form={allowlistForm}
          layout="inline"
          style={{ marginTop: 20 }}
          initialValues={{ proto: 'tcp' }}
          onFinish={addAllowlist}
        >
          <Form.Item
            name="host"
            rules={[{ required: true, message: '请输入目标地址' }]}
          >
            <Input placeholder="目标地址，如 api.example.com" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="port" rules={[{ required: true, message: '端口 1-65535' }]}>
            <InputNumber min={1} max={65535} placeholder="端口" />
          </Form.Item>
          <Form.Item name="proto">
            <Select
              style={{ width: 90 }}
              options={[
                { value: 'tcp', label: 'tcp' },
                { value: 'udp', label: 'udp' },
              ]}
            />
          </Form.Item>
          <Form.Item name="remark">
            <Input placeholder="备注（可选）" style={{ width: 180 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            添加
          </Button>
        </Form>
      </Modal>
    </MvpPage>
  );
};
