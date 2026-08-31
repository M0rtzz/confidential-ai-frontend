import { Button, Form, Input, message, Modal, Space, Tabs, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';

import { DataManagerComponent } from '@/modules/data-manager/data-manager.view';
import { DataSourceListComponent } from '@/modules/data-source-list';
import { MvpPage } from '@/modules/data-sandbox-mvp/common';
import { DataAssetApi, responseData } from '@/services/data-sandbox';

/**
 * Unified ingestion entry.  Connection registration and table/file registration
 * remain separate internally so existing SecretPad flows keep working.
 */
export const DataUploadComponent = () => {
  const [apiOpen, setApiOpen] = useState(false);
  const [apiForm] = Form.useForm();
  const upload = async ({ file, onSuccess, onError }: any) => {
    const body = new FormData();
    body.append('file', file);
    try {
      const response = await fetch('/api/v1alpha1/data-assets/files/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'User-Token': localStorage.getItem('User-Token') || '' },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onSuccess(await response.json());
      message.success('源数据上传成功');
    } catch (error) {
      onError(error);
      message.error('上传失败');
    }
  };
  return (
    <MvpPage title="数据上传" description="上传或注册当前节点的文件、API 与库表源数据">
      <Space style={{ marginBottom: 16 }}>
        <Upload accept=".csv,image/png" showUploadList customRequest={upload}>
          <Button type="primary" icon={<UploadOutlined />}>
            上传 CSV / PNG
          </Button>
        </Upload>
        <Button onClick={() => setApiOpen(true)}>创建 API GET 快照</Button>
        <span>CSV 最大 500MB，PNG 最大 20MB，文件保存至 MinIO。</span>
      </Space>
      <Tabs
        destroyInactiveTabPane
        items={[
          {
            key: 'assets',
            label: '文件与数据表',
            children: <DataManagerComponent />,
          },
          {
            key: 'connections',
            label: '数据源连接',
            children: <DataSourceListComponent />,
          },
        ]}
      />
      <Modal
        title="创建 API 数据快照"
        open={apiOpen}
        onCancel={() => setApiOpen(false)}
        onOk={() => apiForm.submit()}
      >
        <Form
          form={apiForm}
          layout="vertical"
          onFinish={async (values) => {
            try {
              const headers = values.headers ? JSON.parse(values.headers) : {};
              responseData(
                await DataAssetApi.createApiSnapshot({ ...values, headers }),
                {},
              );
              message.success('API 快照已保存为源数据');
              setApiOpen(false);
              apiForm.resetFields();
            } catch (error: any) {
              message.error(error.message || 'API 快照创建失败，请检查请求头 JSON');
            }
          }}
        >
          <Form.Item name="name" label="数据名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="url"
            label="GET API 地址"
            rules={[{ required: true, type: 'url' }]}
          >
            <Input placeholder="https://example.com/data.csv" />
          </Form.Item>
          <Form.Item name="headers" label="请求头（JSON，可选）">
            <Input.TextArea rows={4} placeholder={'{"Authorization":"Bearer ..."}'} />
          </Form.Item>
        </Form>
      </Modal>
    </MvpPage>
  );
};
