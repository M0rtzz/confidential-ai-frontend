import { useEffect } from 'react';

import { HomeLayout } from '@/modules/layout/home-layout';
import { HomeLayoutService } from '@/modules/layout/home-layout/home-layout.service';
import { MyNodeComponent } from '@/modules/my-node';
import { useModel } from '@/util/valtio-helper';

const HomePage = () => {
  const homeLayoutService = useModel(HomeLayoutService);
  useEffect(() => {
    homeLayoutService.setSubTitle('数据沙箱');
  }, []);
  return (
    <HomeLayout>
      <MyNodeComponent />
    </HomeLayout>
  );
};

export default HomePage;
