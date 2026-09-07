import {
  DeleteOutlined,
  DownloadOutlined,
  ReloadOutlined,
  StopOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { formatTime } from '@/modules/data-sandbox-mvp/common';
import {
  currentStoredIdentity,
  exportUserEncryptionKey,
  getSessionIdentity,
  importUserEncryptionKey,
  prepareRotatedUserKey,
  destroySessionIdentity,
  sha256,
  userKeyFileName,
} from '@/security/crypto';
import { CustomerKeyApi } from '@/services/customer-keys';
import type { CustomerKeyItem, RotationStatus } from '@/services/customer-keys';

type IdentitySummary = {
  kid: string;
  keyVersion: number;
  scope: string;
  encryptionFingerprint: string;
  signingFingerprint: string;
};

const statusMeta: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '生效', color: 'success' },
  SUPERSEDED: { label: '已被取代', color: 'default' },
  REVOKED: { label: '已回收', color: 'warning' },
  DESTROYED: { label: '已销毁', color: 'error' },
};

const failureMessage = (failure: unknown, fallback: string) =>
  failure instanceof Error && failure.message ? failure.message : fallback;

/**
 * 客户密钥（UEK）全生命周期。
 *
 * UEK 私钥只存在于本浏览器的 IndexedDB，服务端、MinIO 与 CipherGPU 都不持有；
 * 本页展示的公钥指纹由本地公钥现算，台账的状态与版本来自服务端。
 */
