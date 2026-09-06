import { DownloadOutlined, KeyOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, message, Modal, Space, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { useState } from 'react';

import {
  exportUserEncryptionKey,
  getSessionIdentity,
  importUserEncryptionKey,
  userKeyFileName,
} from '@/security/crypto';

export const CustomerKeyManagement = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm<{ password: string }>();

  const exportKey = async () => {
    const { password } = await form.validateFields();
    setBusy(true);
    try {
      await getSessionIdentity();
      const blob = await exportUserEncryptionKey(password);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = userKeyFileName();
      link.click();
      URL.revokeObjectURL(url);
      message.success('客户密钥已使用恢复口令加密并导出');
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '密钥导出失败');
    } finally {
      setBusy(false);
    }
  };

  const importKey = async () => {
    const { password } = await form.validateFields();
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning('请选择 .dskey 密钥备份文件');
      return;
    }
    setBusy(true);
    try {
      const result = await importUserEncryptionKey(file, password);
      setFileList([]);
      form.resetFields();
      message.success(`客户密钥已恢复：${result.kid}`);
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '密钥恢复失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button icon={<KeyOutlined />} onClick={() => setOpen(true)}>
        客户密钥管理
      </Button>
      <Modal
        title="客户密钥管理"
        open={open}
        footer={null}
        onCancel={() => !busy && setOpen(false)}
      >
        <Alert
          showIcon
          type="warning"
          message="密钥备份文件由恢复口令加密"
          description="服务器不会取得客户私钥或恢复口令。丢失浏览器密钥、备份文件和恢复口令后，历史密文无法恢复。"
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item
            name="password"
            label="恢复口令"
            rules={[
              { required: true, message: '请输入恢复口令' },
              { min: 10, message: '恢复口令至少 10 个字符' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="导入密钥文件">
            <Upload
              accept=".dskey,application/json"
              beforeUpload={() => false}
              maxCount={1}
              fileList={fileList}
              onChange={({ fileList: values }) => setFileList(values.slice(-1))}
            >
              <Button icon={<UploadOutlined />}>选择 .dskey</Button>
            </Upload>
          </Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={busy}
              onClick={() => void exportKey()}
            >
              导出当前密钥
            </Button>
            <Button
              icon={<UploadOutlined />}
              loading={busy}
              disabled={!fileList.length}
              onClick={() => void importKey()}
            >
              恢复密钥
            </Button>
          </Space>
        </Form>
      </Modal>
    </>
  );
};
