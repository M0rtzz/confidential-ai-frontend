import { useEffect } from 'react';

import { ConfidentialComputeComponent } from '@/modules/confidential-compute';
import { HomeLayout } from '@/modules/layout/home-layout';
import { HomeLayoutService } from '@/modules/layout/home-layout/home-layout.service';
import { useModel } from '@/util/valtio-helper';

const ConfidentialComputePage = () => {
  const layoutService = useModel(HomeLayoutService);
  useEffect(() => {
    layoutService.setSubTitle('数据与模型权重机密计算');
    layoutService.setBgClassName('centerBg');
  }, []);
  return (
    <HomeLayout>
      <ConfidentialComputeComponent />
    </HomeLayout>
  );
};

export default ConfidentialComputePage;
