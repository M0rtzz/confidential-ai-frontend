import dayjs from 'dayjs';

import { DataSourceType } from '@/modules/data-source-list/type';

/** 将带时区的时间转换为北京时间，并保留历史无时区时间的原有语义。 */
export const formatBeijingTimestamp = (timestamp: string) => {
  if (!timestamp) return '';
  const value = timestamp.trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part(
    'minute',
  )}:${part('second')}`;
};

/** 统一按北京时间格式化平台时间。 */
export const formatTimestamp = (timestamp: string) => formatBeijingTimestamp(timestamp);

export const getDownloadBtnTitle = (type: DataSourceType, path?: string) => {
  switch (type) {
    case DataSourceType.OSS:
      return `OSS 文件不支持直接下载，请到 OSS 对应 bucket 的预设路径下找到文件下载，地址：${path}`;
    case DataSourceType.ODPS:
      return `ODPS 文件不支持直接下载，请到 ODPS 对应项目下找到文件下载，地址：${path}`;
    case DataSourceType.MYSQL:
      return `MYSQL 文件不支持直接下载，请到 MYSQL 对应的数据库下找到文件下载，地址：${path}`;
    default:
      return '';
  }
};
