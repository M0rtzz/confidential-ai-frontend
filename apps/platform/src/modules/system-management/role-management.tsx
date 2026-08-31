import { PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tree,
} from 'antd';
import { useMemo, useState } from 'react';

import { formatTime, MvpPage } from '@/modules/data-sandbox-mvp/common';

import styles from './index.less';
import type { SandboxRole } from './store';
import {
  createEntityId,
  permissionLabelMap,
  permissionTree,
  useSystemManagementStore,
} from './store';

const permissionLabels = (permissions: string[]) =>
  permissions
    .filter((key) => !key.startsWith('group-'))
    .map((key) => permissionLabelMap[key] || key);

export const RoleManagementComponent = () => {
  const { state, updateState } = useSystemManagementStore();
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<SandboxRole>();
  const [viewingPermissions, setViewingPermissions] = useState<SandboxRole>();
  const [modalOpen, setModalOpen] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [form] = Form.useForm<SandboxRole>();

  const filteredRoles = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return state.roles.filter(
      (role) =>
        !normalized ||
        role.name.toLowerCase().includes(normalized) ||
        role.description.toLowerCase().includes(normalized),
    );
  }, [keyword, state.roles]);

  const memberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    state.users.forEach((user) =>
      user.roleIds.forEach((roleId) => {
        counts[roleId] = (counts[roleId] || 0) + 1;
      }),
    );
    return counts;
  }, [state.users]);

  const openCreate = () => {
    setEditing(undefined);
    setCheckedKeys([]);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (role: SandboxRole) => {
    setEditing(role);
    setCheckedKeys(role.permissions);
    form.setFieldsValue(role);
    setModalOpen(true);
  };

  const saveRole = async () => {
    const values = await form.validateFields();
    if (!checkedKeys.length) {
      message.error('请至少选择一项角色权限');
      return;
    }
    const name = values.name.trim();
    const duplicated = state.roles.some(
      (role) =>
        role.id !== editing?.id && role.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicated) {
      message.error('角色名称已存在');
      return;
    }
    updateState((current) => ({
      ...current,
      roles: editing
        ? current.roles.map((role) =>
            role.id === editing.id
              ? {
                  ...role,
                  name,
                  description: values.description?.trim() || '',
                  permissions: checkedKeys,
                }
              : role,
          )
        : [
            {
              id: createEntityId('role'),
              name,
              description: values.description?.trim() || '',
              permissions: checkedKeys,
              system: false,
              createdAt: new Date().toISOString(),
            },
            ...current.roles,
          ],
    }));
    message.success(editing ? '角色已更新' : '角色已创建');
    setModalOpen(false);
  };

  const deleteRole = (role: SandboxRole) => {
    if (memberCounts[role.id]) {
      message.warning('该角色仍有用户使用，无法删除');
      return;
    }
    updateState((current) => ({
      ...current,
      roles: current.roles.filter((item) => item.id !== role.id),
    }));
    message.success('角色已删除');
  };

  return (
    <MvpPage
      title="角色管理"
      description="按沙箱业务能力配置角色权限，并查看角色的用户分配情况"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增角色
        </Button>
      }
    >
      <div className={styles.toolbar}>
        <Input.Search
          allowClear
          placeholder="搜索角色名称"
          onSearch={setKeyword}
          style={{ width: 260 }}
        />
        <span>共 {filteredRoles.length} 个角色</span>
      </div>
      <Table
        rowKey="id"
        dataSource={filteredRoles}
        pagination={{
          pageSize: 10,
          showTotal: (total) => '共 ' + total + ' 条',
        }}
        scroll={{ x: 1000 }}
        columns={[
          {
            title: '角色',
            dataIndex: 'name',
            width: 190,
            render: (value: string, row: SandboxRole) => (
              <>
                <Space>
                  <span className={styles.cellTitle}>{value}</span>
                  {row.system && <Tag>系统预置</Tag>}
                </Space>
                <span className={styles.cellDescription}>{row.description}</span>
              </>
            ),
          },
          {
            title: '权限范围',
            dataIndex: 'permissions',
            width: 320,
            render: (permissions: string[], row: SandboxRole) => {
              const labels = permissionLabels(permissions);
              return (
                <div className={styles.permissionTags}>
                  {labels.slice(0, 3).map((label) => (
                    <Tag color="blue" key={label}>
                      {label}
                    </Tag>
                  ))}
                  {labels.length > 3 && (
                    <Button
                      className={styles.permissionMore}
                      size="small"
                      type="link"
                      onClick={() => setViewingPermissions(row)}
                    >
                      +{labels.length - 3}
                    </Button>
                  )}
                </div>
              );
            },
          },
          {
            title: '用户数',
            dataIndex: 'id',
            width: 90,
            render: (id: string) => memberCounts[id] || 0,
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 180,
            render: formatTime,
          },
          {
            title: '操作',
            key: 'actions',
            fixed: 'right',
            width: 140,
            render: (_: unknown, row: SandboxRole) => (
              <Space size={0}>
                <Button type="link" disabled={row.system} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确定删除该角色？"
                  disabled={row.system}
                  onConfirm={() => deleteRole(row)}
                >
                  <Button danger type="link" disabled={row.system}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={modalOpen}
        title={editing ? '编辑角色' : '新增角色'}
        width={680}
        onCancel={() => setModalOpen(false)}
        onOk={saveRole}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[
              { required: true, message: '请输入角色名称' },
              { min: 2, max: 20, message: '角色名称长度为 2 到 20 个字符' },
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="description" label="角色说明">
            <Input.TextArea
              rows={2}
              maxLength={100}
              showCount
              placeholder="说明该角色在数据沙箱中的职责"
            />
          </Form.Item>
          <Form.Item label="角色权限" required>
            <div className={styles.permissionTree}>
              <Tree
                blockNode
                checkable
                defaultExpandAll
                treeData={permissionTree}
                checkedKeys={checkedKeys}
                onCheck={(keys) =>
                  setCheckedKeys(
                    (Array.isArray(keys) ? keys : keys.checked).map(String),
                  )
                }
              />
            </div>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!viewingPermissions}
        title={`${viewingPermissions?.name || ''}·全部权限范围`}
        width={560}
        footer={null}
        onCancel={() => setViewingPermissions(undefined)}
        destroyOnClose
      >
        <div className={styles.permissionModalTags}>
          {permissionLabels(viewingPermissions?.permissions || []).map((label) => (
            <Tag color="blue" key={label}>
              {label}
            </Tag>
          ))}
        </div>
      </Modal>
    </MvpPage>
  );
};
