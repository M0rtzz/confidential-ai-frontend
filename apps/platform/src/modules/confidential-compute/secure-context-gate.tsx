import { Alert, Button, Space } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

/**
 * 大模型管理三个页面在浏览器内直接做 HPKE 封装与分块加密，WebCrypto 只在安全上下文可用。
 * 控制台的 HTTPS 端口约定为 HTTP 端口加一，非安全上下文下自动切换到同一路径的 HTTPS 地址。
 */
const httpsLocation = () => {
  const { hostname, port, pathname, search, hash } = window.location;
  const httpsPort = port ? String(Number(port) + 1) : '443';
  return `https://${hostname}:${httpsPort}${pathname}${search}${hash}`;
};

export const SecureContextGate = ({ children }: { children: ReactNode }) => {
  const [target, setTarget] = useState<string>();

  useEffect(() => {
    if (window.isSecureContext) return;
    const url = httpsLocation();
    setTarget(url);
    window.location.replace(url);
  }, []);

  if (window.isSecureContext) return <>{children}</>;

  return (
    <div style={{ padding: 24 }}>
      <Alert
        type="warning"
        showIcon
        message="本页需要 HTTPS 安全上下文"
        description={
          <Space direction="vertical">
            <span>
              浏览器端加密依赖 WebCrypto，普通 HTTP 地址不提供安全上下文。正在切换到
              HTTPS 地址，证书为本地自签名，首次访问需在浏览器中接受。
            </span>
            {target && (
              <Button type="primary" href={target}>
                手动前往 {target}
              </Button>
            )}
          </Space>
        }
      />
    </div>
  );
};
