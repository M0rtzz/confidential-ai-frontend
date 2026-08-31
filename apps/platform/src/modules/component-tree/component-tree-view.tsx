import { HolderOutlined } from '@ant-design/icons';
import { message, Popover, Tree } from 'antd';
import { parse } from 'query-string';
import { useCallback, useEffect } from 'react';
import { useLocation } from 'umi';

import { DefaultComponentInterpreterService as ComponentInterpreterService } from '@/modules/component-interpreter/component-interpreter-service';
import { ProjectEditService } from '@/modules/layout/header-project-list/project-edit.service';
import { DefaultPipelineService } from '@/modules/pipeline/pipeline-service';
import { getModel, Model, useModel } from '@/util/valtio-helper';

import { ComponentIcons } from './component-icon';
import type { ComputeMode } from './component-protocol';
import type { ComponentTreeItem } from './component-tree-protocol';
import { DefaultComponentTreeService as ComponentTreeService } from './component-tree-service';
import SearchInput from './components/search-input';
import style from './index.less';

const { DirectoryTree } = Tree;

export const ComponentTree = () => {
  const viewInstance = useModel(ComponentTreeView);
  const defaultPipelineService = useModel(DefaultPipelineService);

  const { search } = useLocation();
  const { mode = 'MPC' } = parse(search);

  useEffect(() => {
    viewInstance.setTreeData(mode as ComputeMode);
  }, [mode]);

  useEffect(() => {
    if (defaultPipelineService.pipelines.length === 0) {
      message.open({
        type: 'warning',
        content: '请先创建训练流后再添加组件',
        duration: 1,
      });
    }
  }, [defaultPipelineService.pipelines]);

  const interpreter = viewInstance.componentInterpreter;
  const treeNodeRender = useCallback(
    (treeNode: ComponentTreeItem) => {
      const { isLeaf, docString, title: titleElement, category, version } = treeNode;

      const title = titleElement.val;

      if (isLeaf) {
        const interpretion =
          interpreter.getComponentTranslationMap(
            {
              domain: category,
              name: title,
              version,
            },
            mode as ComputeMode,
          ) || {};
        return (
          <Popover
            content={
              <div
                style={{
                  width: 200,
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 400,
                  overflow: 'auto',
                }}
              >
                {interpretion[docString] || docString}
              </div>
            }
            placement="right"
          >
            <div
              className={style.node}
              onMouseDown={(e) =>
                viewInstance.startDrag(e, treeNode, mode as ComputeMode)
              }
            >
              <div className={style.nodeTitle}>
                <span className={style.icon}>
                  {ComponentIcons[category] || ComponentIcons['default']}
                </span>
                <span>{interpretion[title] || title}</span>
              </div>
              <div className={style.nodeDragHolder}>
                <HolderOutlined />
              </div>
            </div>
          </Popover>
        );
      } else {
        const child = treeNode.children?.[0];
        const { category: _category, title: name, version: _version } = child || {};
        const interpretion =
          interpreter.getComponentTranslationMap(
            {
              domain: _category || '',
              name: name?.val || '',
              version: _version,
            },
            mode as ComputeMode,
          ) || {};

        return <span className={style.dir}>{interpretion[title] || title}</span>;
      }
    },
    [interpreter, viewInstance],
  );

  return (
    <div className={`${style.components} component-tree-for-tour`}>
      <div className={style.action}>
        <SearchInput
          className={style.search}
          placeholder="请输入搜索关键字"
          onSearch={(key) =>
            viewInstance.handleSearchComponent(mode as ComputeMode, key)
          }
        ></SearchInput>
      </div>
      {viewInstance.componentTreeData.length && (
        <DirectoryTree
          rootClassName={style.tree}
          blockNode
          showIcon={false}
          defaultExpandAll
          titleRender={(node) => treeNodeRender(node)}
          treeData={
            viewInstance.searchComponents.length
              ? viewInstance.searchComponents
              : viewInstance.componentTreeData
          }
        ></DirectoryTree>
      )}
    </div>
  );
};

export class ComponentTreeView extends Model {
  componentTreeData: ComponentTreeItem[] = [];

  searchComponents: ComponentTreeItem[] = [];

  componentTreeService = getModel(ComponentTreeService);
  componentInterpreter = getModel(ComponentInterpreterService);
  projectEditService = getModel(ProjectEditService);

  setTreeData = (mode: ComputeMode) => {
    this.componentTreeData = this.componentTreeService.convertToTree(mode);
  };

  handleSearchComponent = (mode: ComputeMode, keyword?: string) => {
    if (!keyword) {
      this.searchComponents = [];
      return;
    }
    const { componentList } = this.componentTreeService;
    const aliases =
      mode === 'MPC'
        ? [
            { name: '数据对齐', target: 'psi', domain: 'data_prep' },
            { name: '逻辑回归', target: 'ss_sgd_train', domain: 'ml.train' },
            { name: '线性回归', target: 'ss_sgd_train', domain: 'ml.train' },
            { name: '异常值处理', target: 'fillna', domain: 'preprocessing' },
            { name: '缺失值处理', target: 'fillna', domain: 'preprocessing' },
            { name: '唯一值筛选', target: 'feature_filter', domain: 'data_filter' },
            { name: '特征分箱', target: 'vert_binning', domain: 'preprocessing' },
            { name: '标准化', target: 'feature_calculate', domain: 'preprocessing' },
            { name: '相关系数', target: 'ss_pearsonr', domain: 'stats' },
          ]
        : [];
    const candidates = componentList[mode]
      .map(({ name, desc, domain, version }) => ({
        isLeaf: true,
        title: { val: name },
        key: name,
        docString: desc,
        category: domain,
        version,
      }))
      .concat(
        aliases.flatMap(({ name, target, domain }) => {
          const source = componentList[mode].find(
            (item) => item.domain === domain && item.name === target,
          );
          return source
            ? [
                {
                  isLeaf: true,
                  title: { val: name },
                  key: `intelligent_modeling/${name}`,
                  docString: source.desc,
                  category: 'intelligent_modeling',
                  version: source.version,
                },
              ]
            : [];
        }),
      );
    const searchRes = candidates.filter(({ category, version, key }) => {
      const interpretion =
        this.componentInterpreter.getComponentTranslationMap(
          {
            domain: category,
            name: key,
            version,
          },
          mode,
        ) || {};

      return (interpretion[key] || key).toLowerCase().includes(keyword.toLowerCase());
    });

    this.searchComponents = searchRes;
  };
  startDrag = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    treeNode: ComponentTreeItem,
    mode: ComputeMode,
  ) => {
    if (this.projectEditService.canEdit.startDragDisabled) {
      return;
    }

    e.persist();
    const { title, category } = treeNode;

    this.componentTreeService.dragComponent({ title: title.val, category }, mode, e);
  };
}
