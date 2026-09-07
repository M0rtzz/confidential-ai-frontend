import { DownloadOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import {
  currentStoredIdentity,
  exportUserEncryptionKey,
  getSessionIdentity,
  importUserEncryptionKey,
  sha256,
  userKeyFileName,
} from '@/security/crypto';

type IdentitySummary = {
  kid: string;
  keyVersion: number;
  scope: string;
  encryptionFingerprint: string;
  signingFingerprint: string;
};

const failureMessage = (failure: unknown, fallback: string) =>
  failure instanceof Error && failure.message ? failure.message : fallback;

/**
 * 客户密钥（UEK）当前状态与备份恢复。
 *
 * UEK 私钥只存在于本浏览器的 IndexedDB，服务端、MinIO 与 CipherGPU 都不持有；
 * 本页展示的公钥指纹由本地公钥现算，不经过任何接口。
 */
export const CustomerKeyPanel = () => {
  const [identity, setIdentity] = useState<IdentitySummary>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm<{ password: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await currentStoredIdentity();
      if (!stored) {
        setIdentity(undefined);
        return;
      }
      setIdentity({
        kid: stored.kid,
        keyVersion: stored.keyVersion,
        scope: stored.scope,
        encryptionFingerprint: (await sha256(stored.encryptionPublicKey)).slice(0, 32),
        signingFingerprint: (await sha256(stored.signingPublicKey)).slice(0, 32),
      });
    } catch (failure) {
      message.error(failureMessage(failure, '读取本地客户密钥失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      await getSessionIdentity();
      await load();
      message.success('客户密钥已在本浏览器生成');
    } catch (failure) {
      message.error(failureMessage(failure, '客户密钥生成失败'));
    } finally {
      setBusy(false);
    }
  };

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
      message.error(failureMessage(failure, '密钥导出失败'));
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
      await load();
      message.success(`客户密钥已恢复：${result.kid}`);
    } catch (failure) {
      message.error(failureMessage(failure, '密钥恢复失败'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Alert
        showIcon
        type="warning"
        message="私钥不出浏览器"
        description="服务器不会取得客户私钥或恢复口令。丢失浏览器密钥、备份文件和恢复口令后，历史密文无法恢复。"
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          当前密钥
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          style={{ marginLeft: 'auto' }}
          onClick={() => void load()}
        >
          刷新
        </Button>
      </div>
      {identity ? (
        <Descriptions
          bordered
          size="small"
          column={2}
          style={{ margin: '12px 0 20px' }}
        >
          <Descriptions.Item label="密钥标识（kid）" span={2}>
            <Typography.Text copyable={{ text: identity.kid }}>
              {identity.kid}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="版本">v{identity.keyVersion}</Descriptions.Item>
          <Descriptions.Item label="作用域">{identity.scope}</Descriptions.Item>
          <Descriptions.Item label="加密公钥指纹" span={2}>
            <Typography.Text code>{identity.encryptionFingerprint}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="签名公钥指纹" span={2}>
            <Typography.Text code>{identity.signingFingerprint}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="备份文件名" span={2}>
            <Typography.Text code>{userKeyFileName()}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Alert
          showIcon
          type="info"
          message="本浏览器尚未持有客户密钥"
          description="生成后即可加密导入数据与模型权重；也可以用已有的 .dskey 备份恢复。"
          action={
            <Button type="primary" loading={busy} onClick={() => void generate()}>
              生成客户密钥
            </Button>
          }
          style={{ margin: '12px 0 20px' }}
        />
      )}

      <Typography.Title level={5}>备份与恢复</Typography.Title>
      <Typography.Paragraph type="secondary">
        备份文件由恢复口令加密。恢复不要求备份文件的作用域与当前账号相等，
        解密后按当前账号作用域落库，kid 保持不变，因此可用于跨实例继承密文资产。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
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
    </>
  );
};
