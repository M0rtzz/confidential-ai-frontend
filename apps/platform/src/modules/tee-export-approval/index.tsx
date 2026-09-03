import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';

import {
  MvpPage,
  RefreshButton,
  formatTime,
  saveBlob,
} from '@/modules/data-sandbox-mvp/common';
import { TeeExportApi, responseData } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

import { requestErrorMessage } from './error';

const { Paragraph, Text } = Typography;

const statusLabel: Record<string, string> = {
  PENDING_APPROVAL: '待审批',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已撤回',
  PENDING: '待投票',
};

const statusColor: Record<string, string> = {
  PENDING_APPROVAL: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
  PENDING: 'default',
};

const short = (value?: unknown, size = 12) => {
  const text = String(value || '');
  return text.length > size ? `${text.slice(0, size)}…` : text || '-';
};

const errorMessage = requestErrorMessage;

export const TeeExportApprovalComponent = () => {
  const [mine, setMine] = useState<DataSandboxRecord[]>([]);
  const [pending, setPending] = useState<DataSandboxRecord[]>([]);
  const [exportable, setExportable] = useState<DataSandboxRecord[]>([]);
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [detail, setDetail] = useState<DataSandboxRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mineResponse, pendingResponse, exportableResponse] = await Promise.all([
        TeeExportApi.mine(),
        TeeExportApi.pending(),
        TeeExportApi.exportable(),
      ]);
      setMine(responseData(mineResponse, {}).items || []);
      setPending(responseData(pendingResponse, {}).items || []);
      setExportable(responseData(exportableResponse, {}).items || []);
    } catch (requestError: unknown) {
      const text = errorMessage(requestError, '加载结果导出审批失败');
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = useCallback(async (exportId: string) => {
    try {
      setDetail(responseData(await TeeExportApi.detail(exportId), {}));
      setDetailOpen(true);
    } catch (requestError: unknown) {
      message.error(errorMessage(requestError, '加载工单详情失败'));
    }
  }, []);

  const act = async (action: 'APPROVE' | 'REJECT', comment = '') => {
    if (!detail?.exportId) return;
    setActionLoading(true);
    try {
      const next = responseData(
        await TeeExportApi.action(detail.exportId, action, comment),
        {},
      );
      setDetail(next);
      setRejectOpen(false);
      setRejectComment('');
      message.success(action === 'APPROVE' ? '已同意导出' : '已拒绝导出');
      await refresh();
    } catch (requestError: unknown) {
      message.error(errorMessage(requestError, '投票失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const cancel = (row: DataSandboxRecord) => {
    Modal.confirm({
      title: '撤回导出申请',
      content: '撤回后该工单不能继续投票，确定撤回？',
      okText: '撤回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await TeeExportApi.cancel(row.exportId);
          message.success('已撤回');
          setDetailOpen(false);
          await refresh();
        } catch (requestError: unknown) {
          message.error(errorMessage(requestError, '撤回失败'));
        }
      },
    });
  };

  /** 取回信封、在本机构平台内解封解密，并把结果明文直接交给浏览器保存。 */
  const retrieve = async (row: DataSandboxRecord) => {
    setBusyId(row.exportId);
    try {
      const { blob, fileName } = await TeeExportApi.download(row.exportId);
      saveBlob(blob, fileName);
      message.success(`已解密并下载 ${fileName}`);
    } catch (requestError: unknown) {
      message.error(errorMessage(requestError, '取回并解密失败'));
    } finally {
      setBusyId('');
    }
  };

  /** 从可导出结果发起工单；接收方固定为当前机构的受管证书。 */
  const submitExport = (row: DataSandboxRecord) => {
    Modal.confirm({
      title: '申请导出密文结果',
      content: '接收方为当前机构，系统将使用本机构受管证书密封结果密钥。确认提交？',
      okText: '提交申请',
      cancelText: '取消',
      onOk: async () => {
        try {
          await TeeExportApi.create(row.resultId);
          message.success('导出申请已提交，请等待全部贡献机构投票');
          await refresh();
          setActiveTab('mine');
        } catch (requestError: unknown) {
          message.error(errorMessage(requestError, '提交导出申请失败'));
        }
      },
    });
  };

  const columns = [
    {
      title: '结果',
      key: 'result',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.kind || '-'}</Text>
          <Text type="secondary" copyable={{ text: row.resultId }}>
            {short(row.resultId, 18)}
          </Text>
        </Space>
      ),
    },
    {
      title: '密文对象',
      key: 'object',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <Text copyable={{ text: row.objectId }}>{short(row.objectId)}</Text>
          <Text type="secondary">摘要 {short(row.ciphertextSha256, 8)}</Text>
        </Space>
      ),
    },
    {
      title: '票面',
      key: 'votes',
      render: (_: unknown, row: DataSandboxRecord) => {
        const votes = Array.isArray(row.votes) ? row.votes : [];
        const approved = votes.filter(
          (vote: DataSandboxRecord) => vote.status === 'APPROVED',
        ).length;
        return `${approved}/${votes.length}`;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => (
        <Tag color={statusColor[value]}>{statusLabel[value] || value}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(row.exportId)}>
            查看详情
          </Button>
          {row.status === 'APPROVED' && (
            <Button
              type="link"
              loading={busyId === row.exportId}
              onClick={() => retrieve(row)}
            >
              取回并解密
            </Button>
          )}
          {row.canCancel && activeTab === 'mine' && (
            <Button type="link" danger onClick={() => cancel(row)}>
              撤回
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const exportableColumns = [
    {
      title: '结果',
      key: 'result',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.kind || '-'}</Text>
          <Text type="secondary" copyable={{ text: row.resultId }}>
            {short(row.resultId, 18)}
          </Text>
        </Space>
      ),
    },
    {
      title: '密文对象',
      key: 'object',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space direction="vertical" size={0}>
          <Text copyable={{ text: row.objectId }}>{short(row.objectId)}</Text>
          <Text type="secondary">摘要 {short(row.ciphertextSha256, 8)}</Text>
        </Space>
      ),
    },
    {
      title: '结果密钥',
      key: 'key',
      render: (_: unknown, row: DataSandboxRecord) =>
        `${short(row.keyId, 18)} · v${row.keyVersion || '-'}`,
    },
    {
      title: '贡献机构',
      key: 'contributors',
      render: (_: unknown, row: DataSandboxRecord) =>
        (Array.isArray(row.contributors) ? row.contributors : []).join('、') || '-',
    },
    {
      title: '已有工单',
      key: 'latest',
      render: (_: unknown, row: DataSandboxRecord) =>
        row.latestStatus ? (
          <Tag color={statusColor[row.latestStatus]}>
            {statusLabel[row.latestStatus] || row.latestStatus}
          </Tag>
        ) : (
          <Text type="secondary">未申请</Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space wrap>
          <Button type="link" onClick={() => submitExport(row)}>
            申请导出
          </Button>
          {row.latestExportId && (
            <Button type="link" onClick={() => openDetail(row.latestExportId)}>
              查看工单
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <MvpPage
      title="结果导出审批"
      description="DATA 与 MODEL 密文结果需全部贡献机构同意后，由本机构平台取回信封、本地解封并下载明文"
      error={error}
      onRetry={refresh}
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <Alert
        showIcon
        type="info"
        message="中心端只裁决审批并密封结果密钥，不解密导出结果；信封在本机构平台内使用，不进入浏览器。REPORT 按授权规则明文展示，无需申请。"
        style={{ marginBottom: 16 }}
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'exportable',
            label: `可导出结果${exportable.length ? ` (${exportable.length})` : ''}`,
            children:
              exportable.length || loading ? (
                <Table
                  rowKey="resultId"
                  loading={loading}
                  dataSource={exportable}
                  columns={exportableColumns}
                  pagination={{ pageSize: 10 }}
                />
              ) : (
                <Empty description="本机构暂无可导出的密文结果" />
              ),
          },
          {
            key: 'pending',
            label: `待我审批${pending.length ? ` (${pending.length})` : ''}`,
            children:
              pending.length || loading ? (
                <Table
                  rowKey="exportId"
                  loading={loading}
                  dataSource={pending}
                  columns={columns}
                  pagination={{ pageSize: 10 }}
                />
              ) : (
                <Empty description="暂无待审批工单" />
              ),
          },
          {
            key: 'mine',
            label: `我的申请${mine.length ? ` (${mine.length})` : ''}`,
            children:
              mine.length || loading ? (
                <Table
                  rowKey="exportId"
                  loading={loading}
                  dataSource={mine}
                  columns={columns}
                  pagination={{ pageSize: 10 }}
                />
              ) : (
                <Empty description="暂无导出申请，请在「可导出结果」页签发起" />
              ),
          },
        ]}
      />

      <Drawer
        title={`导出工单：${detail?.exportId || ''}`}
        width={720}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        extra={
          detail?.canVote ? (
            <Space>
              <Button danger onClick={() => setRejectOpen(true)}>
                拒绝
              </Button>
              <Button
                type="primary"
                loading={actionLoading}
                onClick={() => act('APPROVE')}
              >
                同意
              </Button>
            </Space>
          ) : null
        }
      >
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="结果类型">{detail.kind}</Descriptions.Item>
              <Descriptions.Item label="结果标识">
                <Text copyable>{detail.resultId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="密文对象">
                <Text copyable>{detail.objectId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="结果摘要">
                <Text copyable>{detail.ciphertextSha256}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="结果密钥">
                {detail.keyId} · v{detail.keyVersion}
              </Descriptions.Item>
              <Descriptions.Item label="导出状态">
                <Tag color={statusColor[detail.status]}>
                  {statusLabel[detail.status] || detail.status}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <Paragraph type="secondary">
              TEE 结果为密文对象，导出审批完成前不提供明文预览。
            </Paragraph>
            <Table
              size="small"
              rowKey="ownerId"
              pagination={false}
              dataSource={detail.votes || []}
              columns={[
                { title: '贡献机构', dataIndex: 'ownerId' },
                {
                  title: '票面',
                  dataIndex: 'status',
                  render: (value: string) => (
                    <Tag color={statusColor[value]}>{statusLabel[value] || value}</Tag>
                  ),
                },
                { title: '审批人', dataIndex: 'voter', render: (v) => v || '-' },
                { title: '意见', dataIndex: 'comment', render: (v) => v || '-' },
                { title: '时间', dataIndex: 'votedAt', render: formatTime },
              ]}
            />
          </Space>
        )}
      </Drawer>

      <Modal
        title="拒绝导出"
        open={rejectOpen}
        okText="确认拒绝"
        okButtonProps={{ danger: true, disabled: !rejectComment.trim() }}
        cancelText="取消"
        confirmLoading={actionLoading}
        onCancel={() => setRejectOpen(false)}
        onOk={() => act('REJECT', rejectComment.trim())}
      >
        <Input.TextArea
          value={rejectComment}
          onChange={(event) => setRejectComment(event.target.value)}
          placeholder="请输入拒绝意见"
          maxLength={1000}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Modal>
    </MvpPage>
  );
};
