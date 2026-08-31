import { MenuUnfoldOutlined, MenuFoldOutlined } from '@ant-design/icons';
import { useKeyPress } from 'ahooks';
import { Alert, Menu, Spin } from 'antd';
import classnames from 'classnames';
import { parse, stringify } from 'query-string';
import {
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { history, useLocation } from 'umi';

import { isWindows } from '@/util/platform';

import styles from './index.less';
import { DefaultModalManager } from '@/modules/dag-modal-manager';
import { useModel } from '@/util/valtio-helper';

type ManagementLayoutComponentProps = {
  menuItems: ManagementMenuItem[];
  defaultTabKey?: string;
};

export type ManagementMenuItem = {
  label: string;
  icon: React.ReactNode;
  key: string;
  component?: React.ReactNode;
  children?: ManagementMenuItem[];
};

const leafItems = (items: ManagementMenuItem[]): ManagementMenuItem[] =>
  items.flatMap((item) => (item.children?.length ? leafItems(item.children) : [item]));

class ManagementPageBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the rest of the platform usable if an optional page has a runtime
    // incompatibility in a browser or a stale cached chunk.
    console.error('Management page failed to render', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          showIcon
          message="页面加载失败"
          description="请刷新当前页面后重试；如果问题持续，请联系运维支持。"
        />
      );
    }
    return this.props.children;
  }
}

export const foldHotKey = {
  key: isWindows ? 'ctrl.uparrow' : 'meta.ctrl.uparrow',
  text: isWindows ? 'Ctrl + ↑' : '⌘ + ctrl + ↑ ',
};

export const ManagementLayoutComponent = (props: ManagementLayoutComponentProps) => {
  const modalManager = useModel(DefaultModalManager);

  const { menuItems, defaultTabKey } = props;
  const pages = useMemo(() => leafItems(menuItems), [menuItems]);
  const [collapsed, setCollapsed] = useState(false);

  const { pathname, search } = useLocation();
  const parsedSearch = useMemo(() => parse(search), [search]);

  const { tab, ownerId } = parsedSearch as { tab?: string; ownerId?: string };
  const [tabKey, setTabKey] = useState<string>();

  useEffect(() => {
    const nextSearch = stringify(
      ownerId
        ? {
            ...parsedSearch,
            ownerId,
            tab: tab || defaultTabKey,
          }
        : { tab: tab || defaultTabKey },
    );
    const nextPathname = pathname === '/' ? '/home' : pathname;
    // Avoid replacing an already-normalized URL on every mount/refresh.
    if (nextPathname !== pathname || nextSearch !== search.replace(/^\?/, '')) {
      history.replace({ pathname: nextPathname, search: nextSearch });
    }
  }, [defaultTabKey, ownerId, parsedSearch, pathname, search, tab]);

  useEffect(() => {
    setTabKey(tab || defaultTabKey);
  }, [tab]);

  const [collapseInfo, setCollapsedInfo] = useState(`收起/展开 ${foldHotKey.text}`);
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  useEffect(() => {
    if (!collapsed) {
      setTimeout(() => setCollapsedInfo(`收起/展开 ${foldHotKey.text}`), 250);
    } else {
      setCollapsedInfo(``);
    }
  }, [collapsed]);

  useKeyPress([foldHotKey.key], (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleCollapsed();
  });

  const closeAllModal = () => {
    modalManager.closeAllModals();
  };

  return (
    <div className={styles.layoutContainer}>
      <div
        className={classnames(
          styles.menuContainer,
          collapsed ? styles.fold : styles.unfold,
        )}
      >
        <Menu
          selectedKeys={[tabKey as string]}
          mode="inline"
          inlineCollapsed={collapsed}
          items={menuItems}
          onSelect={({ key }) => {
            closeAllModal();
            history.replace({
              pathname: pathname === '/' ? '/home' : pathname,
              search: stringify(ownerId ? { ownerId, tab: key } : { tab: key }),
            });
          }}
        />

        <div className={styles.collapseInfo}>
          <div className={styles.collapseIcon} onClick={toggleCollapsed}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
          <div className={classnames(styles.collapseText)}>{collapseInfo}</div>
        </div>
      </div>

      <div
        className={classnames(styles.contentContainer, {
          [styles.workbenchContentContainer]: tabKey === 'workbench',
        })}
      >
        <Suspense fallback={<Spin />}>
          <ManagementPageBoundary key={tabKey}>
            {pages.find(({ key }) => key === tabKey)?.component}
          </ManagementPageBoundary>
        </Suspense>
      </div>
    </div>
  );
};
