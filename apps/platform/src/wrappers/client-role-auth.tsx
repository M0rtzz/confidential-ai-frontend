import { Navigate, Outlet } from 'umi';

import { activeEndRole } from '@/security/session';

const ClientRoleAuth = () =>
  activeEndRole() === 'CLIENT' ? <Outlet /> : <Navigate to="/confidential-training" />;

export default ClientRoleAuth;
