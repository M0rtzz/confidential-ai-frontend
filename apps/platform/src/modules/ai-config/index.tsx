import { Alert, Button, Checkbox, Descriptions, Form, Input, message, Modal, Space, Switch } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { AiConfigApi, type AiConfig, type SaveAiConfig } from '@/services/ai-config';

export const AiConfigModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [form] = Form.useForm<SaveAiConfig>();
  const [config, setConfig] = useState<AiConfig>();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await AiConfigApi.current();
      setConfig(value);
      form.setFieldsValue({
        baseUrl: value.baseUrl || '',
        modelId: value.modelId || '',
        apiKey: '',
        clearApiKey: false,
        enabled: value.configured ? value.enabled : true,
      });
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : 'AI 配置读取失败');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const save = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const value = await AiConfigApi.save({
        ...values,
        apiKey: values.apiKey?.trim(),
        clearApiKey: Boolean(values.clearApiKey),
        enabled: Boolean(values.enabled),
      });
      setConfig(value);
      form.setFieldsValue({ apiKey: '', clearApiKey: false });
      message.success(`AI 配置 v${value.version} 已保存`);
    } catch (failure) {
      if ((failure as { errorFields?: unknown }).errorFields) return;
      message.error(failure instanceof Error ? failure.message : 'AI 配置保存失败');
    } finally {
      setLoading(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await AiConfigApi.test();
      message.success(`连接成功：${result.modelId}（配置 v${result.configVersion}）`);
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : 'AI 配置连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  const editable = config?.editable !== false;
  return (
    <Modal
      title="AI 配置"
      open={open}
      width={640}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          {editable && (
            <Button disabled={!config?.configured || !config.enabled} loading={testing} onClick={() => void test()}>
              连接测试
            </Button>
          )}
          {editable && (
            <Button type="primary" loading={loading} onClick={() => void save()}>
              保存
            </Button>
          )}
        </Space>
      }
    >
      <Alert
        showIcon
        type="info"
        message="当前机构统一使用此 OpenAI 兼容配置"
        description="代码审核与两处 AI 数据生成功能读取同一生效版本；API Key 保存后只显示配置状态。"
        style={{ marginBottom: 16 }}
      />
      {!editable && (
        <Alert showIcon type="warning" message="你可以查看配置摘要，但只有机构管理员可以修改。" style={{ marginBottom: 16 }} />
      )}
      {config?.configured && (
        <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="配置版本">v{config.version}</Descriptions.Item>
          <Descriptions.Item label="API Key">{config.apiKeyMasked}</Descriptions.Item>
          <Descriptions.Item label="更新时间" span={2}>{config.updatedAt}</Descriptions.Item>
        </Descriptions>
      )}
      <Form form={form} layout="vertical" disabled={!editable}>
        <Form.Item label="接口格式">
          <Input value="OpenAI 兼容格式" disabled />
        </Form.Item>
        <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: '请输入 Base URL' }]}>
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item name="modelId" label="Model ID" rules={[{ required: true, message: '请输入 Model ID' }]}>
          <Input placeholder="gpt-4.1-mini" />
        </Form.Item>
        <Form.Item name="apiKey" label="API Key" extra="留空表示保留当前密钥；读取接口不会返回明文。">
          <Input.Password autoComplete="new-password" placeholder="输入新的 API Key" />
        </Form.Item>
        <Form.Item name="clearApiKey" valuePropName="checked">
          <Checkbox>明确清除已保存的 API Key</Checkbox>
        </Form.Item>
        <Form.Item name="enabled" label="启用配置" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};
