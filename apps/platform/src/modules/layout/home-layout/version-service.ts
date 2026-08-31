import API from '@/services/secretpad';
import { Model } from '@/util/valtio-helper';

export type Version = {
  name: string;
  version: string;
};

const VERSION_DISPLAY_NAMES: Record<string, string> = {
  teeDmImage: '可信执行数据服务',
  teeAppImage: '可信执行应用服务',
  capsuleManagerSimImage: '密态数据管理服务',
  secretpadImage: '数据沙箱平台',
  secretflowServingImage: '模型服务引擎',
  kusciaImage: '计算编排引擎',
  secretflowImage: '隐私计算引擎',
  dataProxyImage: '数据代理服务',
  scqlImage: '联合查询引擎',
};

export class VersionService extends Model {
  versionList: Version[] = [];
  loading = false;

  getVersion = async () => {
    this.loading = true;
    // const deployMode = this.loginService.userInfo?.deployMode;
    // if (!deployMode) return;
    const { status, data = {} } = await API.ComponentVersionController.listVersion();
    this.loading = false;
    if (status && status.code === 0) {
      this.versionList = Object.keys(data).map((key) => ({
        name: VERSION_DISPLAY_NAMES[key] || key,
        version: data[key],
      }));
    }
  };
}
