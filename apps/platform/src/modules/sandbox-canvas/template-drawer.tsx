import { Button, Drawer, List, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { history } from 'umi';

import { DataComputeApi, responseData } from '@/services/data-sandbox';
import { useModel } from '@/util/valtio-helper';

import { SandboxCanvasView } from './sandbox-canvas.view';

const useLocalLoading = () => {
  const [loading, setLoading] = useState(false);
  return [loading, setLoading] as const;
};

export const TemplateDrawer = () => {
  const view = useModel(SandboxCanvasView);
  const [loading, setLoading] = useLocalLoading();

  const importTemplate = async (code: string) => {
    setLoading(true);
    try {
      const canvas = responseData(
        await DataComputeApi.canvasImportTemplate({
          sandboxId: view.sandboxId,
          code,
        }),
        {},
      );
      message.success('模板导入成功，已打开新画布');
      view.closeDrawer();
      // 跳转到新画布（复用当前项目/沙箱上下文）
      history.replace({
        pathname: '/dag',
        search: `projectId=${view.projectId}&sandboxId=${view.sandboxId}&mode=MPC&type=DAG&computeCanvasId=${canvas.id}`,
      });
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      title="内置模板库"
      width={480}
      open={view.drawer === 'templates'}
      onClose={() => view.closeDrawer()}
      destroyOnClose
    >
      <List
        loading={loading}
        dataSource={view.templates}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="import"
                type="primary"
                size="small"
                onClick={() => importTemplate(String(item.code))}
              >
                一键导入
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  {item.name}
                  <Tag color="blue">{item.category}</Tag>
                </Space>
              }
              description={
                <Typography.Paragraph
                  type="secondary"
                  style={{ marginBottom: 0 }}
                  ellipsis={{ rows: 2 }}
                >
                  {item.description}
                </Typography.Paragraph>
              }
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
};
