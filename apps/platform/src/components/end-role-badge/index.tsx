import classNames from 'classnames';

import { EndRole } from '@/components/platform-wrapper';

import styles from './index.less';

const roleText: Record<EndRole, string> = {
  [EndRole.CENTER]: '可信执行方',
  [EndRole.CLIENT]: '数据方',
};

const defaultInstanceName: Record<EndRole, string> = {
  [EndRole.CENTER]: '中心端',
  [EndRole.CLIENT]: '客户端',
};

/** 端身份徽标：仅标注部署时确定的端身份，不提供任何切换控件 */
export const EndRoleBadge = ({
  endRole,
  instanceName,
  size = 'default',
}: {
  endRole?: EndRole;
  instanceName?: string;
  size?: 'default' | 'small';
}) => {
  if (!endRole) return null;
  return (
    <span
      className={classNames(styles.badge, {
        [styles.center]: endRole === EndRole.CENTER,
        [styles.client]: endRole === EndRole.CLIENT,
        [styles.small]: size === 'small',
      })}
    >
      <span className={styles.dot} />
      {instanceName || defaultInstanceName[endRole]} · {roleText[endRole]}
    </span>
  );
};
