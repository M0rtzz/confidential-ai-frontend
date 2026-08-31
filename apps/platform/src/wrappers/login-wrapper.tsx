import { Outlet } from 'umi';

// 登录态只在主动登出或 token 失效时清除，进入登录页本身不再清除，
// 否则浏览器回退到登录页会导致登录态丢失
const LoginAuth = () => {
  return <Outlet />;
};

export default LoginAuth;