export const CustomerKeyPanel = () => {
  const [identity, setIdentity] = useState<IdentitySummary>();
  const [keys, setKeys] = useState<CustomerKeyItem[]>([]);
  const [rotation, setRotation] = useState<RotationStatus>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [destroyTarget, setDestroyTarget] = useState<CustomerKeyItem>();
  const [form] = Form.useForm<{ password: string }>();
  const [destroyForm] = Form.useForm<{ confirmKid: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ledger, status] = await Promise.all([
        CustomerKeyApi.list(),
        CustomerKeyApi.rotationStatus(),
      ]);
      setKeys(ledger || []);
      setRotation(status);
    } catch (failure) {
      message.error(failureMessage(failure, '加载客户密钥台账失败'));
    }
    try {
      const stored = await currentStoredIdentity();
      setIdentity(
        stored
          ? {
              kid: stored.kid,
              keyVersion: stored.keyVersion,
              scope: stored.scope,
              encryptionFingerprint: (await sha256(stored.encryptionPublicKey)).slice(
                0,
                32,
              ),
              signingFingerprint: (await sha256(stored.signingPublicKey)).slice(0, 32),
            }
          : undefined,
      );
    } catch (failure) {
      setIdentity(undefined);
      message.error(failureMessage(failure, '读取本地客户密钥失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    run(async () => {
      try {
        await getSessionIdentity();
        message.success('客户密钥已在本浏览器生成');
      } catch (failure) {
        message.error(failureMessage(failure, '客户密钥生成失败'));
      }
    });

  const exportKey = async () => {
    const { password } = await form.validateFields();
    await run(async () => {
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
      }
    });
  };

  const importKey = async () => {
    const { password } = await form.validateFields();
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning('请选择 .dskey 密钥备份文件');
      return;
    }
    await run(async () => {
      try {
        const result = await importUserEncryptionKey(file, password);
        setFileList([]);
        form.resetFields();
        message.success(`客户密钥已恢复：${result.kid}`);
      } catch (failure) {
        message.error(failureMessage(failure, '密钥恢复失败'));
      }
    });
  };

  // 先向服务端登记新公钥，登记成功后再替换本地身份；顺序反过来会在登记失败时
  // 留下一把服务端不认识的密钥。
  const rotate = () =>
    run(async () => {
      try {
        const material = await prepareRotatedUserKey();
        await CustomerKeyApi.rotate({
          kid: material.kid,
          encryptionPublicKey: material.encryptionPublicKey,
          signingPublicKey: material.signingPublicKey,
          proofOfPossession: material.proofOfPossession,
        });
        await material.persist();
        message.success(`客户密钥已轮换到 v${material.keyVersion}：${material.kid}`);
      } catch (failure) {
        message.error(failureMessage(failure, '密钥轮换失败'));
      }
    });

  const revoke = (item: CustomerKeyItem) =>
    run(async () => {
      try {
        await CustomerKeyApi.revoke(item.kid);
        message.success('该版本已回收，不再接受新的封装');
      } catch (failure) {
        message.error(failureMessage(failure, '密钥回收失败'));
      }
    });

  const destroy = async () => {
    const { confirmKid } = await destroyForm.validateFields();
    const target = destroyTarget;
    if (!target) return;
    await run(async () => {
      try {
        await CustomerKeyApi.destroy(target.kid, confirmKid);
        // 服务端只改状态，浏览器私钥同时清除，两边保持一致。
        if (identity?.kid === target.kid) destroySessionIdentity();
        setDestroyTarget(undefined);
        destroyForm.resetFields();
        message.success('该版本已销毁，其覆盖的历史密文不可再解开');
      } catch (failure) {
        message.error(failureMessage(failure, '密钥销毁失败'));
      }
    });
  };

  const boundToPrevious = rotation?.boundToPrevious?.length || 0;

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
        <Space style={{ marginLeft: 'auto' }}>
          <Button
            icon={<SwapOutlined />}
            loading={busy}
            disabled={!identity}
            onClick={() => void rotate()}
          >
            轮换
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
          >
            刷新
          </Button>
        </Space>
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

      {boundToPrevious > 0 && (
        <Alert
          showIcon
          type="info"
          message={`有 ${boundToPrevious} 个资产版本仍绑定旧公钥`}
          description="资产的数据密钥在封装时把接收公钥写进了完整性校验范围，并随清单由属主签名，因此轮换不会重新封装历史资产。解开这些资产仍需对应版本的密钥备份，回收或销毁旧版本前请确认不再需要它们。"
          style={{ marginBottom: 20 }}
        />
      )}

      <Typography.Title level={5}>版本历史</Typography.Title>
      <Table<CustomerKeyItem>
        rowKey={(row) => row.kid}
        size="small"
        scroll={{ x: 'max-content' }}
        loading={loading}
        dataSource={keys}
        pagination={false}
        style={{ marginBottom: 20 }}
        columns={[
          {
            title: '版本',
            dataIndex: 'keyVersion',
            render: (value: number) => `v${value}`,
          },
          {
            title: '密钥标识',
            dataIndex: 'kid',
            render: (value: string) => (
              <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>
            ),
          },
          { title: '算法', dataIndex: 'algorithm' },
          {
            title: '公钥指纹',
            dataIndex: 'fingerprint',
            render: (value: string) => (
              <Typography.Text code>{(value || '').slice(0, 24)}</Typography.Text>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value: string) => (
              <Tag color={statusMeta[value]?.color || 'default'}>
                {statusMeta[value]?.label || value}
              </Tag>
            ),
          },
          { title: '生成时间', dataIndex: 'createdAt', render: formatTime },
          { title: '取代时间', dataIndex: 'supersededAt', render: formatTime },
          { title: '回收时间', dataIndex: 'revokedAt', render: formatTime },
          { title: '销毁时间', dataIndex: 'destroyedAt', render: formatTime },
          {
            title: '操作',
            key: 'actions',
            render: (_, row) => (
              <Space>
                <Popconfirm
                  title="回收该版本？"
                  description="回收后不再接受新的封装，历史密文仍可用该版本的备份解开。"
                  okText="确认回收"
                  cancelText="取消"
                  disabled={row.status === 'REVOKED' || row.status === 'DESTROYED'}
                  onConfirm={() => void revoke(row)}
                >
                  <Button
                    size="small"
                    type="link"
                    icon={<StopOutlined />}
                    disabled={
                      busy || row.status === 'REVOKED' || row.status === 'DESTROYED'
                    }
                  >
                    回收
                  </Button>
                </Popconfirm>
                <Button
                  size="small"
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={busy || row.status === 'DESTROYED'}
                  onClick={() => {
                    destroyForm.resetFields();
                    setDestroyTarget(row);
                  }}
                >
                  销毁
                </Button>
              </Space>
            ),
          },
        ]}
      />

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

      <Modal
        title="销毁客户密钥"
        open={!!destroyTarget}
        okText="确认销毁"
        okButtonProps={{ danger: true, loading: busy }}
        cancelText="取消"
        onCancel={() => !busy && setDestroyTarget(undefined)}
        onOk={() => void destroy()}
      >
        <Alert
          showIcon
          type="error"
          message="销毁不可逆，且平台没有恢复手段"
          description="销毁后该版本覆盖的历史密文永久不可解。请先导出一份 .dskey 备份，确认不再需要这些历史密文后再继续。"
          style={{ marginBottom: 16 }}
        />
        <Form form={destroyForm} layout="vertical">
          <Form.Item
            name="confirmKid"
            label={`手工输入待销毁的密钥标识：${destroyTarget?.kid || ''}`}
            rules={[
              { required: true, message: '请输入密钥标识' },
              {
                validator: (_, value) =>
                  value === destroyTarget?.kid
                    ? Promise.resolve()
                    : Promise.reject(new Error('输入的密钥标识与待销毁的版本不一致')),
              },
            ]}
          >
            <Input autoComplete="off" placeholder="逐字输入上方的 kid" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
