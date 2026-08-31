import {
  Button,
  Descriptions,
  Drawer,
  List,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';

import { DataComputeApi, responseData } from '@/services/data-sandbox';
import { useModel } from '@/util/valtio-helper';

import { SandboxCanvasView } from './sandbox-canvas.view';

export const VersionsDrawer = () => {
  const view = useModel(SandboxCanvasView);
  const [compare, setCompare] = useState<Record<string, unknown> | null>(null);

  const rollback = async (versionId: string) => {
    try {
      const canvas = responseData(
        await DataComputeApi.canvasRollbackVersion({ versionId }),
        {},
      );
      message.success(`已回滚到版本，当前画布 version=${canvas.version}`);
      view.loadVersions();
    } catch (e) {
      message.error(String(e));
    }
  };

  const doCompare = async (a: string, b: string) => {
    try {
      setCompare(responseData(await DataComputeApi.canvasCompareVersions(a, b), {}));
    } catch (e) {
      message.error(String(e));
    }
  };

  const paramColumns = [
    { title: '节点', dataIndex: 'nodeName', width: 120 },
    {
      title: '参数变化',
      dataIndex: 'changes',
      render: (changes: Record<string, { from: string; to: string }>) => (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {Object.entries(changes || {}).map(([k, v]) => (
            <li key={k}>
              {k}: <Tag>{v.from}</Tag> → <Tag color="blue">{v.to}</Tag>
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <Drawer
      title="画布版本管理"
      width={560}
      open={view.drawer === 'versions'}
      onClose={() => view.closeDrawer()}
      destroyOnClose
    >
      <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label="当前版本">
          <Tag color="green">v{String(view.canvas.version || 1)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="保存行为">
          显式「保存」生成版本记录，自动保存不生成
        </Descriptions.Item>
      </Descriptions>
      <List
        size="small"
        dataSource={view.versions}
        renderItem={(item, index) => (
          <List.Item
            actions={[
              <Popconfirm
                key="rb"
                title="回滚到该版本？当前画布内容将被该版本覆盖"
                onConfirm={() => rollback(String(item.id))}
              >
                <Button size="small">回滚</Button>
              </Popconfirm>,
              <Button
                key="cmp"
                size="small"
                onClick={() =>
                  doCompare(String(view.versions[index + 1]?.id), String(item.id))
                }
                disabled={index >= view.versions.length - 1}
              >
                与上一版对比
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Tag color="blue">v{String(item.version)}</Tag>
                  <span>{String(item.name)}</span>
                </Space>
              }
              description={`${String(item.created_by || '')} · ${String(
                item.created_at || '',
              )}`}
            />
          </List.Item>
        )}
      />
      <Modal
        title="版本对比"
        open={!!compare}
        width={720}
        footer={null}
        onCancel={() => setCompare(null)}
      >
        {compare && (
          <>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="版本 A">
                v{String((compare.versionA as Record<string, unknown>)?.version)}
              </Descriptions.Item>
              <Descriptions.Item label="版本 B">
                v{String((compare.versionB as Record<string, unknown>)?.version)}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph style={{ marginTop: 8 }}>
              新增节点（相对 A）：
              {(compare.nodeAdds as string[])?.map((n, i) => (
                <Tag key={i} color="green">
                  {n}
                </Tag>
              )) || '无'}
            </Typography.Paragraph>
            <Typography.Paragraph>
              移除节点：
              {(compare.nodeRemoves as string[])?.map((n, i) => (
                <Tag key={i} color="red">
                  {n}
                </Tag>
              )) || '无'}
            </Typography.Paragraph>
            <Typography.Paragraph>
              新增连线：
              {(compare.edgeAdds as string[])?.map((n, i) => (
                <Tag key={i} color="cyan">
                  {n}
                </Tag>
              )) || '无'}
            </Typography.Paragraph>
            <Typography.Paragraph>
              移除连线：
              {(compare.edgeRemoves as string[])?.map((n, i) => (
                <Tag key={i} color="volcano">
                  {n}
                </Tag>
              )) || '无'}
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey="nodeId"
              dataSource={(compare.paramChanges as Record<string, unknown>[]) || []}
              columns={paramColumns}
              pagination={false}
            />
          </>
        )}
      </Modal>
    </Drawer>
  );
};
