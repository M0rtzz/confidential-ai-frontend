import { Button, Descriptions, Drawer, Space, Table, Tag, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { formatTime, saveBlob } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import { responseData, TrustChainApi } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

import { short } from './common';

import styles from './index.less';

const taskStateColor: Record<string, string> = {
  SUCCEEDED: 'success',
  RUNNING: 'processing',
  FAILED: 'error',
};

/** 可信执行回执卡：Descriptions 展示 + 导出 JSON / 打印 */
const ReceiptCard = ({
  taskId,
  open,
  onClose,
}: {
  taskId: string;
  open: boolean;
  onClose: () => void;
}) => {
  const [receipt, setReceipt] = useState<DataSandboxRecord>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      setReceipt(responseData(await TrustChainApi.taskReceipt(taskId), {}));
    } catch (error) {
      message.error(requestErrorMessage(error, '加载可信执行回执失败'));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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
      width={640}
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
      {receipt && (
        <div className={styles.receiptPrintArea}>
          <Descriptions bordered size="small" column={1}>
            {Object.entries(receipt).map(([key, value]) => (
              <Descriptions.Item label={key} key={key}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
              </Descriptions.Item>
            ))}
          </Descriptions>
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
}: {
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
    <Drawer title="TEE 执行" width={900} open={open} onClose={onClose}>
      <Table
        rowKey="taskId"
        size="small"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        onRow={(row) => ({
          style: { cursor: 'pointer' },
          onClick: () => {
            setReceiptTaskId(row.taskId);
            setReceiptOpen(true);
          },
        })}
        columns={[
          { title: '任务标识', dataIndex: 'taskId', render: (v) => short(v, 18) },
          { title: '发起机构', dataIndex: 'callerId' },
          { title: '算子', dataIndex: 'operator' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: string) => <Tag color={taskStateColor[v] || 'default'}>{v}</Tag>,
          },
          {
            title: '回执验签',
            dataIndex: 'receiptVerified',
            render: (v: boolean) => (
              <Tag color={v ? 'success' : 'error'}>{v ? '通过' : '未通过'}</Tag>
            ),
          },
          { title: '创建时间', dataIndex: 'gmtCreate', render: formatTime },
        ]}
      />
      <ReceiptCard
        taskId={receiptTaskId}
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
      />
    </Drawer>
  );
};
