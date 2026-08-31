import { Alert, Button, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

import { formatBeijingTimestamp } from '@/modules/dag-result/utils';

import styles from './index.less';

export const MvpPage = ({
  title,
  description,
  extra,
  error,
  onRetry,
  children,
}: {
  title: string;
  description: string;
  extra?: ReactNode;
  error?: string;
  onRetry?: () => void;
  children: ReactNode;
}) => (
  <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <Typography.Title level={4} className={styles.title}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      <Space>{extra}</Space>
    </div>
    {error && (
      <Alert
        showIcon
        type="error"
        message="页面数据加载失败"
        description={error}
        action={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
        className={styles.notice}
      />
    )}
    <div className={styles.content}>{children}</div>
  </div>
);

export const MvpNotice = () => (
  <Alert
    showIcon
    type="info"
    message="MVP 运行边界"
    description="GPU 当前提供库存、申请和配额记录，不执行容器直通；OIDC 当前提供配置与连通性测试，不替换现有登录。"
    className={styles.notice}
  />
);

export const RefreshButton = ({
  loading,
  onClick,
}: {
  loading?: boolean;
  onClick: () => void;
}) => (
  <Button loading={loading} onClick={onClick}>
    刷新
  </Button>
);

export const formatTime = (value: unknown) =>
  value ? formatBeijingTimestamp(String(value)) : '-';

export const formatError = (error: unknown, fallback = '请求失败') => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
};

export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
