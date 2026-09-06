import { Navigate, Outlet } from 'umi';

const ClientRoleAuth = () =>
  localStorage.getItem('Confidential-End-Role') === 'CLIENT' ? (
    <Outlet />
  ) : (
    <Navigate to="/confidential-training" />
  );

export default ClientRoleAuth;
