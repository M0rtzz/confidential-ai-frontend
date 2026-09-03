import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { history as umiHistory, useLocation } from 'umi';

import { EndRole, getEndRole } from '@/components/platform-wrapper';
import {
  DataSandboxApi,
  DataSandboxRecord,
  responseData,
} from '@/services/data-sandbox';
import { formatTime, MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';

const typeLabels: Record<string, string> = {
  CREATE: '创建',
  RENEW: '续期',
  SPEC_CHANGE: '规格变更',
  DATA_CHANGE: '数据挂载变更',
  CONFIG_CHANGE: '配置变更',
  RECYCLE: '回收',
  ASSET_DELETE: '数据删除',
};

const typeColors: Record<string, string> = {
  CREATE: 'blue',
  RENEW: 'cyan',
  SPEC_CHANGE: 'orange',
  RECYCLE: 'red',
  ASSET_DELETE: 'red',
};

const statusLabels: Record<string, string> = {
  DATA_PROVIDER_REVIEW: '待项目节点一致审核',
  OPERATOR_REVIEW: '待运营方审核',
  APPROVED: '已批准',
  EXECUTING: '执行中',
  COMPLETED: '已完成',
  REJECTED: '已驳回',
  FAILED: '失败',
  CANCELLED: '已撤回',
};

const statusColors: Record<string, string> = {
  DATA_PROVIDER_REVIEW: 'processing',
  OPERATOR_REVIEW: 'warning',
  APPROVED: 'success',
  EXECUTING: 'processing',
  COMPLETED: 'success',
  REJECTED: 'error',
  FAILED: 'error',
  CANCELLED: 'default',
};

const REVIEWABLE = ['DATA_PROVIDER_REVIEW'];
const CANCELLABLE = ['DATA_PROVIDER_REVIEW', 'APPROVED'];

const parseApprovalPayload = (value: unknown): DataSandboxRecord => {
  if (value && typeof value === 'object') return value as DataSandboxRecord;
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
};

const ApprovalParameters = ({ detail }: { detail?: DataSandboxRecord }) => {
  if (!detail) return null;
  const payload = parseApprovalPayload(detail.payload_json);
  const approvalType = String(detail.approval_type || '');
  const datasetValues = Array.isArray(payload.datasetNames)
    ? payload.datasetNames
    : Array.isArray(payload.datasetAssetIds)
    ? payload.datasetAssetIds
    : [];
  const datasets = datasetValues.join('、') || '无';
  const common = payload.reason
    ? [{ key: 'reason', label: '申请原因', children: payload.reason }]
    : [];
  const parameterItems: Record<
    string,
    Array<{ key: string; label: string; children: unknown }>
  > = {
    CREATE: [
      { key: 'name', label: '沙箱名称', children: payload.name || '-' },
      { key: 'description', label: '沙箱描述', children: payload.description || '-' },
      {
        key: 'project',
        label: '所属项目',
        children:
          detail.project_name || payload.projectName || payload.projectId || '-',
      },
      { key: 'datasets', label: '挂载数据', children: datasets },
      {
        key: 'quota',
        label: '资源配额',
        children: `${payload.cpuCores || 0}C / ${payload.memoryGb || 0}GB / GPU ${
          payload.gpuCount || 0
        } / ${payload.storageGb || 0}GB`,
      },
      {
        key: 'expires',
        label: '到期时间',
        children: formatTime(payload.expiresAt),
      },
    ],
    RENEW: [
      {
        key: 'expires',
        label: '新的到期时间',
        children: formatTime(payload.expiresAt),
      },
    ],
    SPEC_CHANGE: [
      {
        key: 'quota',
        label: '新资源配额',
        children: `${payload.cpuCores || 0}C / ${payload.memoryGb || 0}GB / GPU ${
          payload.gpuCount || 0
        } / ${payload.storageGb || 0}GB`,
      },
    ],
    DATA_CHANGE: [{ key: 'datasets', label: '挂载数据', children: datasets }],
    CONFIG_CHANGE: [
      { key: 'image', label: '环境镜像', children: payload.imageId || '-' },
      { key: 'network', label: '网络策略', children: payload.networkPolicy || '-' },
    ],
    RECYCLE: [
      {
        key: 'sandboxName',
        label: '沙箱名称',
        children: payload.sandboxName || payload.name || '-',
      },
    ],
  };
  const items = parameterItems[approvalType] || [];
  return (
    <Descriptions
      bordered
      size="small"
      column={2}
      items={[...items, ...common].map((item) => ({
        ...item,
        children: String(item.children ?? '-'),
      }))}
    />
  );
};

export const SandboxApprovalComponent = () => {
  const { pathname, search } = useLocation();
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [keyword, setKeyword] = useState('');
  // 中心端是运营方，不会为自己的数据发起沙箱申请，只保留「待我审核」
  const centerOnly = getEndRole() === EndRole.CENTER;
  const [view, setView] = useState(centerOnly ? 'review' : 'mine');
  const [reviewItem, setReviewItem] = useState<DataSandboxRecord>();
  const [reviewAction, setReviewAction] = useState('');
  const [history, setHistory] = useState<DataSandboxRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detail, setDetail] = useState<DataSandboxRecord>();
  const [reviewForm] = Form.useForm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        responseData(await DataSandboxApi.approvals({ status, type, keyword }), []),
      );
    } catch (error: any) {
      message.error(error.message || '加载申请单失败');
    } finally {
      setLoading(false);
    }
  }, [status, type, keyword]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const review = async (values: DataSandboxRecord) => {
    if (!reviewItem) return;
    try {
      responseData(
        await DataSandboxApi.approvalAction({
          id: reviewItem.id,
          action: reviewAction,
          ...values,
        }),
        {},
      );
      message.success('审批操作完成');
      setReviewItem(undefined);
      setReviewAction('');
      reviewForm.resetFields();
      refresh();
    } catch (error: any) {
      message.error(error.message || '审批失败');
    }
  };

  const directAction = async (item: DataSandboxRecord, action: string) => {
    try {
      responseData(await DataSandboxApi.approvalAction({ id: item.id, action }), {});
      message.success('操作完成');
      refresh();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const openReview = (item: DataSandboxRecord, action: string) => {
    setReviewItem(item);
    setReviewAction(action);
    reviewForm.resetFields();
  };

  const openModelApproval = (id: string) => {
    const params = new URLSearchParams(search);
    params.set('tab', 'model-approval');
    params.set('approvalId', id);
    umiHistory.push({ pathname, search: params.toString() });
  };

  return (
    <MvpPage
      title="项目资源审核"
      description={
        centerOnly
          ? '作为可信执行方审核沙箱与数据资源申请：是否为该申请分配算力、拉起容器、挂载对应的密文数据'
          : '查看我的申请进度，并审核其他项目节点提交的沙箱或数据资源申请'
      }
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      {!centerOnly && (
        <Tabs
          activeKey={view}
          onChange={setView}
          items={[
            { key: 'mine', label: '我的申请' },
            { key: 'review', label: '待我审核' },
          ]}
        />
      )}
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={status}
          onChange={setStatus}
          style={{ width: 160 }}
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          value={type}
          onChange={setType}
          style={{ width: 140 }}
          options={[
            { value: '', label: '全部类型' },
            ...Object.entries(typeLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Input.Search
          placeholder="申请单 ID 或提交人"
          allowClear
          onSearch={setKeyword}
          style={{ width: 280 }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items.filter((item) =>
          view === 'mine'
            ? item.direction !== 'INCOMING'
            : item.direction === 'INCOMING',
        )}
        scroll={{ x: 1100 }}
        columns={[
          {
            title: '申请单',
            dataIndex: 'id',
            render: (id: string, row: DataSandboxRecord) => (
              <Space direction="vertical" size={0}>
                <strong>{id}</strong>
                <span>
                  <Tag color={typeColors[row.approval_type]}>
                    {typeLabels[row.approval_type] || row.approval_type}
                  </Tag>
                </span>
              </Space>
            ),
          },
          {
            title: '资源 ID',
            dataIndex: 'sandbox_id',
            render: (v: string) => (v ? v : '-'),
          },
          { title: '所属方', dataIndex: 'owner_id' },
          {
            title: '所属项目',
            dataIndex: 'project_name',
            render: (value: string, row: DataSandboxRecord) =>
              value || row.project_id || '-',
          },
          { title: '提交人', dataIndex: 'submitter' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: string, row: DataSandboxRecord) => {
              const error = String(row.last_error || '').trim();
              const source = String(row.executor || 'system');
              const errorDetail = error
                ? `${
                    source.startsWith('system:') ? source : `system:${source}`
                  } · ${error}`
                : '';
              return (
                <Space direction="vertical" size={0}>
                  <Tooltip title={errorDetail}>
                    <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>
                  </Tooltip>
                  {v === 'FAILED' && errorDetail && (
                    <span style={{ color: '#ff4d4f', maxWidth: 260 }}>
                      {errorDetail}
                    </span>
                  )}
                </Space>
              );
            },
          },
          {
            title: '重试',
            dataIndex: 'retry_count',
            render: (v: number) => (v > 0 ? `${v} 次` : '-'),
          },
          { title: '提交时间', dataIndex: 'submitted_at', render: formatTime },
          {
            title: '操作',
            width: 280,
            render: (_: unknown, row: DataSandboxRecord) => (
              <Space wrap>
                {view === 'review' &&
                  row.approval_type !== 'MODEL_API' &&
                  REVIEWABLE.includes(row.status) && (
                    <Button type="link" onClick={() => openReview(row, 'APPROVE')}>
                      同意
                    </Button>
                  )}
                {view === 'review' &&
                  row.approval_type !== 'MODEL_API' &&
                  REVIEWABLE.includes(row.status) && (
                    <Button
                      type="link"
                      danger
                      onClick={() => openReview(row, 'REJECT')}
                    >
                      拒绝
                    </Button>
                  )}
                {view === 'mine' && row.status === 'REJECTED' && (
                  <Button type="link" onClick={() => directAction(row, 'RESUBMIT')}>
                    提交复审
                  </Button>
                )}
                {view === 'mine' && row.status === 'FAILED' && (
                  <Button type="link" onClick={() => directAction(row, 'RETRY')}>
                    重试
                  </Button>
                )}
                {view === 'mine' && CANCELLABLE.includes(row.status) && (
                  <Button type="link" onClick={() => directAction(row, 'CANCEL')}>
                    撤回
                  </Button>
                )}
                <Button
                  type="link"
                  onClick={async () => {
                    setHistory(
                      responseData(await DataSandboxApi.approvalHistory(row.id), []),
                    );
                    setHistoryOpen(true);
                  }}
                >
                  审批记录
                </Button>
                <Button
                  type="link"
                  onClick={async () => {
                    if (row.approval_type === 'MODEL_API') {
                      openModelApproval(row.id);
                      return;
                    }
                    setDetail(
                      responseData(await DataSandboxApi.approvalDetail(row.id), {}),
                    );
                  }}
                >
                  {row.approval_type === 'MODEL_API' ? '审批并测试' : '详细信息'}
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={`${reviewAction === 'APPROVE' ? '同意' : '拒绝'}：${
          reviewItem?.id || ''
        }（${reviewItem ? typeLabels[reviewItem.approval_type] : ''}）`}
        open={!!reviewItem}
        onCancel={() => {
          setReviewItem(undefined);
          setReviewAction('');
        }}
        onOk={() => reviewForm.submit()}
        okText={reviewAction === 'APPROVE' ? '确认同意' : '确认拒绝'}
        cancelText="取消"
        okButtonProps={reviewAction === 'REJECT' ? { danger: true } : undefined}
      >
        <Form form={reviewForm} layout="vertical" onFinish={review}>
          <Form.Item name="comment" label="审批意见" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="审批记录"
        width={560}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      >
        <Timeline
          items={history.map((item) => ({
            color: ['REJECTED', 'FAILED', 'CANCELLED'].includes(item.to_status)
              ? 'red'
              : 'blue',
            children: (
              <>
                <strong>
                  {item.action}: {item.from_status || '新建'} → {item.to_status}
                </strong>
                <div>
                  {item.operator} · {formatTime(item.created_at)}
                </div>
                <div>{item.comment || '无审批意见'}</div>
              </>
            ),
          }))}
        />
      </Drawer>
      <Modal
        title="申请详细信息"
        width={800}
        footer={null}
        open={!!detail}
        onCancel={() => setDetail(undefined)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>申请单：{detail?.id}</div>
          <div>资源 ID：{detail?.sandbox_id || '待创建'}</div>
          <div>所属节点 ID：{detail?.applicant_node_id || detail?.owner_id}</div>
          <div>所属项目：{detail?.project_name || detail?.project_id || '-'}</div>
          <div>提交人：{detail?.submitter}</div>
          {detail?.approval_type === 'ASSET_DELETE' && (
            <>
              <div>数据名称：{detail?.asset_detail?.name || '未知'}</div>
              <div>
                数据提供方：
                {detail?.asset_detail?.provider_node_name ||
                  detail?.asset_detail?.provider_node_id ||
                  '未知'}
              </div>
              <div>
                上传时间：{formatTime(detail?.asset_detail?.uploaded_at) || '未知'}
              </div>
              <div>
                数据类型：
                {detail?.asset_detail?.data_stage === 'RAW'
                  ? '源数据'
                  : detail?.asset_detail?.data_stage === 'PROCESSED'
                  ? '抽样脱敏后数据'
                  : '未知'}
              </div>
              <div>
                是否项目共享数据：{detail?.asset_detail?.project_shared ? '是' : '否'}
              </div>
              <div>关联项目：</div>
              <Table
                size="small"
                pagination={false}
                rowKey="project_id"
                locale={{ emptyText: '暂无关联项目' }}
                dataSource={detail?.asset_detail?.projects || []}
                columns={[
                  { title: '项目名称', dataIndex: 'name' },
                  { title: '项目 ID', dataIndex: 'project_id' },
                ]}
              />
            </>
          )}
          <div>项目节点投票：</div>
          <Table
            size="small"
            pagination={false}
            rowKey="voter_node_id"
            dataSource={detail?.votes || []}
            columns={[
              { title: '节点', dataIndex: 'voter_node_id' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (v: string) => <Tag>{v}</Tag>,
              },
              { title: '审核人', dataIndex: 'voter' },
              { title: '意见', dataIndex: 'comment' },
            ]}
          />
          <div>申请参数：</div>
          <ApprovalParameters detail={detail} />
        </Space>
      </Modal>
    </MvpPage>
  );
};
