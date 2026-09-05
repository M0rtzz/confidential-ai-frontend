import { useEffect } from 'react';

import { ConfidentialTrainingComponent } from '@/modules/confidential-training';
import { HomeLayout } from '@/modules/layout/home-layout';
import { HomeLayoutService } from '@/modules/layout/home-layout/home-layout.service';
import { useModel } from '@/util/valtio-helper';

const ConfidentialTrainingPage = () => {
  const layoutService = useModel(HomeLayoutService);
  useEffect(() => {
    layoutService.setSubTitle('节点机密训练任务');
    layoutService.setBgClassName('centerBg');
  }, []);
  return (
    <HomeLayout>
      <ConfidentialTrainingComponent />
    </HomeLayout>
  );
};

export default ConfidentialTrainingPage;
