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

import { MvpPage, RefreshButton, formatTime } from '@/modules/data-sandbox-mvp/common';
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
      const [mineResponse, pendingResponse] = await Promise.all([
        TeeExportApi.mine(),
        TeeExportApi.pending(),
      ]);
      setMine(responseData(mineResponse, {}).items || []);
      setPending(responseData(pendingResponse, {}).items || []);
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

  const retrieve = async (row: DataSandboxRecord) => {
    try {
      const result = responseData(await TeeExportApi.exportEnvelope(row.resultId), {});
      Modal.success({
        title: '密钥信封已取回',
        content: (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="密文对象">
              <Text copyable>{result.objectId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="有效期至">
              {formatTime(result.expiresAt)}
            </Descriptions.Item>
            <Descriptions.Item label="接收者证书">
              <Text copyable>{result.keyEnvelope?.recipientCertSha256}</Text>
            </Descriptions.Item>
          </Descriptions>
        ),
      });
    } catch (requestError: unknown) {
      message.error(errorMessage(requestError, '取回密钥信封失败'));
    }
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
            <Button type="link" onClick={() => retrieve(row)}>
              取回信封
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

  return (
    <MvpPage
      title="结果导出审批"
      description="DATA 与 MODEL 密文结果需全部贡献机构同意后取回五分钟有效的密钥信封"
      error={error}
      onRetry={refresh}
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <Alert
        showIcon
        type="info"
        message="中心端只裁决审批并密封结果密钥，不解密导出结果。REPORT 按授权规则明文展示，无需申请。"
        style={{ marginBottom: 16 }}
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
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
                <Empty description="暂无导出申请，请从密文结果卡发起" />
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
