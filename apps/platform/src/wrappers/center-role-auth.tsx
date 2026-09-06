import { Navigate, Outlet } from 'umi';

import { activeEndRole } from '@/security/session';

const CenterRoleAuth = () =>
  activeEndRole() === 'CENTER' ? <Outlet /> : <Navigate to="/confidential-compute" />;

export default CenterRoleAuth;
