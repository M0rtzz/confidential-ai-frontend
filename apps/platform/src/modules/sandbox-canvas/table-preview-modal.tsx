import { Drawer, Empty, Spin, Table } from 'antd';
import { useEffect, useState } from 'react';

import { DataComputeApi, responseData } from '@/services/data-sandbox';

/**
 * 沙箱数据表预览（数据资源 / 画布中间结果 / 组件输入数据 通用）：
 * 基于 /data-compute/sandbox-db/table-preview 读取 schema + 前 limit 行。
 */
export const TablePreviewModal = ({
  sandboxId,
  tableName,
  title,
  open,
  onClose,
}: {
  sandboxId: string;
  tableName: string;
  title?: string;
  open: boolean;
  onClose: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open || !sandboxId || !tableName) return;
    const load = async () => {
      setLoading(true);
      try {
        setOutput(
          responseData(
            await DataComputeApi.sandboxDbPreview(sandboxId, tableName, 50),
            {},
          ),
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, sandboxId, tableName]);

  const schema = (output.schema as Record<string, string>[]) || [];
  const rows = (output.rows as unknown[][]) || [];
  const columns = schema.map((c, i) => ({
    title: String(c.name ?? ''),
    dataIndex: i,
    width: 140,
    ellipsis: true,
    render: (v: unknown) => (v === null || v === undefined ? '' : String(v)),
  }));

  return (
    <Drawer
      title={title || `数据预览：${tableName}`}
      width={760}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {rows.length ? (
          <Table
            size="small"
            rowKey={(_, i) => String(i)}
            dataSource={rows}
            columns={columns}
            scroll={{ x: 'max-content', y: 420 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        ) : (
          <Empty description={loading ? '加载中…' : '无数据'} />
        )}
      </Spin>
    </Drawer>
  );
};
