import Icon from '@ant-design/icons';
import {
  ApartmentOutlined,
  AuditOutlined,
  CalculatorOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  ExportOutlined,
  FileSearchOutlined,
  IdcardOutlined,
  NodeIndexOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { parse } from 'query-string';
import { lazy, useEffect } from 'react';
import { history, useLocation } from 'umi';

import { ReactComponent as DataManager } from '@/assets/jiaochabiao.svg';
import { ReactComponent as CooperativeNode } from '@/assets/join-node.svg';
import { ReactComponent as projectManager } from '@/assets/project-manager.svg';
import { ReactComponent as Workbench } from '@/assets/workbench.svg';
import { EndRole, hasAccess, Platform } from '@/components/platform-wrapper';
import { CooperativeNodeListComponent } from '@/modules/cooperative-node-list';
import { DataCatalogComponent } from '@/modules/data-catalog';
import { HomeLayout } from '@/modules/layout/home-layout';
import { HomeLayoutService } from '@/modules/layout/home-layout/home-layout.service';
import { LoginService } from '@/modules/login/login.service';
import { ManagementLayoutComponent } from '@/modules/layout/management-layout';
import { MessageService } from '@/modules/message-center/message.service';
import { NodeService } from '@/modules/node';
import { P2pProjectListComponent } from '@/modules/p2p-project-list';
import { P2PWorkbenchComponent } from '@/modules/p2p-workbench/workbench.view';
import { useModel } from '@/util/valtio-helper';

// Keep the workbench bundle small and isolate optional MVP pages. A failure in
// one management page must not prevent the default workbench from mounting.
const SandboxManagerComponent = lazy(() =>
  import('@/modules/sandbox-manager').then(
    ({ SandboxManagerComponent: Component }) => ({
      default: Component,
    }),
  ),
);
const ModelApprovalComponent = lazy(() =>
  import('@/modules/model-approval').then(({ ModelApprovalComponent: Component }) => ({
    default: Component,
  })),
);
const SandboxApprovalComponent = lazy(() =>
  import('@/modules/sandbox-approval').then(
    ({ SandboxApprovalComponent: Component }) => ({
      default: Component,
    }),
  ),
);
const TeeExportApprovalComponent = lazy(() =>
  import('@/modules/tee-export-approval').then(
    ({ TeeExportApprovalComponent: Component }) => ({
      default: Component,
    }),
  ),
);
const DataGovernanceComponent = lazy(() =>
  import('@/modules/data-governance').then(
    ({ DataGovernanceComponent: Component }) => ({
      default: Component,
    }),
  ),
);
const DataComputeEntryComponent = lazy(() =>
  import('@/modules/data-compute').then(({ DataComputeEntryComponent: Component }) => ({
    default: Component,
  })),
);
const SandboxWorkspaceComponent = lazy(() =>
  import('@/modules/data-compute').then(({ SandboxWorkspaceComponent: Component }) => ({
    default: Component,
  })),
);
const UnifiedLogComponent = lazy(() =>
  import('@/modules/unified-log').then(({ UnifiedLogComponent: Component }) => ({
    default: Component,
  })),
);
const TrustChainComponent = lazy(() =>
  import('@/modules/trust-chain').then(({ TrustChainComponent: Component }) => ({
    default: Component,
  })),
);
const UserManagementComponent = lazy(() =>
  import('@/modules/system-management').then(
    ({ UserManagementComponent: Component }) => ({
      default: Component,
    }),
  ),
);
const RoleManagementComponent = lazy(() =>
  import('@/modules/system-management').then(
    ({ RoleManagementComponent: Component }) => ({
      default: Component,
    }),
  ),
);
const TenantManagementComponent = lazy(() =>
  import('@/modules/system-management').then(
    ({ TenantManagementComponent: Component }) => ({
      default: Component,
    }),
  ),
);
type EdgeMenuItem = {
  label: string;
  icon: React.ReactNode;
  component?: React.ReactNode;
  key: string;
  /** 按端身份过滤菜单项；不声明则两端都展示 */
  ends?: EndRole[];
  /** 客户端下替换显示的标题；不声明则两端同名 */
  clientLabel?: string;
  children?: EdgeMenuItem[];
};

const menuItems: EdgeMenuItem[] = [
  {
    label: '工作台',
    icon: <Icon component={Workbench} />,
    component: <P2PWorkbenchComponent />,
    key: 'workbench',
  },
  {
    label: '我的项目',
    icon: <Icon component={projectManager} />,
    component: <P2pProjectListComponent />,
    key: 'my-project',
  },
  {
    label: '数据管理',
    icon: <Icon component={DataManager} />,
    key: 'data-management',
    children: [
      {
        label: '数据目录',
        key: 'data-catalog',
        icon: <Icon component={DataManager} />,
        component: <DataCatalogComponent />,
      },
      {
        label: '数据抽样与脱敏',
        key: 'data-governance',
        icon: <DeploymentUnitOutlined />,
        component: <DataGovernanceComponent />,
        ends: [EndRole.CLIENT],
      },
    ],
  },
  {
    label: '资源管理',
    icon: <DashboardOutlined />,
    key: 'resource-management',
    children: [
      {
        label: '沙箱列表',
        key: 'sandbox-resource-application',
        icon: <ExperimentOutlined />,
        component: <SandboxManagerComponent />,
      },
      {
        label: '项目资源审核',
        key: 'sandbox-resource-review',
        icon: <AuditOutlined />,
        component: <SandboxApprovalComponent />,
      },
    ],
  },
  {
    label: '数据计算',
    icon: <CalculatorOutlined />,
    key: 'data-compute',
    component: <DataComputeEntryComponent />,
    ends: [EndRole.CENTER],
  },
  {
    label: '合作节点',
    // 客户端只连接唯一的中心端，渲染时标题改为「中心端连接」
    clientLabel: '中心端连接',
    icon: <Icon component={CooperativeNode} />,
    component: <CooperativeNodeListComponent />,
    key: 'connected-node',
  },
  {
    label: '可信执行链路',
    icon: <NodeIndexOutlined />,
    component: <TrustChainComponent />,
    key: 'trust-chain',
  },
  {
    label: '模型审批',
    icon: <SafetyCertificateOutlined />,
    component: <ModelApprovalComponent />,
    key: 'model-approval',
  },
  {
    label: '结果导出审批',
    icon: <ExportOutlined />,
    component: <TeeExportApprovalComponent />,
    key: 'tee-export-approval',
    ends: [EndRole.CLIENT],
  },
  {
    label: '统一日志',
    icon: <FileSearchOutlined />,
    component: <UnifiedLogComponent />,
    key: 'unified-log',
  },
  {
    label: '系统管理',
    icon: <SettingOutlined />,
    key: 'system-management',
    children: [
      {
        label: '用户管理',
        key: 'user-management',
        icon: <TeamOutlined />,
        component: <UserManagementComponent />,
      },
      {
        label: '角色管理',
        key: 'role-management',
        icon: <IdcardOutlined />,
        component: <RoleManagementComponent />,
      },
      {
        label: '租户管理',
        key: 'tenant-management',
        icon: <ApartmentOutlined />,
        component: <TenantManagementComponent />,
      },
    ],
  },
];
/**
 * 按端身份过滤菜单并按端改写标题；一级项若全部子项都被过滤掉，一级项也不展示。
 * 端身份未就绪时先不展示按端限定的菜单，避免闪出不属于本端的入口。
 */
const filterMenuItemsByEnd = (
  items: EdgeMenuItem[],
  endRole?: EndRole,
): EdgeMenuItem[] =>
  items
    .filter((item) => !item.ends || (endRole && item.ends.includes(endRole)))
    .map((item) => {
      const label =
        endRole === EndRole.CLIENT && item.clientLabel ? item.clientLabel : item.label;
      return item.children
        ? { ...item, label, children: filterMenuItemsByEnd(item.children, endRole) }
        : { ...item, label };
    })
    .filter((item) => !item.children || item.children.length > 0);

const EdgePage = () => {
  const { search } = useLocation();
  const { ownerId, tab, sandboxId } = parse(search);
  const homeLayoutService = useModel(HomeLayoutService);
  const loginService = useModel(LoginService);
  const messageService = useModel(MessageService);
  const nodeService = useModel(NodeService);

  const isAutonomyMode = hasAccess({ type: [Platform.AUTONOMY] });

  useEffect(() => {
    const legacyWorkspace: Record<string, string> = {
      'data-compute-home': 'directory',
      'data-compute-dev': 'dev',
      'data-compute-algorithm': 'algorithm',
      'data-compute-components': 'components',
      'data-compute-visual': 'visual',
      'data-compute-report': 'reports',
    };
    if (typeof tab === 'string' && legacyWorkspace[tab]) {
      const next = new URLSearchParams(search);
      next.set('tab', 'data-compute');
      next.set('workspace', legacyWorkspace[tab]);
      history.replace(`/edge?${next.toString()}`);
      return;
    }
    const getNodeList = async () => {
      const nodeList = await nodeService.listNode();
      if (ownerId) {
        const node = nodeList.find((n) => ownerId === n.nodeId);
        if (node) nodeService.setCurrentNode(node);
      }
    };
    const getMessageTotal = async () => {
      if (ownerId) {
        const res = await messageService.getMessageCount(ownerId as string);
        if (res.status) {
          homeLayoutService.setMessageCount(res?.data || 0);
        }
      }
    };
    homeLayoutService.setSubTitle('密态计算');
    if (!isAutonomyMode) {
      getNodeList();
    }
    // 获取未处理消息数量
    getMessageTotal();
  }, []);
  return (
    <HomeLayout>
      {tab === 'data-compute' && sandboxId ? (
        <SandboxWorkspaceComponent />
      ) : (
        <ManagementLayoutComponent
          menuItems={filterMenuItemsByEnd(menuItems, loginService.userInfo?.endRole)}
          defaultTabKey={'my-project'}
        />
      )}
    </HomeLayout>
  );
};

export default EdgePage;
