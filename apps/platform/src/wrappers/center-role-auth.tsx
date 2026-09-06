import { Navigate, Outlet } from 'umi';

const CenterRoleAuth = () =>
  localStorage.getItem('Confidential-End-Role') === 'CENTER' ? (
    <Outlet />
  ) : (
    <Navigate to="/confidential-compute" />
  );

export default CenterRoleAuth;
