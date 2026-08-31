import { ActionType } from '@secretflow/dag';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';

import {
  DataComputeApi,
  responseData,
  type DataSandboxRecord,
} from '@/services/data-sandbox';
import { useModel } from '@/util/valtio-helper';

import { sandboxDag } from './sandbox-dag';
import { SandboxCanvasView } from './sandbox-canvas.view';
import { TablePreviewModal } from './table-preview-modal';

type ParamSchema = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: { value: string; label: string }[];
};

const parseJson = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * 节点当前输入数据表：调用 /canvas/node/input 解析入边 → 上游 data.table 挂载表或
 * 上游组件最近一次成功输出的 op_* 表，返回 schema（处理列/预测列下拉候选）与预览信息。
 */
const useUpstreamTable = (nodeId: string) => {
  const view = useModel(SandboxCanvasView);
  const [table, setTable] = useState<{
    tableName: string;
    displayName: string;
    columns: string[];
    available: boolean;
  }>({ tableName: '', displayName: '', columns: [], available: false });

  useEffect(() => {
    let cancelled = false;
    if (!nodeId || !view.canvasId) {
      setTable({ tableName: '', displayName: '', columns: [], available: false });
      return;
    }
    (async () => {
      try {
        const res = responseData(
          await DataComputeApi.canvasNodeInput(view.canvasId, nodeId, 20),
          {},
        );
        if (cancelled) return;
        const schema = (res.schema as { name?: string }[]) || [];
        setTable({
          tableName: String(res.tableName || ''),
          displayName: String(res.displayName || res.tableName || ''),
          columns: schema.map((c) => String(c.name || '')),
          available: Boolean(res.available),
        });
      } catch {
        if (!cancelled) {
          setTable({ tableName: '', displayName: '', columns: [], available: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // 抽屉每次打开/切换节点都重新拉取输入表（节点运行后列集合可能更新）
  }, [nodeId, view.canvasId, view.drawer]); // eslint-disable-line react-hooks/exhaustive-deps

  return table;
};

export const NodeConfigDrawer = () => {
  const view = useModel(SandboxCanvasView);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [inputPreviewOpen, setInputPreviewOpen] = useState(false);

  const nodeId = view.selectedNodeId;
  const graph = sandboxDag.graphManager.getGraphInstance();
  const node = (nodeId && graph?.getCellById(nodeId)) || null;
  const nodeData = node?.getData?.() || {};
  const codeName = nodeData.codeName || '';

  const operator = useMemo(
    () => view.components.find((c) => c.code === codeName),
    [view.components, codeName],
  );
  const schema: ParamSchema[] = parseJson(
    operator?.parameter_schema_json,
  ) as ParamSchema[];
  const upstreamTable = useUpstreamTable(nodeId);

  useEffect(() => {
    if (!node || schema.length === 0) return;
    const currentParams = node.getData().params || {};
    const values: Record<string, unknown> = {};
    schema.forEach((p) => {
      values[p.name] =
        currentParams[p.name] !== undefined ? currentParams[p.name] : p.default;
    });
    form.setFieldsValue(values);
  }, [nodeId, codeName, schema.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const resource = (operator?.resource || {}) as Record<string, string>;

  const columnOptions = upstreamTable.columns.map((c) => ({ value: c }));

  const renderField = (p: ParamSchema) => {
    const label = (
      <span>
        {p.label}
        {p.required && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
      </span>
    );
    switch (p.type) {
      case 'table': {
        // 数据资源节点：选择沙箱已挂载数据表（MOUNT）
        const mountTables = view.resources.filter((r) => r.kind === 'MOUNT');
        return (
          <Form.Item
            key={p.name}
            name={p.name}
            label={label}
            rules={[{ required: p.required }]}
          >
            <Select
              showSearch
              placeholder="选择沙箱已挂载数据表"
              optionFilterProp="label"
              options={mountTables.map((r) => ({
                label: `${r.name}（${r.tableName}）`,
                value: r.tableName,
              }))}
            />
          </Form.Item>
        );
      }
      case 'select':
        return (
          <Form.Item key={p.name} name={p.name} label={label}>
            <Select
              options={(p.options || []).map((o) => ({
                label: o.label,
                value: o.value,
              }))}
            />
          </Form.Item>
        );
      case 'columns':
        // 处理列（输入列）：基于当前组件输入数据表的列下拉选择，仍允许手填
        return (
          <Form.Item key={p.name} name={p.name} label={label}>
            <Select
              mode="tags"
              tokenSeparators={[',']}
              placeholder={
                upstreamTable.columns.length
                  ? '下拉选择输入数据表的列（可多选/手填）'
                  : '输入列名（逗号分隔）'
              }
              options={columnOptions}
            />
          </Form.Item>
        );
      case 'column':
        // 预测列/标签列：基于当前组件输入数据表的列下拉选择
        return (
          <Form.Item
            key={p.name}
            name={p.name}
            label={label}
            rules={[{ required: p.required }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="选择输入数据表的列"
              options={columnOptions}
            />
          </Form.Item>
        );
      case 'boolean':
        return (
          <Form.Item key={p.name} name={p.name} label={label} valuePropName="checked">
            <Switch />
          </Form.Item>
        );
      case 'integer':
        return (
          <Form.Item key={p.name} name={p.name} label={label}>
            <InputNumber precision={0} style={{ width: '100%' }} />
          </Form.Item>
        );
      case 'number':
        return (
          <Form.Item key={p.name} name={p.name} label={label}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        );
      case 'expr':
        return (
          <Form.Item
            key={p.name}
            name={p.name}
            label={label}
            rules={[{ required: p.required }]}
          >
            <Input.TextArea rows={2} placeholder="如 balance > 20000" />
          </Form.Item>
        );
      case 'hidden_layer':
        return (
          <Form.Item key={p.name} name={p.name} label={label}>
            <Input placeholder="(32,16)" />
          </Form.Item>
        );
      case 'string':
      default:
        return (
          <Form.Item
            key={p.name}
            name={p.name}
            label={label}
            rules={[{ required: p.required }]}
          >
            <Input />
          </Form.Item>
        );
    }
  };

  const onSave = async () => {
    if (!node) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const params = { ...(node.getData().params || {}) };
      Object.entries(values).forEach(([k, v]) => {
        params[k] = v;
      });
      sandboxDag.graphManager.executeAction(ActionType.changeNodeData, nodeId, {
        params,
      });
      message.success('节点配置已保存');
    } catch (e) {
      message.error('配置校验失败，请检查必填项');
    } finally {
      setSaving(false);
    }
  };

  const runSingle = () => {
    view.openDrawer('');
    view.runNode(nodeId);
  };

  const onDelete = () => {
    const graph = sandboxDag.graphManager.getGraphInstance();
    const cell = nodeId && graph?.getCellById(nodeId);
    if (!cell) {
      message.warning('未找到节点，请刷新画布后重试');
      return;
    }
    Modal.confirm({
      title: '删除节点',
      zIndex: 2000,
      content: `确认将节点「${
        nodeData.label || nodeId
      }」从画布移除？其连接线将一并删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await sandboxDag.graphManager.executeAction(
            ActionType.removeCell,
            [nodeId],
            [],
          );
          view.closeDrawer();
          message.success('节点已删除');
        } catch (e) {
          message.error(`删除节点失败：${String(e)}`);
        }
      },
    });
  };

  return (
    <Drawer
      title="节点配置"
      width={420}
      open={view.drawer === 'config'}
      onClose={() => view.closeDrawer()}
      extra={
        <Space>
          <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
            删除
          </Button>
          <Button onClick={() => view.closeDrawer()}>取消</Button>
          <Button type="primary" loading={saving} onClick={onSave}>
            保存配置
          </Button>
        </Space>
      }
      destroyOnClose
    >
      {!node && <div>请选择节点</div>}
      {node && (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="节点名称">{nodeData.label}</Descriptions.Item>
            <Descriptions.Item label="算子">
              {operator?.name || codeName}
            </Descriptions.Item>
            {resource.cpu && (
              <Descriptions.Item label="资源配额">
                {resource.cpu} C / {resource.memory}
              </Descriptions.Item>
            )}
          </Descriptions>
          {operator?.description && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              {operator.description}
            </Typography.Paragraph>
          )}
          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            {schema.map((p) => renderField(p))}
          </Form>
          {upstreamTable.available && upstreamTable.tableName && (
            <Button
              block
              icon={<EyeOutlined />}
              onClick={() => setInputPreviewOpen(true)}
              style={{ marginTop: 8 }}
            >
              查看当前输入数据表
              {upstreamTable.displayName ? `（${upstreamTable.displayName}）` : ''}
            </Button>
          )}
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>输入 Schema</Typography.Text>
            <div style={{ margin: '4px 0 12px' }}>
              {parseJson(operator?.input_schema_json).map((c, i) => (
                <Tag key={i} color="blue">
                  {String((c as DataSandboxRecord).name || '*')}
                  {c && (c as DataSandboxRecord).description
                    ? `：${(c as DataSandboxRecord).description}`
                    : ''}
                </Tag>
              ))}
            </div>
            <Typography.Text strong>输出 Schema</Typography.Text>
            <div style={{ margin: '4px 0 12px' }}>
              {parseJson(operator?.output_schema_json).map((c, i) => (
                <Tag key={i} color="green">
                  {String((c as DataSandboxRecord).name || '*')}
                </Tag>
              ))}
            </div>
          </div>
          <Button
            block
            icon={<span>▶</span>}
            onClick={runSingle}
            style={{ marginTop: 8 }}
          >
            测试执行（单节点）
          </Button>
        </>
      )}
      <TablePreviewModal
        sandboxId={view.sandboxId}
        tableName={upstreamTable.tableName}
        title={`输入数据预览：${upstreamTable.displayName || upstreamTable.tableName}`}
        open={inputPreviewOpen}
        onClose={() => setInputPreviewOpen(false)}
      />
    </Drawer>
  );
};
