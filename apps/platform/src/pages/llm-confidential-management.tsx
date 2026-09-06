import { useEffect } from 'react';

import { LlmConfidentialManagement } from '@/modules/llm-confidential-management';
import { HomeLayout } from '@/modules/layout/home-layout';
import { HomeLayoutService } from '@/modules/layout/home-layout/home-layout.service';
import { useModel } from '@/util/valtio-helper';

const LlmConfidentialManagementPage = () => {
  const layoutService = useModel(HomeLayoutService);
  useEffect(() => {
    layoutService.setSubTitle('大模型密态管理');
    layoutService.setBgClassName('centerBg');
  }, []);
  return (
    <HomeLayout>
      <LlmConfidentialManagement />
    </HomeLayout>
  );
};

export default LlmConfidentialManagementPage;
