import request from 'umi-request';

import { DataSandboxResponse, responseData } from '@/services/data-sandbox';

export type ManagedUserStatus = 'ENABLED' | 'DISABLED';

export type ManagedUser = {
  account: string;
  displayName: string;
  status: ManagedUserStatus;
  lastLoginAt?: string;
  createdAt: string;
  systemAccount: boolean;
};

export type ManagedUserOption = {
  account: string;
  displayName: string;
};

const base = '/api/v1alpha1/system/users';

const headers = () => ({
  'User-Token': localStorage.getItem('User-Token') || '',
  'Trace-Id': `${Date.now()}-${Math.random().toString(16).slice(2)}`,
});

const get = <T>(path: string) =>
  request<DataSandboxResponse<T>>(`${base}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));

const post = <T>(path: string, data: Record<string, unknown>) =>
  request<DataSandboxResponse<T>>(`${base}${path}`, {
    method: 'POST',
    data,
    credentials: 'include',
    headers: headers(),
  }).then((response) => responseData(response, undefined as T));

export const SystemUserManagementApi = {
  list: () => get<ManagedUser[]>('/list'),
  authorizationOptions: () => get<ManagedUserOption[]>('/authorization-options'),
  create: (data: Pick<ManagedUser, 'account' | 'displayName'>) =>
    post<ManagedUser>('/create', data),
  update: (data: Pick<ManagedUser, 'account' | 'displayName'>) =>
    post<ManagedUser>('/update', data),
  changeStatus: (account: string, status: ManagedUserStatus) =>
    post<ManagedUser>('/changeStatus', { account, status }),
  resetPassword: (account: string) => post<string>('/resetPassword', { account }),
  delete: (account: string) => post<string>('/delete', { account }),
};
