import { Alert } from 'antd';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import { DagLayout } from '@/modules/layout/dag-layout';

/**
 * 画布渲染期异常的兜底。/dag 链路此前没有错误边界，单个节点组件抛异常会卸载整棵
 * React 树，表现为整页白屏。
 */
class DagPageBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dag page failed to render', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          showIcon
          message="画布加载失败"
          description="请刷新当前页面后重试；如果问题持续，请联系运维支持。"
        />
      );
    }
    return this.props.children;
  }
}

const DagPage = () => {
  return (
    <DagPageBoundary>
      <DagLayout />
    </DagPageBoundary>
  );
};

export default DagPage;
