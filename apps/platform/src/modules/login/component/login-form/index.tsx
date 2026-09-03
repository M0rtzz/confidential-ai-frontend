import { Form, Typography, Button, Input } from 'antd';
import { useEffect, useState } from 'react';

import { EndRoleBadge } from '@/components/end-role-badge';
import type { EndRole } from '@/components/platform-wrapper';
import { DataSandboxInstanceApi } from '@/services/data-sandbox';

import styles from './index.less';

export interface UserInfo {
  name: string;
  password: string;
}

export const LoginForm = (props: {
  onConfirm: (userInfo: UserInfo) => Promise<void>;
}) => {
  const { Title } = Typography;
  const [loginState, setLoginState] = useState(false);
  const [instance, setInstance] = useState<{
    endRole?: EndRole;
    instanceName?: string;
  }>({});

  useEffect(() => {
    // 免登录接口，失败不阻塞登录，只是不显示端身份徽标
    DataSandboxInstanceApi.instance()
      .then((res) => {
        if (res.status?.code === 0 && res.data) setInstance(res.data);
      })
      .catch(() => {});
  }, []);

  const onFinish = async (values: UserInfo) => {
    setLoginState(true);
    await props.onConfirm(values);
    setLoginState(false);
  };

  return (
    <div className={styles.loginForm}>
      {instance.endRole && (
        <div className={styles.endRoleNotice}>
          <EndRoleBadge endRole={instance.endRole} instanceName={instance.instanceName} />
        </div>
      )}
      <Title level={3} className={styles.title}>
        数据沙箱登录
      </Title>
      <Form
        name="basic"
        initialValues={{ remember: true }}
        onFinish={onFinish}
        autoComplete="off"
      >
        <Form.Item
          label=""
          name="name"
          rules={[{ required: true, message: '请输入您的账号' }]}
        >
          <Input
            className={styles.loginInput}
            size="large"
            placeholder="请输入您的账号"
          />
        </Form.Item>

        <Form.Item
          label=""
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            className={styles.loginInput}
            size="large"
            placeholder="请输入密码"
          />
        </Form.Item>

        <Form.Item className={styles.loginBtnItem}>
          <Button
            className={styles.loginBtn}
            type="primary"
            size="large"
            htmlType="submit"
            loading={loginState}
          >
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};
