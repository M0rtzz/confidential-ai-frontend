// import { Button } from 'antd';
import classNames from 'classnames';

import { MessageComponent } from '@/modules/message-center';
import { P2pProjectListComponent } from '@/modules/p2p-project-list';

import styles from './index.less';

export const P2PWorkbenchComponent = () => {
  return (
    <div className={styles.main}>
      <div className={classNames(styles.mainContent, styles.header)}>
        <div className={classNames(styles.titleContent, styles.flexContent)}>
          <div className={styles.title}>
            <span className={styles.tea}>🍵</span>
            Hi～，欢迎来到HUSTNLP密态计算平台
          </div>
        </div>
        <div className={classNames(styles.titleDescContent, styles.flexContent)}>
          {/* 暂无 */}
          {/* <div>
            <Button size="small" type="primary" shape="round">
              立即体验Demo
            </Button>
            <Button
              size="small"
              type="link"
              onClick={() => {
                const a = document.createElement('a');
                // todo 补充操作文档地址
                a.href = '';
                a.target = '_blank';
                a.click();
              }}
            >
              查看操作文档
            </Button>
          </div> */}
        </div>
      </div>
      <div className={classNames(styles.mainContent, styles.message)}>
        <div className={styles.eventTitle}>申请事项</div>
        <div className={styles.messageCard}>
          <MessageComponent />
        </div>
      </div>
      <div className={classNames(styles.mainContent, styles.project)}>
        <P2pProjectListComponent />
      </div>
    </div>
  );
};
