type ErrorPayload = {
  status?: { msg?: unknown };
  data?: { errorCode?: unknown; message?: unknown };
};

/** 优先展示后端业务错误，避免 HTTP 非 2xx 被压缩成无信息的 http error。 */
export const requestErrorMessage = (error: unknown, fallback: string) => {
  const payload = (error as { data?: ErrorPayload } | undefined)?.data;
  const errorCode =
    typeof payload?.data?.errorCode === 'string' ? payload.data.errorCode : '';
  const detail = typeof payload?.data?.message === 'string' ? payload.data.message : '';
  const statusMessage =
    typeof payload?.status?.msg === 'string' ? payload.status.msg : '';

  if (errorCode && detail) return `${errorCode}：${detail}`;
  if (errorCode) return errorCode;
  if (statusMessage) return statusMessage;
  if (error instanceof Error && error.message && error.message !== 'http error') {
    return error.message;
  }
  return fallback;
};
