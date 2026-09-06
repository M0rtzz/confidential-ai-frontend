import { Drawer, Typography } from 'antd';
import type { PropsWithChildren } from 'react';

import styles from './index.less';

/** 阶段台账在链路页内展开，原始对象和回执继续使用独立抽屉。 */
export const DetailPanel = ({
  inline,
  title,
  children,
  ...props
}: PropsWithChildren<{
  inline?: boolean;
  title: string;
  open: boolean;
  width: number;
  onClose: () => void;
}>) =>
  inline ? (
    <section className={styles.detailPanel}>
      <Typography.Title level={5}>{title}</Typography.Title>
      {children}
    </section>
  ) : (
    <Drawer title={title} {...props}>
      {children}
    </Drawer>
  );
