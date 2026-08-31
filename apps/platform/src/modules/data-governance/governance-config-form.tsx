import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import sha256 from 'crypto-js/sha256';

import type { DataSandboxRecord } from '@/services/data-sandbox';

export const samplingMethods = [
  { value: 'RANDOM', label: '随机抽样' },
  { value: 'SYSTEMATIC', label: '等距抽样' },
  { value: 'STRATIFIED', label: '分层抽样' },
  { value: 'CLUSTER', label: '整群抽样' },
  { value: 'CUSTOM', label: '自定义方法' },
];

const maskingMethods = [
  { value: 'NONE', label: '不脱敏 / 保持原样' },
  { value: 'MASK', label: '掩码' },
  { value: 'REPLACE_VALUE', label: '常量替换' },
  { value: 'REPLACE_MAPPING', label: '字典映射' },
  { value: 'HASH', label: '哈希' },
  { value: 'ROUND', label: '取整' },
  { value: 'CLEAR_NULL', label: '置空' },
  { value: 'CLEAR_DROP', label: '剔除列' },
];

const commonColumns = ['name', 'phone', 'id_card', 'email', 'address', 'balance'];

export type GovernanceColumn = {
  columnName: string;
  columnType?: string;
  sampleValue?: string;
};

export type MaskingFormRow = GovernanceColumn & {
  method?: string;
  keepLeft?: number;
  keepRight?: number;
  value?: string;
  mapping?: string;
  salt?: string;
  digits?: number;
};

