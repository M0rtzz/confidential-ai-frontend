import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { formatTime, saveBlob } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

import { kindLabel, short } from './common';
import { DetailPanel } from './detail-panel';
import styles from './index.less';
import { receiptDuration, receiptPayload, taskStatusLabel } from './receipt-format';

const taskStateColor: Record<string, string> = {
  SUCCEEDED: 'success',
  RUNNING: 'processing',
  FAILED: 'error',
};

/** 可信执行回执卡：Descriptions 展示 + 导出 JSON / 打印 */
const ReceiptCard = ({
  taskId,
  task,
  open,
  onClose,
}: {
  taskId: string;
  task?: DataSandboxRecord;
  open: boolean;
  onClose: () => void;
}) => {
  const [receipt, setReceipt] = useState<DataSandboxRecord>();
  const [loading, setLoading] = useState(false);

  const [payload, setPayload] = useState<DataSandboxRecord>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !taskId) return;
    let active = true;
    setReceipt(undefined);
    setPayload(undefined);
    setError('');
    setLoading(true);
    void TrustChainApi.taskReceipt(taskId)
      .then((response) => {
        const result = responseData(response, {});
        const decoded = receiptPayload(result, taskId);
        if (active) {
          setReceipt(result);
          setPayload(decoded);
        }
      })
      .catch((failure) => {
        if (active) setError(requestErrorMessage(failure, '加载可信执行回执失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [taskId, open]);

  const exportJson = () => {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], {
      type: 'application/json',
    });
    saveBlob(blob, `tee-receipt-${taskId}.json`);
  };

  return (
    <Drawer
      title={`可信执行回执：${short(taskId, 20)}`}
      width={760}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={exportJson} disabled={!receipt}>
            导出 JSON
          </Button>
          <Button onClick={() => window.print()} disabled={!receipt}>
            打印
          </Button>
        </Space>
      }
    >
      {error && <Alert type="error" showIcon message={error} />}
      {payload && (
        <div className={styles.receiptPrintArea}>
          <Space wrap style={{ marginBottom: 16 }}>
            <Tag color={taskStateColor[payload.status] || 'default'}>
              {taskStatusLabel(payload.status)}
            </Tag>
            <Tag color="success">回执验签通过</Tag>
            {payload.attestationVerified === true && (
              <Tag color="success">硬件证明已验证</Tag>
            )}
          </Space>
          <Descriptions title="执行概况" bordered size="small" column={1}>
            <Descriptions.Item label="任务编号">
              <Typography.Text copyable>{taskId}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="发起机构">
              {task?.callerId || '未提供'}
            </Descriptions.Item>
            <Descriptions.Item label="算子">
              {task?.operator || '未提供'}
            </Descriptions.Item>
            <Descriptions.Item label="开始时间">
              {formatTime(payload.startedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="结束时间">
              {formatTime(payload.finishedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="执行耗时">
              {receiptDuration(payload.startedAt, payload.finishedAt)}
            </Descriptions.Item>
            {payload.errorCode && (
              <Descriptions.Item label="错误码">
                {String(payload.errorCode)}
              </Descriptions.Item>
            )}
          </Descriptions>
          <Descriptions
            title="执行依据"
            bordered
            size="small"
            column={1}
            style={{ marginTop: 20 }}
          >
            <Descriptions.Item label="贡献机构">
              {Array.isArray(task?.contributors)
                ? task.contributors.join('、') || '未提供'
                : '未提供'}
            </Descriptions.Item>
            <Descriptions.Item label="规则版本">
              {payload.policyVersion == null
                ? '未提供'
                : JSON.stringify(payload.policyVersion)}
            </Descriptions.Item>
            <Descriptions.Item label="本次密钥放行次数">
              {payload.keyReleaseCount ?? '未提供'}
            </Descriptions.Item>

            <Descriptions.Item label="契约版本">
              {payload.contractVersion || '未提供'}
            </Descriptions.Item>
          </Descriptions>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            本次产出
          </Typography.Title>
          <Table
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            rowKey={(row, index) => row.resultId || row.objectId || String(index)}
            dataSource={Array.isArray(payload.outputs) ? payload.outputs : []}
            locale={{ emptyText: '无产出记录' }}
            columns={[
              {
                title: '结果编号',
                dataIndex: 'resultId',
                render: (v) =>
                  v ? (
                    <Typography.Text copyable={{ text: v }}>
                      {short(v, 20)}
                    </Typography.Text>
                  ) : (
                    '未提供'
                  ),
              },
              { title: '类型', dataIndex: 'kind', render: kindLabel },
              {
                title: '存储形式',
                dataIndex: 'encrypted',
                render: (v) =>
                  v === true ? '密文' : v === false ? '明文报告' : '未提供',
              },
              {
                title: '贡献机构',
                dataIndex: 'contributors',
                render: (v) => (Array.isArray(v) ? v.join('、') || '未提供' : '未提供'),
              },
              { title: '报告类型', dataIndex: 'reportKind', render: (v) => v || '—' },
            ]}
          />
          <Collapse ghost style={{ marginTop: 16 }}>
            <Collapse.Panel header="原始回执" key="raw">
              <pre className={styles.hexBlock}>
                {JSON.stringify({ ...receipt, decodedPayload: payload }, null, 2)}
              </pre>
            </Collapse.Panel>
          </Collapse>
        </div>
      )}
      {loading && !receipt && <div>加载中...</div>}
    </Drawer>
  );
};

/** ⑤ TEE 执行：任务表，点行打开可信执行回执卡 */
export const TasksDrawer = ({
  open,
  onClose,
  inline,
}: {
  inline?: boolean;
  open: boolean;
  onClose: () => void;
}) => {
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiptTaskId, setReceiptTaskId] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(responseData(await TrustChainApi.tasks(50), {}).items || []);
    } catch (error) {
      message.error(requestErrorMessage(error, '加载 TEE 执行任务失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <DetailPanel
      inline={inline}
      title="TEE 执行"
      width={900}
      open={open}
      onClose={onClose}
    >
      <Typography.Paragraph type="secondary">
        最近 {items.length} 条执行记录（最多 50 条）
      </Typography.Paragraph>
      <Table
        rowKey="taskId"
        size="small"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: '任务编号',
            dataIndex: 'taskId',
            render: (v) => (
              <Typography.Text copyable={{ text: v }}>{short(v, 20)}</Typography.Text>
            ),
          },
          { title: '发起机构', dataIndex: 'callerId' },
          { title: '算子', dataIndex: 'operator' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: string) => (
              <Tag color={taskStateColor[v] || 'default'}>{taskStatusLabel(v)}</Tag>
            ),
          },
          {
            title: '回执验签',
            dataIndex: 'receiptVerified',
            render: (v: boolean) => (
              <Tag color={v ? 'success' : 'default'}>
                {v ? '已验证' : '暂无已验证回执'}
              </Tag>
            ),
          },
          { title: '创建时间', dataIndex: 'gmtCreate', render: formatTime },
          {
            title: '操作',
            render: (_, row) => (
              <Button
                type="link"
                disabled={!row.receiptVerified}
                onClick={() => {
                  setReceiptTaskId(row.taskId);
                  setReceiptOpen(true);
                }}
              >
                查看回执
              </Button>
            ),
          },
        ]}
      />
      <ReceiptCard
        task={items.find((item) => item.taskId === receiptTaskId)}
        taskId={receiptTaskId}
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
      />
    </DetailPanel>
  );
};
