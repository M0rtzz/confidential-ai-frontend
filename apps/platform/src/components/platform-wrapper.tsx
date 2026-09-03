import { parse } from 'query-string';
import { useLocation } from 'umi';

import { LoginService } from '@/modules/login/login.service';
import { getModel } from '@/util/valtio-helper';

/**
 *
 * 根据路由来区分 'P2P' 模式。/edge 路由下都是p2p模式
 * @returns children
 */
export const EdgeRouteWrapper = (props: { children?: React.ReactNode }) => {
  const { children } = props;

  const { pathname } = useLocation();
  if (children === undefined || children === null) return null;
  if (pathname !== '/edge') return null;
  return <>{pathname === '/edge' && <>{children}</>}</>;
};

/**
 * 判断当前是不是p2p 的工作台页面
 * @returns boolean
 */
export const isP2PWorkbench = (pathname: string) => {
  const { search } = window.location;
  const { tab } = parse(search);
  return pathname === '/edge' && tab === 'workbench';
};

export enum PadMode {
  'TEE' = 'TEE',
  'MPC' = 'MPC',
  'ALL-IN-ONE' = 'ALL-IN-ONE',
}

export enum Platform {
  'CENTER' = 'CENTER',
  'EDGE' = 'EDGE',
  'AUTONOMY' = 'AUTONOMY',
}

/** TEE 场景下的端身份：由部署决定，界面只标注、不提供切换 */
export enum EndRole {
  'CENTER' = 'CENTER',
  'CLIENT' = 'CLIENT',
}

type AccessType = {
  type?: Platform[];
  mode?: PadMode[];
  end?: EndRole[];
};

/**
 * 判断当前平台类型、部署类型和端身份
 * @param accessType
 * @param accessType.type - 平台类型  可以是 [Platform.AUTONOMY | Platform.CENTER | Platform.EDGE]
 * @param accessType.mode - 部署类型  可以是 [PadMode['ALL-IN-ONE'] | PadMode.MPC | PadMode.TEE]
 * @param accessType.end - 端身份 可以是 [EndRole.CENTER | EndRole.CLIENT]，不声明则不限制
 * @returns boolean
 */
export const hasAccess = (accessType: AccessType) => {
  const {
    type = [Platform.AUTONOMY, Platform.CENTER, Platform.EDGE],
    mode = [PadMode['ALL-IN-ONE'], PadMode.MPC, PadMode.TEE],
    end,
  } = accessType;
  const loginService = getModel(LoginService);
  if (!loginService.userInfo?.deployMode) return false;
  if (!loginService.userInfo?.platformType) return false;

  const deployMode = loginService.userInfo.deployMode;
  const platformType = loginService.userInfo.platformType;

  if (end && !end.includes(loginService.userInfo.endRole as EndRole)) return false;

  return type.includes(platformType) && mode.includes(deployMode);
};

/** 取当前实例的端身份（CENTER / CLIENT），登录前或未声明时返回 undefined */
export const getEndRole = () => {
  const loginService = getModel(LoginService);
  return loginService.userInfo?.endRole;
};

/**
 * 根据登陆用户信息来判断是否展示view
 */
export const AccessWrapper = (props: {
  accessType: AccessType;
  children?: React.ReactNode;
}) => {
  const { children, accessType = {} } = props;
  if (children === undefined || children === null) return null;
  const showChildren = hasAccess(accessType);
  return <>{showChildren && <>{children}</>}</>;
};

/**
 *
 * 获取当前平台 是 TEE | MPC | ALL-IN-ONE 模式
 * @returns children
 */
export const getPadMode = () => {
  const loginService = getModel(LoginService);
  return loginService.userInfo?.deployMode;
};
