/**
 * 解析节点 ID。约定格式为 `<dagId>-node-<序号>`，例如 pipeline1-node-1 /
 * canvas-3c5be0cdd6a0-node-33。模板导入等外部来源的 graph_json 可能带入不符合该约定的
 * ID，此时降级返回原始 ID 供展示，不再抛异常——调用方 Description 处于 React 渲染路径，
 * 抛异常会导致整个页面白屏。
 */
export const parseNodeId = (nodeId: string) => {
  const id = String(nodeId ?? '');
  const match = id.match(/^(.*)-node-(\d+)$/);
  if (!match) {
    return {
      dagId: '',
      nodeNum: id as string | number,
    };
  }
  return {
    dagId: match[1],
    nodeNum: parseInt(match[2], 10) as string | number,
  };
};
