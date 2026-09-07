import { Button, Modal } from 'antd';
import { useState } from 'react';
import classNames from 'classnames';

import { MessageComponent } from '@/modules/message-center';
import { P2pProjectListComponent } from '@/modules/p2p-project-list';

import styles from './index.less';

export const P2PWorkbenchComponent = () => {
  const [pdfOpen, setPdfOpen] = useState(false);
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
          <Button type="primary" onClick={() => setPdfOpen(true)}>
            查看可信底座架构图
          </Button>
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
      <Modal
        title="可信底座架构图"
        open={pdfOpen}
        width={1080}
        footer={[
          <Button key="close" onClick={() => setPdfOpen(false)}>
            关闭
          </Button>,
          <Button
            key="openNew"
            type="primary"
            onClick={() => window.open('/加密数据与DEK加密方案.pdf', '_blank')}
          >
            新窗口打开
          </Button>,
        ]}
        onCancel={() => setPdfOpen(false)}
      >
        <iframe
          src="/加密数据与DEK加密方案.pdf#view=FitH"
          width="100%"
          height="680px"
          style={{ border: '1px solid #f0f0f0', borderRadius: 4 }}
          title="可信底座架构图"
        />
      </Modal>
    </div>
  );
};
