import { history } from 'umi';
import request from 'umi-request';
import { v4 as uuidv4 } from 'uuid';

const SESSION_INVALID_CODE = 202011605;

request.interceptors.request.use((url, options) => {
  const traceId = uuidv4(); // 生成唯一的 traceId
  const token = localStorage.getItem('User-Token') || '';
  const isFormData =
    typeof FormData !== 'undefined' && options.data instanceof FormData;
  const isBinary =
    options.data instanceof Uint8Array ||
    options.data instanceof ArrayBuffer ||
    (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(options.data));
  return {
    url: `${url}`,
    options: {
      ...options,
      mode: 'cors',
      credentials: 'include',
      interceptors: true,
      headers: {
        ...(isFormData || isBinary ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
        'User-Token': token,
        'Trace-Id': traceId,
      },
    },
  };
});

request.interceptors.response.use(async (response) => {
  const { status } = await response.clone().json();
  if (status?.code === SESSION_INVALID_CODE) {
    localStorage.removeItem('User-Token');
    localStorage.removeItem('neverLogined');
    history.replace('/login');
  }
  return response;
});
