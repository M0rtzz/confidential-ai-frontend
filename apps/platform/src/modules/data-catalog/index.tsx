import {
  Button,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Upload,
  Segmented,
  Tabs,
} from 'antd';
import { UploadOutlined, ApiOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { MvpPage, RefreshButton, formatTime } from '@/modules/data-sandbox-mvp/common';
import { DataAssetApi, DataSandboxRecord, responseData } from '@/services/data-sandbox';

import { DataAssetPreviewTable } from './preview-table';

const validityRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  lineHeight: '24px',
};

const validityLabelStyle: CSSProperties = {
  flex: 'none',
  color: 'rgba(0, 0, 0, 0.45)',
  whiteSpace: 'nowrap',
};

const validityValueStyle: CSSProperties = {
  flex: 1,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

const validityActionStyle: CSSProperties = { flex: 'none', padding: 0, height: 'auto' };

/** 与后端 AssetTimeWindow 一致的访问时间窗判定：边界为空表示不限制。 */
const withinAccessWindow = (row: DataSandboxRecord) => {
  const now = dayjs();
  const start = row.access_start ? dayjs(row.access_start) : undefined;
  const end = row.access_end ? dayjs(row.access_end) : undefined;
  if (start?.isValid() && now.isBefore(start)) return false;
  if (end?.isValid() && now.isAfter(end)) return false;
  return true;
};

export const DataCatalogComponent = () => {
  const [items, setItems] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [preview, setPreview] = useState<DataSandboxRecord>();
  const [projectAsset, setProjectAsset] = useState<DataSandboxRecord>();
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState('file');
  const [apiForm] = Form.useForm();
  const [databaseForm] = Form.useForm();
  const [databasePreview, setDatabasePreview] = useState<DataSandboxRecord>();
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const databaseType = Form.useWatch('databaseType', databaseForm);
  const mysqlVersion = Form.useWatch('mysqlVersion', databaseForm);
  const [databaseTables, setDatabaseTables] = useState<string[]>([]);
  const [selectedDatabaseTables, setSelectedDatabaseTables] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [validityEdit, setValidityEdit] = useState<{
    row: DataSandboxRecord;
    field: 'accessEnd' | 'validUntil';
  }>();
  const [validityForm] = Form.useForm();

  const jdbcUrlFor = (type: string) => {
    switch (type) {
      case 'POSTGRESQL':
        return `jdbc:postgresql://host.docker.internal:${
          process.env.DB_POSTGRES_PORT || '15432'
        }/${process.env.DB_POSTGRES_DATABASE || 'demo'}`;
      case 'GREATSQL':
        return `jdbc:mysql://host.docker.internal:${
          process.env.DB_GREATSQL_PORT || '13308'
        }/${
          process.env.DB_GREATSQL_DATABASE || 'demo'
        }?characterEncoding=UTF-8&useUnicode=true&connectionCollation=utf8mb4_unicode_ci&useSSL=false&allowPublicKeyRetrieval=true`;
      case 'OPENGAUSS':
        return `jdbc:opengauss://host.docker.internal:${
          process.env.DB_OPENGAUSS_PORT || '15433'
        }/${process.env.DB_OPENGAUSS_DATABASE || 'demo'}`;
      default:
        return mysqlJdbcUrlFor(mysqlVersion || '6.0+');
    }
  };

  const mysqlJdbcUrlFor = (version: string) =>
    `jdbc:mysql://host.docker.internal:${
      version === '5.1'
        ? process.env.DB_MYSQL55_PORT || '13306'
        : process.env.DB_MYSQL80_PORT || '13307'
    }/${
      version === '5.1'
        ? process.env.DB_MYSQL55_DATABASE || 'demo'
        : process.env.DB_MYSQL80_DATABASE || 'demo'
    }?characterEncoding=UTF-8&useUnicode=true&connectionCollation=utf8mb4_unicode_ci&useSSL=false&allowPublicKeyRetrieval=true`;

  const credentialsFor = (type: string) => {
    switch (type) {
      case 'POSTGRESQL':
        return {
          username: process.env.DB_POSTGRES_USER || 'postgresql',
          password: process.env.DB_POSTGRES_PASSWORD || 'Test@123456',
        };
      case 'GREATSQL':
        return {
          username: process.env.DB_GREATSQL_USER || 'greatsql',
          password: process.env.DB_GREATSQL_PASSWORD || 'Test@123456',
        };
      case 'OPENGAUSS':
        return {
          username: process.env.DB_OPENGAUSS_USER || 'opengauss_remote',
          password: process.env.DB_OPENGAUSS_PASSWORD || 'Test@123456',
        };
      default:
        return {
          username:
            mysqlVersion === '5.1'
              ? process.env.DB_MYSQL55_USER || 'mysql'
              : process.env.DB_MYSQL80_USER || 'mysql',
          password:
            mysqlVersion === '5.1'
              ? process.env.DB_MYSQL55_PASSWORD || 'Test@123456'
              : process.env.DB_MYSQL80_PASSWORD || 'Test@123456',
        };
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(responseData(await DataAssetApi.catalog({ keyword }), []));
    } catch (error: any) {
      message.error(error.message || '数据目录加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => void refresh(), [refresh]);

  const uploadFile = async ({ file, onSuccess, onError }: any) => {
    const body = new FormData();
    body.append('file', file);
    setFileName(file.name || '');
    try {
      const response = await fetch('/api/v1alpha1/data-assets/files/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'User-Token': localStorage.getItem('User-Token') || '' },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onSuccess(await response.json());
      message.success('数据上传成功');
      refresh();
    } catch (error) {
      onError(error);
      message.error('上传失败');
    }
  };

  const submitApi = async (values: DataSandboxRecord) => {
    setAddLoading(true);
    try {
      const headers = values.headers ? JSON.parse(values.headers) : {};
      responseData(await DataAssetApi.createApiSnapshot({ ...values, headers }), {});
      message.success('API 快照已添加');
      setAddOpen(false);
      apiForm.resetFields();
      refresh();
    } catch (error: any) {
      message.error(error.message || 'API 快照添加失败');
    } finally {
      setAddLoading(false);
    }
  };

  const databaseRequest = (values: DataSandboxRecord, tableName = '') => ({
    ...values,
    tableName,
    sql: '',
  });

  const testDatabase = async () => {
    try {
      const values = await databaseForm.validateFields();
      setDatabaseLoading(true);
      const result = responseData(
        await DataAssetApi.testDatabase(databaseRequest(values)),
        {
          connected: false,
          tables: [],
        },
      );
      setDatabaseTables(result.tables || []);
      setSelectedDatabaseTables([]);
      setDatabasePreview(undefined);
      message.success(`连接成功，发现 ${result.tables?.length || 0} 张表`);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error.message || '数据库连接失败');
    } finally {
      setDatabaseLoading(false);
    }
  };

  const previewDatabase = async () => {
    try {
      const values = await databaseForm.validateFields();
      setDatabaseLoading(true);
      if (!selectedDatabaseTables.length) {
        message.warning('请先测试连接并选择至少一张表');
        return;
      }
      setDatabasePreview(
        responseData(
          await DataAssetApi.previewDatabase(
            databaseRequest(values, selectedDatabaseTables[0]),
          ),
          {},
        ),
      );
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error.message || '数据库预览失败');
    } finally {
      setDatabaseLoading(false);
    }
  };

  /** 外部机构共享的表格数据仅同步字段格式，预览时不展示具体数据。 */
  const openPreview = async (row: DataSandboxRecord) => {
    if (row.owned === false && row.modality !== 'IMAGE') {
      setPreview({
        asset: row,
        columns: row.schema_columns || [],
        rows: [],
        sharedMetadataOnly: true,
      });
      return;
    }
    setPreview(responseData(await DataAssetApi.preview(row.id, 10), {}));
  };

  const validityLabel =
    validityEdit?.field === 'accessEnd' ? '访问截止时间' : '使用截止时间';

  const openValidityEdit = (
    row: DataSandboxRecord,
    field: 'accessEnd' | 'validUntil',
  ) => setValidityEdit({ row, field });

  // 回填须等弹框内的 Form 挂载后执行，否则首次打开时赋值会被丢弃，后续再次修改也取不到当前值
  useEffect(() => {
    if (!validityEdit) return;
    const { row, field } = validityEdit;
    const current = field === 'accessEnd' ? row.access_end : row.control_valid_until;
    validityForm.setFieldsValue({ deadline: current ? dayjs(current) : undefined });
  }, [validityEdit, validityForm]);

  /** 使用控制为整体覆盖写入，更改单个时间时需回填其余字段，避免被清空。 */
  const submitValidity = async ({ deadline }: { deadline?: Dayjs }) => {
    if (!validityEdit) return;
    const { row, field } = validityEdit;
    const next = deadline ? deadline.toISOString() : '';
    try {
      const result = responseData(
        await DataAssetApi.saveUsageControl({
          assetId: row.id,
          validFrom: row.control_valid_from || '',
          validUntil: field === 'validUntil' ? next : row.control_valid_until || '',
          allowExport: !!row.allow_export,
          accessStart: row.access_start || '',
          accessEnd: field === 'accessEnd' ? next : row.access_end || '',
        }),
        {},
      );
      message.success(
        result.status === 'PENDING'
          ? '本节点非数据提供方，已提交有效期变更申请'
          : '有效期已更新',
      );
      setValidityEdit(undefined);
      refresh();
    } catch (error: any) {
      message.error(error.message || '有效期更新失败');
    }
  };

  const importDatabase = async () => {
    try {
      const values = await databaseForm.validateFields();
      setDatabaseLoading(true);
      if (!selectedDatabaseTables.length) {
        message.warning('请先测试连接并选择至少一张表');
        return;
      }
      const baseName = String(values.name || '').trim();
      const multipleTables = selectedDatabaseTables.length > 1;
      await Promise.all(
        selectedDatabaseTables.map((tableName) =>
          DataAssetApi.importDatabase({
            ...databaseRequest(values, tableName),
            ...(multipleTables
              ? {
                  name: `${baseName || '数据库导入'} · ${
                    tableName.split('.').pop() || tableName
                  }`,
                }
              : {}),
          }),
        ),
      );
      message.success(`已保存 ${selectedDatabaseTables.length} 个数据资产`);
      setAddOpen(false);
      setDatabasePreview(undefined);
      setDatabaseTables([]);
      setSelectedDatabaseTables([]);
      databaseForm.resetFields();
      refresh();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error.message || '数据库导入失败');
    } finally {
      setDatabaseLoading(false);
    }
  };

  return (
    <MvpPage
      title="数据目录"
      description="本节点源数据、抽样脱敏数据及项目共享数据的统一目录"
      extra={
        <Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setAddOpen(true)}
          >
            添加数据
          </Button>
          <RefreshButton loading={loading} onClick={refresh} />
        </Space>
      }
    >
      <Space
        style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}
      >
        <Input.Search
          allowClear
          placeholder="搜索数据名称或 ID"
          style={{ width: 300 }}
          onSearch={setKeyword}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        scroll={{ x: 1280 }}
        columns={[
          { title: '数据名称', dataIndex: 'name', fixed: 'left', width: 180 },
          {
            title: '数据提供方',
            dataIndex: 'provider_node_name',
            width: 150,
            render: (v: string, row: DataSandboxRecord) => v || row.provider_node_id,
          },
          {
            title: '上传时间',
            dataIndex: 'created_at',
            width: 180,
            render: formatTime,
          },
          {
            title: '数据类型',
            dataIndex: 'data_stage',
            width: 150,
            render: (v: string) => (
              <Tag color={v === 'RAW' ? 'orange' : 'green'}>
                {v === 'RAW' ? '源数据' : '抽样脱敏后数据'}
              </Tag>
            ),
          },
          {
            title: '挂载项目',
            dataIndex: 'mounted_project_count',
            width: 120,
            render: (count: number, row: DataSandboxRecord) =>
              count ? (
                <Button type="link" onClick={() => setProjectAsset(row)}>
                  查看（{count}）
                </Button>
              ) : (
                '未挂载'
              ),
          },
          {
            title: '有效期',
            width: 330,
            render: (_: unknown, row: DataSandboxRecord) =>
              (
                [
                  { field: 'accessEnd', label: '访问截止时间', value: row.access_end },
                  {
                    field: 'validUntil',
                    label: '使用截止时间',
                    value: row.control_valid_until,
                  },
                ] as const
              ).map((item) => (
                <div key={item.field} style={validityRowStyle}>
                  <span style={validityLabelStyle}>{item.label}</span>
                  <span style={validityValueStyle}>
                    {item.value ? formatTime(item.value) : '未设置'}
                  </span>
                  <Tooltip
                    title={
                      row.owned === false ? '非本机构数据不可更改有效期' : undefined
                    }
                  >
                    <Button
                      type="link"
                      size="small"
                      style={validityActionStyle}
                      disabled={row.owned === false}
                      onClick={() => openValidityEdit(row, item.field)}
                    >
                      更改
                    </Button>
                  </Tooltip>
                </div>
              )),
          },
          {
            title: '操作',
            fixed: 'right',
            width: 170,
            render: (_: unknown, row: DataSandboxRecord) => (
              <Space>
                {withinAccessWindow(row) ? (
                  <Button type="link" onClick={() => openPreview(row)}>
                    预览
                  </Button>
                ) : (
                  <Tooltip title="已超过访问截止时间，不可预览">
                    <Button type="link" disabled>
                      预览
                    </Button>
                  </Tooltip>
                )}
                {row.owned && (
                  <Popconfirm
                    title="确定删除该数据？若已挂载到项目，将提交项目全节点审批。"
                    onConfirm={async () => {
                      try {
                        const result = responseData(
                          await DataAssetApi.deleteAsset(row.id),
                          {},
                        );
                        message.success(
                          result.status === 'PENDING_APPROVAL'
                            ? `已提交 ${result.projectCount} 个项目的数据删除申请，请到“项目资源审核”查看进度`
                            : '删除成功',
                        );
                        refresh();
                      } catch (error: any) {
                        message.error(error.message || '删除失败');
                      }
                    }}
                  >
                    <Button danger type="link">
                      删除
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="添加数据"
        open={addOpen}
        width={720}
        footer={null}
        onCancel={() => setAddOpen(false)}
      >
        <Tabs
          activeKey={addMode}
          onChange={setAddMode}
          items={[
            {
              key: 'file',
              label: '文件上传',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Upload.Dragger
                    accept=".csv,.png"
                    maxCount={1}
                    showUploadList
                    customRequest={uploadFile}
                  >
                    <p>
                      <UploadOutlined />
                    </p>
                    <p>点击或拖拽上传 CSV / PNG</p>
                    <p>CSV 最大 500MB，PNG 最大 20MB</p>
                  </Upload.Dragger>
                  {fileName && <span>已选择：{fileName}</span>}
                </Space>
              ),
            },
            {
              key: 'api',
              label: 'API 快照',
              children: (
                <Form
                  form={apiForm}
                  layout="vertical"
                  onFinish={submitApi}
                  initialValues={{ method: 'GET' }}
                >
                  <Form.Item name="name" label="数据名称" rules={[{ required: true }]}>
                    <Input placeholder="user_api_snapshot" />
                  </Form.Item>
                  <Form.Item
                    name="url"
                    label="API 地址"
                    rules={[{ required: true, type: 'url' }]}
                  >
                    <Input prefix={<ApiOutlined />} />
                  </Form.Item>
                  <Form.Item name="method" label="请求方法">
                    <Segmented options={['GET', 'POST']} />
                  </Form.Item>
                  <Form.Item name="headers" label="请求头（JSON，可选）">
                    <Input.TextArea
                      rows={4}
                      placeholder={'{"Authorization":"Bearer xxx"}'}
                    />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={addLoading}>
                    获取并保存快照
                  </Button>
                </Form>
              ),
            },
            {
              key: 'table',
              label: '库表接入',
              children: (
                <Form
                  form={databaseForm}
                  layout="vertical"
                  initialValues={{
                    databaseType: 'MYSQL',
                    mysqlVersion: '6.0+',
                    protocol: 'MYSQL',
                    jdbcUrl: mysqlJdbcUrlFor('6.0+'),
                    ...credentialsFor('MYSQL'),
                  }}
                >
                  <Form.Item name="name" label="数据名称" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Space align="start" wrap>
                    <Form.Item
                      name="databaseType"
                      label="数据库类型"
                      rules={[{ required: true }]}
                    >
                      <Select
                        style={{ width: 160 }}
                        onChange={(value) =>
                          databaseForm.setFieldsValue({
                            jdbcUrl: jdbcUrlFor(value),
                            ...credentialsFor(value),
                          })
                        }
                        options={[
                          { value: 'MYSQL', label: 'MySQL' },
                          { value: 'POSTGRESQL', label: 'PostgreSQL' },
                          { value: 'GREATSQL', label: 'GreatSQL' },
                          { value: 'OPENGAUSS', label: 'openGauss' },
                        ]}
                      />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    name="jdbcUrl"
                    label="数据源地址"
                    rules={[{ required: true }]}
                    extra="请填写完整 JDBC 地址"
                  >
                    <Input placeholder="jdbc:mysql://ip:port/dbName?characterEncoding=UTF-8&useUnicode=true&useSSL=false" />
                  </Form.Item>
                  <Form.Item label="驱动类">
                    <Input
                      readOnly
                      value={
                        databaseType === 'MYSQL'
                          ? mysqlVersion === '5.1'
                            ? 'com.mysql.jdbc.Driver'
                            : 'com.mysql.cj.jdbc.Driver'
                          : databaseType === 'POSTGRESQL'
                          ? 'org.postgresql.Driver'
                          : databaseType === 'GREATSQL'
                          ? 'com.mysql.cj.jdbc.Driver'
                          : 'org.opengauss.Driver'
                      }
                    />
                  </Form.Item>
                  {databaseType === 'MYSQL' && (
                    <Form.Item name="mysqlVersion" label="Connector/J 版本">
                      <Select
                        style={{ width: 260 }}
                        onChange={(value) =>
                          databaseForm.setFieldValue('jdbcUrl', mysqlJdbcUrlFor(value))
                        }
                        options={[
                          { value: '5.1', label: 'Connector/J 5.1.x' },
                          { value: '6.0+', label: 'Connector/J 6.0.x 及以上' },
                        ]}
                      />
                    </Form.Item>
                  )}
                  <Space align="start" wrap>
                    <Form.Item
                      name="username"
                      label="只读账号"
                      rules={[{ required: true }]}
                    >
                      <Input style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item name="password" label="密码">
                      <Input.Password style={{ width: 180 }} />
                    </Form.Item>
                  </Space>
                  <Space>
                    <Button loading={databaseLoading} onClick={testDatabase}>
                      测试连接
                    </Button>
                    <Button
                      loading={databaseLoading}
                      onClick={previewDatabase}
                      disabled={!selectedDatabaseTables.length}
                    >
                      预览选中表
                    </Button>
                    <Button
                      type="primary"
                      loading={databaseLoading}
                      disabled={!selectedDatabaseTables.length}
                      onClick={importDatabase}
                    >
                      导入为数据资产
                    </Button>
                  </Space>
                  {databaseTables.length > 0 && (
                    <Table
                      rowKey="name"
                      size="small"
                      pagination={{ pageSize: 8 }}
                      rowSelection={{
                        selectedRowKeys: selectedDatabaseTables,
                        onChange: (keys) => setSelectedDatabaseTables(keys as string[]),
                      }}
                      columns={[{ title: '可用表名', dataIndex: 'name' }]}
                      dataSource={databaseTables.map((name) => ({ name }))}
                    />
                  )}
                  {databasePreview && (
                    <div style={{ marginTop: 16 }}>
                      <DataAssetPreviewTable preview={databasePreview} />
                    </div>
                  )}
                </Form>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        title="数据预览"
        open={!!preview}
        width={950}
        footer={null}
        onCancel={() => setPreview(undefined)}
      >
        <DataAssetPreviewTable preview={preview} emptyText="数据不可见" />
      </Modal>
      <Modal
        title={`挂载项目 - ${projectAsset?.name || ''}`}
        open={!!projectAsset}
        footer={null}
        onCancel={() => setProjectAsset(undefined)}
      >
        <Table
          rowKey="project_id"
          pagination={false}
          dataSource={projectAsset?.mounted_projects || []}
          columns={[
            { title: '项目名称', dataIndex: 'name' },
            { title: '项目 ID', dataIndex: 'project_id' },
          ]}
        />
      </Modal>
      <Modal
        title={`更改${validityLabel}`}
        open={!!validityEdit}
        destroyOnClose
        onCancel={() => setValidityEdit(undefined)}
        onOk={() => validityForm.submit()}
        okText="保存"
      >
        <Form form={validityForm} layout="vertical" onFinish={submitValidity}>
          <Form.Item name="deadline" label={validityLabel} extra="留空表示不限制">
            <DatePicker
              showTime={{ format: 'HH:mm:ss' }}
              format="YYYY-MM-DD HH:mm:ss"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </MvpPage>
  );
};
