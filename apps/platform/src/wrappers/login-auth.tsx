import { Navigate, Outlet } from 'umi';

import { activeUserToken } from '@/security/session';

// 在这里控制是不是第一次进入平台
const BeginnerAuth = () => {
  const token = activeUserToken();
  if (!token) {
    return <Navigate to="/login" />;
  }

  return <Outlet />;
};

export default BeginnerAuth;
