import { Alert, Button, Descriptions, Empty, Input, Modal, Space, Tag, Typography, message } from 'antd';
import { parse } from 'query-string';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'umi';

import { formatTime } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import {
  deleteUsingPOST,
  page as requestNodeRoutePage,
} from '@/services/secretpad/NodeRouteController';
import { responseData, TrustChainApi } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

import { AddCooperativeNodeDrawer } from './add-cooperative-node-modal';
import styles from './index.less';

const { Text } = Typography;

/** Kuscia 判定的路由状态；只有 Succeeded 才是真正打通。 */
const routeStatusLabel = (status?: string) =>
  ({ Succeeded: '已连通', Pending: '建立中', Failed: '失败' }[status || ''] || '未知');

/**
 * 客户端「中心端连接」：单条记录展示与既有的合作节点表格无关，
 * 数据来自 /trust-chain/peer 委派接口；删除前需先做 unbind-check 二次确认。
 */
export const PeerConnectionComponent = () => {
  const { search } = useLocation();
  const { ownerId } = parse(search);

  const [peerData, setPeerData] = useState<DataSandboxRecord>({});
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [checkLoading, setCheckLoading] = useState(false);
  const [blockers, setBlockers] = useState<DataSandboxRecord[]>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPeerData(responseData(await TrustChainApi.peer(), {}));
    } catch (error) {
      message.error(requestErrorMessage(error, '加载中心端连接失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const peer = (peerData.peers || [])[0] as DataSandboxRecord | undefined;

  /** 删除前先做 unbind-check：未清理项存在时只展示阻塞列表，禁用确认 */
  const startUnbind = async () => {
    setCheckLoading(true);
    try {
      const check = responseData(await TrustChainApi.unbindCheck(), {});
      if (check.clean) {
        setBlockers(undefined);
      } else {
        setBlockers((check.blockers || []).filter((b: DataSandboxRecord) => b.count > 0));
      }
      setConfirmInput('');
      setConfirmOpen(true);
    } catch (error) {
      message.error(requestErrorMessage(error, '解绑前置检查失败'));
    } finally {
      setCheckLoading(false);
    }
  };

  const confirmUnbind = async () => {
    setDeleting(true);
    try {
      const list = await requestNodeRoutePage({
        page: 1,
        size: 1,
        search: '',
        sort: {},
        ownerId: ownerId as string,
      });
      const routeId = list?.data?.list?.[0]?.routeId;
      if (!routeId) {
        message.error('未找到对应的节点路由，无法删除');
        return;
      }
      const { status } = await deleteUsingPOST({ routerId: routeId });
      if (status && status.code !== 0) {
        message.error(status.msg || '删除失败');
        return;
      }
      message.success('已断开与中心端的连接');
      setConfirmOpen(false);
      await refresh();
    } catch (error) {
      message.error(requestErrorMessage(error, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const bound = !!peerData.bound && !!peer;
  const canConfirmDelete = !blockers && confirmInput.trim() === (ownerId as string);

  return (
    <div className={styles.cooperativeNodeList}>
      {!bound ? (
        <Empty
          description="尚未接入中心端"
          style={{ marginTop: 80 }}
        >
          <Button type="primary" loading={loading} onClick={() => setAddOpen(true)}>
            连接中心端
          </Button>
        </Empty>
      ) : (
        <div className={styles.peerConnectionCard}>
          <Descriptions bordered size="small" column={2} title="中心端连接">
            <Descriptions.Item label="中心端机构名称" span={2}>
              {peer?.ownerName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="中心端机构标识" span={2}>
              {peer?.ownerId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="通讯地址" span={2}>
              {peer?.address || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="证书指纹" span={2}>
              {peer?.certSha256 || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="节点路由" span={2}>
              {(peer?.routes || []).length ? (
                <Space direction="vertical" size={2}>
                  {(peer?.routes || []).map((route: DataSandboxRecord) => (
                    <span key={`${route.srcNodeId}-${route.dstNodeId}`}>
                      <Tag color={route.status === 'Succeeded' ? 'success' : 'warning'}>
                        {routeStatusLabel(route.status)}
                      </Tag>
                      {route.srcNodeId} → {route.dstNodeId}
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        {route.direction === 'OUTBOUND' ? '本端发起' : '对端发起'}
                      </Text>
                    </span>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">未登记</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="契约通道">
              <Tag
                color={
                  peer?.contractChannelReachable === null
                    ? 'default'
                    : peer?.contractChannelReachable
                      ? 'success'
                      : 'error'
                }
              >
                {peer?.contractChannelReachable === null
                  ? '不适用'
                  : peer?.contractChannelReachable
                    ? '连通'
                    : '不通'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="契约通道最近检查时间">
              {formatTime(peer?.contractCheckedAt)}
            </Descriptions.Item>
          </Descriptions>
          <Alert
            showIcon
            type="info"
            style={{ marginTop: 12 }}
            message="节点路由是 Kuscia 数据面，用于计算任务的数据通信；契约通道是平台间双向 TLS 的契约面，密钥申请、规则登记与出域信封均走契约通道。每个平台只登记自己创建的那条路由，状态取自 Kuscia 的实际判定。"
          />
          <div style={{ marginTop: 16 }}>
            <Button danger loading={checkLoading} onClick={startUnbind}>
              删除
            </Button>
          </div>
        </div>
      )}

      <AddCooperativeNodeDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onOk={() => refresh()}
      />

      <Modal
        title="确认删除与中心端的连接"
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={confirmUnbind}
        okButtonProps={{ danger: true, disabled: !canConfirmDelete, loading: deleting }}
        okText="确认删除"
        cancelText="取消"
      >
        {blockers ? (
          <>
            <Alert
              showIcon
              type="warning"
              message="存在未清理的数据关联，暂不能删除"
              style={{ marginBottom: 12 }}
            />
            <ul>
              {blockers.map((item) => (
                <li key={item.key}>
                  {item.label}：{item.count} 项，{item.hint}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <Alert
              showIcon
              type="warning"
              message="删除后将断开与中心端的连接，请谨慎操作"
              style={{ marginBottom: 12 }}
            />
            <Space direction="vertical" style={{ width: '100%' }}>
              <span>
                请输入本机构标识 <strong>{ownerId}</strong> 以二次确认：
              </span>
              <Input
                value={confirmInput}
                onChange={(event) => setConfirmInput(event.target.value)}
                placeholder="请输入本机构标识"
              />
            </Space>
          </>
        )}
      </Modal>
    </div>
  );
};
