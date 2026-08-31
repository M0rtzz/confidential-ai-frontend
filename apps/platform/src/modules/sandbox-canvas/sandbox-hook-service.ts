import type { GraphPort } from '@secretflow/dag';
import { DefaultHookService } from '@secretflow/dag';

const isVirtual = (code: string) => code === 'data.table';

/**
 * 沙箱画布端口模型：单输入（top）+ 单输出（bottom）。
 * data.table 为虚拟数据资源节点，无输入端口。端口类型统一 '*' 放行任意连线
 * （输入约束「单输入算子」由后端 resolveInputTable 校验，前端 validateConnection 已禁止重复目标端口）。
 */
export class SandboxHookService extends DefaultHookService {
  async createResult(nodeId: string, codeName: string) {
    return [
      {
        id: `${nodeId}-output-0`,
        name: '输出',
        type: 'data',
      },
    ];
  }

  async createPort(nodeId: string, codeName: string): Promise<GraphPort[]> {
    const ports: GraphPort[] = [];
    if (!isVirtual(codeName)) {
      ports.push({
        id: `${nodeId}-input-0`,
        group: 'top',
        type: ['*'],
      });
    }
    ports.push({
      id: `${nodeId}-output-0`,
      group: 'bottom',
      type: ['*'],
    });
    return ports;
  }
}
