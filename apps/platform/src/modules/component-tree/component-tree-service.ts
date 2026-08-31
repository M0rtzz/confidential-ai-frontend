import { NodeStatus } from '@secretflow/dag';
import { Emitter } from '@secretflow/utils';
import { message } from 'antd';

import {
  listComponents,
  batchGetComponent,
} from '@/services/secretpad/GraphController';
import { getModel, Model } from '@/util/valtio-helper';

import { ComponentConfigRegistry } from '../component-config/component-config-registry';
import { DefaultComponentConfigService } from '../component-config/component-config-service';
import { DefaultComponentInterpreterService as ComponentInterpreterService } from '../component-interpreter/component-interpreter-service';

import type { Component, ComponentTreeItem, ComputeMode } from './component-protocol';

export class DefaultComponentTreeService extends Model {
  // Business-facing modeling names reuse the platform's proven definitions.
  private static readonly COMPONENT_ALIASES: Record<string, string> = {
    'intelligent_modeling/数据对齐': 'data_prep/psi',
    'intelligent_modeling/逻辑回归': 'ml.train/ss_sgd_train',
    'intelligent_modeling/线性回归': 'ml.train/ss_sgd_train',
    'intelligent_modeling/异常值处理': 'preprocessing/fillna',
    'intelligent_modeling/缺失值处理': 'preprocessing/fillna',
    'intelligent_modeling/唯一值筛选': 'data_filter/feature_filter',
    'intelligent_modeling/特征分箱': 'preprocessing/vert_binning',
    'intelligent_modeling/标准化': 'preprocessing/feature_calculate',
    'intelligent_modeling/相关系数': 'stats/ss_pearsonr',
  };
  protected readonly onComponentDraggedEmitter = new Emitter<{
    component: Component;
    status: NodeStatus;
    displayName?: string;
    e: React.MouseEvent<HTMLDivElement, MouseEvent>;
  }>();

  onComponentDragged = this.onComponentDraggedEmitter.on;
  componentList: Record<ComputeMode, Component[]> = { TEE: [], MPC: [] };
  componentConfigMap: Record<ComputeMode, Record<string, Component>> = {
    TEE: {},
    MPC: {},
  };

  componentConfigRegistry = getModel(ComponentConfigRegistry);
  componentInterpreter = getModel(ComponentInterpreterService);
  componentConfigService = getModel(DefaultComponentConfigService);

  isLoaded = false;

  constructor() {
    super();
    this.getComponentList();
  }

  async getComponentList() {
    const { data, status: componentListStatus } = await listComponents();
    if (!data || componentListStatus?.code !== 0) {
      message.error(componentListStatus?.msg || '获取组件失败');
      return;
    }
    this.componentList = {
      TEE: data['trustedflow']?.comps || ([] as Component[]),
      MPC: data['secretflow']?.comps || ([] as Component[]),
    };

    const { data: specMpcList, status } = await batchGetComponent(
      this.componentList['MPC'].map((node) => ({
        app: 'secretflow',
        name: node.name,
        domain: node.domain,
      })),
    );

    const { data: specTeeList, status: teeStatus } = await batchGetComponent(
      this.componentList['TEE'].map((node) => ({
        app: 'trustedflow',
        name: node.name,
        domain: node.domain,
      })),
    );

    if (specMpcList) {
      specMpcList.forEach((componentConfig: Component) => {
        this.componentConfigMap['MPC'][
          `${componentConfig.domain}/${componentConfig.name}`
        ] = componentConfig;
        this.componentConfigRegistry.registerConfigNode(componentConfig, 'MPC');
      });
    }

    if (specTeeList) {
      specTeeList.forEach((componentConfig: Component) => {
        this.componentConfigMap['TEE'][
          `${componentConfig.domain}/${componentConfig.name}`
        ] = componentConfig;
        this.componentConfigRegistry.registerConfigNode(componentConfig, 'TEE');
      });
    }

    this.isLoaded = true;
  }

  async getComponentConfig(
    componentName: {
      name: string;
      domain: string;
    },
    mode: ComputeMode,
  ): Promise<Component | undefined> {
    const mapRes =
      this.componentConfigMap[mode][`${componentName.domain}/${componentName.name}`];
    if (mapRes) return mapRes;

    // const { data: component } = await getComponent(componentName);
    // return component as Component;
  }