const parseObject = (value: unknown): DataSandboxRecord => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as DataSandboxRecord;
  }
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseArray = (value: unknown): DataSandboxRecord[] => {
  if (Array.isArray(value)) return value as DataSandboxRecord[];
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const samplingFormValues = (method: string, rawParams: unknown) => {
  const params = parseObject(rawParams);
  const byRatio = Number(params.ratio) > 0;
  return {
    samplingMethod: method || undefined,
    samplingMode: byRatio ? 'ratio' : 'count',
    samplingCount: params.count == null ? undefined : Number(params.count),
    samplingRatio: params.ratio == null ? undefined : Number(params.ratio),
    samplingSeed: params.seed == null ? undefined : Number(params.seed),
    strataColumns: Array.isArray(params.strataColumns) ? params.strataColumns : [],
    clusterMode: params.clusterColumn ? 'clusterColumn' : 'blockSize',
    clusterColumn: params.clusterColumn || undefined,
    blockSize: params.blockSize == null ? undefined : Number(params.blockSize),
  };
};

export const transformSamplingForm = (values: DataSandboxRecord) => {
  switch (values.samplingMethod) {
    case 'RANDOM':
      return {
        ...(values.samplingMode === 'ratio'
          ? { ratio: values.samplingRatio }
          : { count: values.samplingCount }),
        ...(values.samplingSeed == null ? {} : { seed: values.samplingSeed }),
      };
    case 'SYSTEMATIC':
      return { count: values.samplingCount };
    case 'STRATIFIED':
      return {
        strataColumns: values.strataColumns || [],
        ...(values.samplingMode === 'ratio'
          ? { ratio: values.samplingRatio }
          : { count: values.samplingCount }),
      };
    case 'CLUSTER':
      return {
        ...(values.clusterMode === 'clusterColumn'
          ? {
              clusterColumn: Array.isArray(values.clusterColumn)
                ? values.clusterColumn[0]
                : values.clusterColumn,
            }
          : { blockSize: values.blockSize }),
        count: values.samplingCount,
      };
    default:
      return {};
  }
};

const backendToUiMethod = (rule: DataSandboxRecord) => {
  const params = parseObject(rule.params);
  if (rule.method === 'REPLACE')
    return params.mapping ? 'REPLACE_MAPPING' : 'REPLACE_VALUE';
  if (rule.method === 'CLEAR')
    return params.mode === 'drop' ? 'CLEAR_DROP' : 'CLEAR_NULL';
  return rule.method || 'NONE';
};

export const maskingFormRows = (
  rawRules: unknown,
  columns: GovernanceColumn[] = [],
): MaskingFormRow[] => {
  const rules = parseArray(rawRules);
  const ruleByColumn = new Map(rules.map((rule) => [String(rule.column), rule]));
  const baseColumns = columns.length
    ? columns
    : rules.map((rule) => ({ columnName: String(rule.column || '') }));
  return baseColumns
    .filter((column) => column.columnName)
    .map((column) => {
      const rule = ruleByColumn.get(column.columnName) || {};
      const params = parseObject(rule.params);
      return {
        ...column,
        method: backendToUiMethod(rule),
        keepLeft: params.keepLeft == null ? 3 : Number(params.keepLeft),
        keepRight: params.keepRight == null ? 4 : Number(params.keepRight),
        value: params.value,
        mapping:
          params.mapping && typeof params.mapping !== 'string'
            ? JSON.stringify(params.mapping)
            : params.mapping,
        salt: params.salt,
        digits: params.digits == null ? 0 : Number(params.digits),
      };
    });
};

export const transformMaskingRows = (rows: MaskingFormRow[] = []) =>
  rows
    .filter((row) => row.columnName && row.method && row.method !== 'NONE')
    .map((row) => {
      switch (row.method) {
        case 'MASK':
          return {
            column: row.columnName,
            method: 'MASK',
            params: { keepLeft: row.keepLeft ?? 3, keepRight: row.keepRight ?? 4 },
          };
        case 'REPLACE_VALUE':
          return {
            column: row.columnName,
            method: 'REPLACE',
            params: { value: row.value || '' },
          };
        case 'REPLACE_MAPPING':
          return {
            column: row.columnName,
            method: 'REPLACE',
            params: { mapping: row.mapping || '{}' },
          };
        case 'HASH':
          return {
            column: row.columnName,
            method: 'HASH',
            params: { salt: row.salt || '' },
          };
        case 'ROUND':
          return {
            column: row.columnName,
            method: 'ROUND',
            params: { digits: row.digits ?? 0 },
          };
        case 'CLEAR_DROP':
          return { column: row.columnName, method: 'CLEAR', params: { mode: 'drop' } };
        default:
          return { column: row.columnName, method: 'CLEAR', params: { mode: 'null' } };
      }
    });

export const governanceColumnsFromPreview = (
  preview?: DataSandboxRecord,
): GovernanceColumn[] => {
  const header = (preview?.header || preview?.columns || []) as string[];
  const firstRow = ((preview?.rows || [])[0] || []) as string[] | DataSandboxRecord;
  const schema = (preview?.schema || []) as DataSandboxRecord[];
  return header.map((columnName, index) => ({
    columnName,
    columnType:
      schema.find((column) => column.colName === columnName)?.colType || undefined,
    sampleValue: Array.isArray(firstRow)
      ? firstRow[index] == null
        ? ''
        : String(firstRow[index])
      : firstRow[columnName] == null
      ? ''
      : String(firstRow[columnName]),
  }));
};

const previewMasking = (row: MaskingFormRow) => {
  const source = row.sampleValue || defaultSample(row.columnName);
  switch (row.method) {
    case 'MASK': {
      const left = row.keepLeft ?? 3;
      const right = row.keepRight ?? 4;
      if (source.length <= left + right) return source;
      return `${source.slice(0, left)}${'*'.repeat(source.length - left - right)}${
        right ? source.slice(-right) : ''
      }`;
    }
    case 'REPLACE_VALUE':
      return row.value || '';
    case 'REPLACE_MAPPING':
      try {
        return String(JSON.parse(row.mapping || '{}')[source] ?? source);
      } catch {
        return '映射 JSON 无效';
      }
    case 'HASH':
      return (
        sha256(`${row.salt || ''}${source}`)
          .toString()
          .slice(0, 16) + '…'
      );
    case 'ROUND': {
      const value = Number(source);
      if (!Number.isFinite(value)) return source;
      const digits = row.digits ?? 0;
      if (digits >= 0) return value.toFixed(digits);
      const factor = 10 ** -digits;
      return String(Math.round(value / factor) * factor);
    }
    case 'CLEAR_NULL':
      return '（置空）';
    case 'CLEAR_DROP':
      return '（字段将被剔除）';
    default:
      return '-';
  }
};

const defaultSample = (column: string) => {
  const normalized = column.toLowerCase();
  if (normalized.includes('phone')) return '18639416835';
  if (normalized.includes('amount') || normalized.includes('balance'))
    return '467101.16';
  if (normalized.includes('id')) return '310101199001011234';
  return '示例数据';
};

const NumberValue = ({
  mode,
  perStratum = false,
}: {
  mode: string;
  perStratum?: boolean;
}) => (
  <Form.Item
    name={mode === 'ratio' ? 'samplingRatio' : 'samplingCount'}
    label={
      mode === 'ratio'
        ? perStratum
          ? '每层比例'
          : '比例'
        : perStratum
        ? '每层行数'
        : '行数'
    }
    rules={[{ required: true, message: `请输入${mode === 'ratio' ? '比例' : '行数'}` }]}
  >
    <InputNumber
      min={mode === 'ratio' ? 0.01 : 1}
      max={mode === 'ratio' ? 1 : undefined}
      step={mode === 'ratio' ? 0.01 : 1}
      precision={mode === 'ratio' ? 2 : 0}
      style={{ width: '100%' }}
    />
  </Form.Item>
);

export const GovernanceConfigFields = ({
  form,
  columns = [],
  allowCustomColumns = false,
  enableSampling = true,
  enableMasking = true,
}: {
  form: FormInstance;
  columns?: GovernanceColumn[];
  allowCustomColumns?: boolean;
  enableSampling?: boolean;
  enableMasking?: boolean;
}) => {
  const method = Form.useWatch('samplingMethod', form);
  const samplingMode = Form.useWatch('samplingMode', form) || 'count';
  const clusterMode = Form.useWatch('clusterMode', form) || 'clusterColumn';
  const maskingRows = (Form.useWatch('maskingRows', form) || []) as MaskingFormRow[];
  const columnOptions = columns.map((column) => ({
    value: column.columnName,
    label: column.columnType
      ? `${column.columnName}（${column.columnType}）`
      : column.columnName,
  }));

  return (
    <>
      {enableSampling && (
        <>
          <Form.Item name="samplingMethod" label="抽样方法">
            <Select allowClear options={samplingMethods} placeholder="不抽样则留空" />
          </Form.Item>
          {method === 'CUSTOM' && (
            <Form.Item
              name="samplingScript"
              label="自定义抽样代码"
              rules={[{ required: true, message: '请输入自定义抽样代码' }]}
              tooltip="Python 脚本，参数：--input 输入 CSV、--output 输出 CSV、--params 参数 JSON；抽样结果写入 --output"
              extra="自定义抽样输出完成后，平台将继续执行下方字段脱敏配置；脚本输出需保留待脱敏字段"
            >
              <Input.TextArea
                rows={10}
                placeholder={
                  'import argparse, csv\nap = argparse.ArgumentParser()\nap.add_argument("--input"); ap.add_argument("--output"); ap.add_argument("--params")\na = ap.parse_args()\n...'
                }
              />
            </Form.Item>
          )}
          {method === 'RANDOM' && (
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="samplingMode" label="抽取方式" initialValue="count">
                  <Radio.Group
                    options={[
                      { value: 'count', label: '按行数' },
                      { value: 'ratio', label: '按比例' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <NumberValue mode={samplingMode} />
              </Col>
              <Col span={8}>
                <Form.Item
                  name="samplingSeed"
                  label="随机种子（选填）"
                  tooltip="填入固定整数可复现抽样结果"
                >
                  <InputNumber precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          )}
          {method === 'SYSTEMATIC' && <NumberValue mode="count" />}
          {method === 'STRATIFIED' && (
            <Row gutter={12}>
              <Col span={10}>
                <Form.Item
                  name="strataColumns"
                  label="分层字段"
                  rules={[{ required: true, message: '请选择分层字段' }]}
                >
                  <Select
                    mode={allowCustomColumns ? 'tags' : 'multiple'}
                    options={columnOptions}
                    placeholder={
                      allowCustomColumns
                        ? '输入字段名后回车，可添加多个'
                        : '选择一个或多个字段'
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item name="samplingMode" label="抽取方式" initialValue="count">
                  <Radio.Group
                    options={[
                      { value: 'count', label: '每层行数' },
                      { value: 'ratio', label: '每层比例' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={7}>
                <NumberValue mode={samplingMode} perStratum />
              </Col>
            </Row>
          )}
          {method === 'CLUSTER' && (
            <>
              <Form.Item
                name="clusterMode"
                label="整群模式"
                initialValue="clusterColumn"
              >
                <Radio.Group
                  options={[
                    { value: 'clusterColumn', label: '按类别整群' },
                    { value: 'blockSize', label: '按连续数据块' },
                  ]}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  {clusterMode === 'clusterColumn' ? (
                    <Form.Item
                      name="clusterColumn"
                      label="群组列"
                      rules={[{ required: true, message: '请选择群组列' }]}
                    >
                      {allowCustomColumns ? (
                        <Input placeholder="输入群组字段名" />
                      ) : (
                        <Select options={columnOptions} placeholder="选择群组字段" />
                      )}
                    </Form.Item>
                  ) : (
                    <Form.Item
                      name="blockSize"
                      label="块大小"
                      rules={[{ required: true, message: '请输入块大小' }]}
                    >
                      <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="samplingCount"
                    label={clusterMode === 'clusterColumn' ? '抽取群数' : '抽取块数'}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
        </>
      )}

      {enableMasking && (
        <Form.List name="maskingRows">
          {(fields, { add, remove }) => (
            <>
              <Space style={{ marginBottom: 8 }}>
                <Typography.Text strong>字段脱敏配置</Typography.Text>
                {allowCustomColumns && (
                  <>
                    <Button size="small" onClick={() => add({ method: 'NONE' })}>
                      新增字段
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        const existing = new Set(
                          maskingRows.map((row) => row.columnName),
                        );
                        commonColumns
                          .filter((columnName) => !existing.has(columnName))
                          .forEach((columnName) => add({ columnName, method: 'NONE' }));
                      }}
                    >
                      导入常用字段模板
                    </Button>
                  </>
                )}
              </Space>
              <Table
                size="small"
                pagination={false}
                scroll={{ x: 1000 }}
                rowKey="key"
                dataSource={fields}
                locale={{ emptyText: '选择源数据或新增字段后配置脱敏方式' }}
                columns={[
                  {
                    title: '字段名',
                    width: 190,
                    render: (_value, field) => (
                      <Space direction="vertical" size={0} style={{ width: '100%' }}>
                        <Form.Item
                          name={[field.name, 'columnName']}
                          rules={[{ required: true, message: '请输入字段名' }]}
                          noStyle
                        >
                          {allowCustomColumns ? (
                            <Input placeholder="字段名" />
                          ) : (
                            <Input disabled />
                          )}
                        </Form.Item>
                        <Space size={4}>
                          {maskingRows[field.name]?.columnType && (
                            <Typography.Text type="secondary">
                              {maskingRows[field.name].columnType}
                            </Typography.Text>
                          )}
                          {maskingRows[field.name]?.sampleValue && (
                            <Typography.Text
                              type="secondary"
                              ellipsis
                              style={{ maxWidth: 130 }}
                            >
                              示例：{maskingRows[field.name].sampleValue}
                            </Typography.Text>
                          )}
                        </Space>
                      </Space>
                    ),
                  },
                  {
                    title: '脱敏方法',
                    width: 180,
                    render: (_value, field) => (
                      <Form.Item
                        name={[field.name, 'method']}
                        initialValue="NONE"
                        noStyle
                      >
                        <Select
                          options={maskingMethods}
                          popupMatchSelectWidth={false}
                        />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '参数配置',
                    width: 310,
                    render: (_value, field) => {
                      const row = maskingRows[field.name] || {};
                      if (row.method === 'MASK') {
                        return (
                          <Space.Compact>
                            <Form.Item
                              name={[field.name, 'keepLeft']}
                              initialValue={3}
                              noStyle
                            >
                              <InputNumber min={0} precision={0} addonBefore="左" />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, 'keepRight']}
                              initialValue={4}
                              noStyle
                            >
                              <InputNumber min={0} precision={0} addonBefore="右" />
                            </Form.Item>
                          </Space.Compact>
                        );
                      }
                      if (row.method === 'REPLACE_VALUE') {
                        return (
                          <Form.Item
                            name={[field.name, 'value']}
                            rules={[{ required: true, message: '请输入替换值' }]}
                            noStyle
                          >
                            <Input placeholder="*** 或 REDACTED" />
                          </Form.Item>
                        );
                      }
                      if (row.method === 'REPLACE_MAPPING') {
                        return (
                          <Form.Item
                            name={[field.name, 'mapping']}
                            rules={[
                              { required: true, message: '请输入映射 JSON' },
                              {
                                validator: async (_, value) => {
                                  if (!value) return;
                                  const parsed = JSON.parse(value);
                                  if (
                                    !parsed ||
                                    Array.isArray(parsed) ||
                                    typeof parsed !== 'object'
                                  ) {
                                    throw new Error('请输入 JSON 对象');
                                  }
                                },
                              },
                            ]}
                            noStyle
                          >
                            <Input placeholder='{"A":"高","B":"中"}' />
                          </Form.Item>
                        );
                      }
                      if (row.method === 'HASH') {
                        return (
                          <Form.Item name={[field.name, 'salt']} noStyle>
                            <Input placeholder="自定义加盐（选填）" />
                          </Form.Item>
                        );
                      }
                      if (row.method === 'ROUND') {
                        return (
                          <Form.Item
                            name={[field.name, 'digits']}
                            initialValue={0}
                            noStyle
                          >
                            <InputNumber precision={0} addonBefore="小数位" />
                          </Form.Item>
                        );
                      }
                      return (
                        <Typography.Text type="secondary">无需配置</Typography.Text>
                      );
                    },
                  },
                  {
                    title: '效果示例',
                    width: 180,
                    render: (_value, field) => (
                      <Typography.Text code>
                        {previewMasking(maskingRows[field.name] || {})}
                      </Typography.Text>
                    ),
                  },
                  ...(allowCustomColumns
                    ? [
                        {
                          title: '操作',
                          width: 70,
                          render: (_value: unknown, field: { name: number }) => (
                            <Button
                              type="link"
                              danger
                              onClick={() => remove(field.name)}
                            >
                              删除
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )}
        </Form.List>
      )}
    </>
  );
};
