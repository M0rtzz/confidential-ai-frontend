import { Tabs } from 'antd';
import { useState } from 'react';

import { MvpPage } from '@/modules/data-sandbox-mvp/common';

import { KeyAuditPanel } from './audit-panel';
import { CustomerKeyPanel } from './customer-key-panel';
import { KeyLedgerPanel } from './ledger-panel';

/**
 * 密钥管理。
 *
 * 三个页签分别对应两条密钥体系：CPU 侧由中心端托管的数据密钥台账（tee-contract/1.0），
 * GPU 侧由浏览器持有的客户密钥（ds-confidential/v1），以及两者共用的审计链。
 */
export const KeyManagementComponent = () => {
  const [active, setActive] = useState('ledger');

  return (
    <MvpPage
      title="密钥管理"
      description="CPU 侧数据密钥台账、客户密钥（UEK）与密钥操作审计"
    >
      <Tabs
        activeKey={active}
        onChange={setActive}
        items={[
          { key: 'ledger', label: 'CPU 密钥台账', children: <KeyLedgerPanel /> },
          { key: 'customer', label: '客户密钥', children: <CustomerKeyPanel /> },
          { key: 'audit', label: '密钥操作审计', children: <KeyAuditPanel /> },
        ]}
      />
    </MvpPage>
  );
};