  async dragComponent(
    node: { title: string; category: string },
    mode: ComputeMode,
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) {
    const componentKey =
      DefaultComponentTreeService.COMPONENT_ALIASES[`${node.category}/${node.title}`] ||
      `${node.category}/${node.title}`;
    const [componentDomain, componentName] = componentKey.split('/');
    const componentConfig = await this.getComponentConfig(
      {
        name: componentName,
        domain: componentDomain,
      },
      mode,
    );
    const isConfigNeeded = this.componentConfigService.isConfigNeeded(
      componentKey,
      mode,
    );

    let resolvedComponent = componentConfig;
    if (componentConfig && node.title === '线性回归') {
      resolvedComponent = {
        ...componentConfig,
        attrs: componentConfig.attrs.map((attr) =>
          attr.name === 'reg_type' && 'atomic' in attr
            ? {
                ...attr,
                atomic: { ...attr.atomic, default_value: { s: 'linear' } },
              }
            : attr,
        ),
      };
    }
    resolvedComponent &&
      this.onComponentDraggedEmitter.fire({
        component: resolvedComponent,
        status: isConfigNeeded ? NodeStatus.unfinished : NodeStatus.default,
        displayName: DefaultComponentTreeService.COMPONENT_ALIASES[
          `${node.category}/${node.title}`
        ]
          ? node.title
          : undefined,
        e,
      });
  }

  convertToTree(mode: ComputeMode): ComponentTreeItem[] {
    const mergedDomainMap: { [key: string]: string } = {
      feature: '特征处理',
      preprocessing: '特征处理',
      postprocessing: '特征处理',
      read_data: '数据准备',
      data_prep: '数据准备',
    };
    const list = this.componentList[mode].reduce<ComponentTreeItem[]>(
      (acc, component) => {
        const { domain: category, name: label, desc, version } = component;
        const treeItem = {
          category,
          title: { val: label },
          docString: desc,
          isLeaf: true,
          key: label,
          version,
        };

        if (category) {
          const dir = acc.find(({ key }) =>
            mergedDomainMap[category]
              ? mergedDomainMap[category] === key
              : category === key,
          );
          if (dir) {
            if (!dir.children) dir.children = [];
            dir.children.push(treeItem);
          } else {
            acc.push({
              category: '',
              title: {
                val: mergedDomainMap[category] ? mergedDomainMap[category] : category,
              },
              key: mergedDomainMap[category] ? mergedDomainMap[category] : category,
              isLeaf: false,
              docString: '',
              children: [treeItem],
            });
          }
        } else {
          acc.push(treeItem);
        }

        return acc;
      },
      [],
    );

    if (mode === 'MPC') {
      const aliases = [
        { title: '数据对齐', domain: 'data_prep', target: 'psi' },
        { title: '逻辑回归', domain: 'ml.train', target: 'ss_sgd_train' },
        { title: '线性回归', domain: 'ml.train', target: 'ss_sgd_train' },
        { title: '异常值处理', domain: 'preprocessing', target: 'fillna' },
        { title: '缺失值处理', domain: 'preprocessing', target: 'fillna' },
        { title: '唯一值筛选', domain: 'data_filter', target: 'feature_filter' },
        { title: '特征分箱', domain: 'preprocessing', target: 'vert_binning' },
        { title: '标准化', domain: 'preprocessing', target: 'feature_calculate' },
        { title: '相关系数', domain: 'stats', target: 'ss_pearsonr' },
      ];
      const children = aliases.flatMap(({ domain, title, target }) => {
        const source = this.componentList[mode].find(
          (component) => component.domain === domain && component.name === target,
        );
        return source
          ? [
              {
                category: 'intelligent_modeling',
                title: { val: title },
                docString: source.desc,
                isLeaf: true,
                key: `intelligent_modeling/${title}`,
                version: source.version,
              },
            ]
          : [];
      });
      list.unshift({
        category: '',
        title: { val: '沙箱智能建模' },
        key: '沙箱智能建模',
        isLeaf: false,
        docString: '',
        children,
      });
    }

    const domainOrder = [
      '沙箱智能建模',
      '数据准备',
      'data_filter',
      '特征处理',
      'stats',
      'ml.train',
      'ml.predict',
      'ml.eval',
    ];

    const childrenOrder: { [key: string]: string[] } = {
      数据准备: ['datatable', 'psi', 'train_test_split'],
      特征处理: [
        'binary_op',
        'case_when',
        'feature_calculate',
        'fillna',
        'onehot_encode',
        'substitution',
        'vert_binning',
        'vert_woe_binning',
        'vert_bin_substitution',
        'binning_modifications',
      ],
    };

    // Order the components list for better UX
    list.map((domain: ComponentTreeItem) => {
      if (childrenOrder[domain.key] && domain.children) {
        const order = childrenOrder[domain.key];
        domain.children.sort(
          (a, b) => order.indexOf(a.title.val) - order.indexOf(b.title.val),
        );
      }
    });

    list.sort(
      (a, b) => domainOrder.indexOf(a.title.val) - domainOrder.indexOf(b.title.val),
    );

    return list;
  }
}
