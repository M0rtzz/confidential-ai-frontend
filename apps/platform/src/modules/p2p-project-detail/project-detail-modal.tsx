import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import type { TabsProps } from 'antd';
import { parse } from 'query-string';
import React from 'react';
import { memo, useEffect, useState } from 'react';

import { DefaultModalManager } from '@/modules/dag-modal-manager';
import { getModel, useModel } from '@/util/valtio-helper';

import { formatTimestamp } from '../dag-result/utils';
import { StatusEnum } from '../p2p-project-list/components/auth-project-tag';
import {
  P2pProjectButtons,
  ProjectStatus,
} from '../p2p-project-list/components/common';
import { P2pProjectListService } from '../p2p-project-list/p2p-project-list.service';

import styles from './index.less';
import { P2pProjectDetailService } from './project-detail-service';

interface IVoteInstsNodesComponent {
  voteInstNodeList: API.ProjectParticipantsDetailVO[];
  joinedAt?: string;
}

const VoteInstsNodesComponent: React.FC<IVoteInstsNodesComponent> = memo(
  ({ voteInstNodeList, joinedAt }: IVoteInstsNodesComponent) => {
    const rows: Array<Record<string, string>> = [];
    const addRow = (name: string, nodeId: string, instId: string, role: string) => {
      const status = voteInstNodeList[0]?.partyVoteStatuses?.find(
        (item) => item.participantID === instId,
      );
      rows.push({
        key: `${nodeId}-${rows.length}`,
        name: name || instId || '-',
        nodeId: nodeId || '-',
        role,
        status:
          status?.action === StatusEnum.PROCESS
            ? '待确认'
            : status?.action === StatusEnum.REJECT
            ? '离线'
            : '正常',
        joinedAt: joinedAt ? formatTimestamp(joinedAt) : '-',
      });
    };
    voteInstNodeList.forEach((item) => {
      addRow(
        item.initiatorName || '',
        item.initiatorId || '',
        item.initiatorId || '',
        '发起方',
      );
      (item.participantNodeInstVOS || []).forEach((group) =>
        (group.invitees || []).forEach((invitee: any) =>
          addRow(invitee.inviteeName, invitee.inviteeId, invitee.instId, '协作方'),
        ),
      );
    });
    return (
      <Table
        rowKey="key"
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无参与机构" /> }}
        columns={[
          { title: '机构/节点名称', dataIndex: 'name' },
          { title: '节点 ID', dataIndex: 'nodeId' },
          { title: '角色', dataIndex: 'role' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value: string) => <Tag>{value}</Tag>,
          },
          { title: '加入时间', dataIndex: 'joinedAt' },
        ]}
      />
    );
  },
);

VoteInstsNodesComponent.displayName = 'VoteInstsNodesComponent';

interface IProjectDetailTabs {
  onChange: (activeKey: string) => void;
  tabKey: string;
  items: TabsProps['items'];
}

const ProjectDetailTabs: React.FC<IProjectDetailTabs> = (props: IProjectDetailTabs) => {
  const { onChange, tabKey, items } = props;
  return (
    <Tabs
      className={styles.tabs}
      activeKey={tabKey}
      animated={false}
      items={items}
      onChange={onChange}
    />
  );
};

export const P2pProjectDetailModal = memo(() => {
  const modalManager = useModel(DefaultModalManager);
  const p2pProjectDetailService = useModel(P2pProjectDetailService);
  const p2pProjectService = useModel(P2pProjectListService);

  const { visible, data } = modalManager.modals[p2pProjectDetailModal.id];
  const { ownerId } = parse(window.location.search);
  const [tabKey, setTabKey] = useState('parties');

  const selfParty = data.partyVoteInfos?.find((party) => party.partyId === ownerId);
  const [comment, setComment] = useState('');

  const items: TabsProps['items'] = [
    {
      key: 'parties',
      label: `参与机构（${p2pProjectDetailService.voteInstNodeList.length}）`,
      children: (
        <VoteInstsNodesComponent
          voteInstNodeList={p2pProjectDetailService.voteInstNodeList}
          joinedAt={data.gmtCreate}
        />
      ),
    },
  ];

  const onClose = () => {
    modalManager.closeModal(p2pProjectDetailModal.id);
  };

  useEffect(() => {
    if (data.voteId) p2pProjectDetailService.initData(data.voteId);
  }, [data.voteId]);

  useEffect(() => {
    setTabKey(data.tabKey || 'parties');
  }, [data]);

  const handleTabChange = (_tabKey: string) => {
    setTabKey(_tabKey);
  };

  const processMessage = async (action: StatusEnum) => {
    const { status } = await p2pProjectDetailService.process({
      action,
      reason: comment,
      voteId: data.voteId,
      voteParticipantId: ownerId as string,
    });

    if (status && status.code !== 0) {
      message.error(status.msg);
    } else {
      message.success('处理成功');

      onClose && onClose();

      await p2pProjectService.getListProject();
    }
  };

  return (
    <Modal
      title={`${tabKey === 'parties' ? '项目参与机构' : '项目详情'}${
        data.projectName ? ` · ${data.projectName}` : ''
      }`}
      width={800}
      destroyOnClose
      open={visible}
      onCancel={onClose}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Space size={8}>
            {/* 当前节点是本方节点，当前项目是待审批状态，本方节点是待处理状态 */}
            {data.status === ProjectStatus.REVIEWING &&
            selfParty?.action === StatusEnum.PROCESS ? (
              <>
                <Popconfirm
                  title="你确定要拒绝吗？"
                  placement="top"
                  description={
                    <Input.TextArea
                      maxLength={50}
                      placeholder="请输50字符以内的理由"
                      allowClear
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  }
                  okText="拒绝"
                  cancelText="取消"
                  okButtonProps={{
                    danger: true,
                    ghost: true,
                  }}
                  onConfirm={async () => {
                    processMessage(StatusEnum.REJECT);
                    setComment('');
                  }}
                  onCancel={() => setComment('')}
                >
                  <Button
                    loading={p2pProjectDetailService.processLoading.rejectLoading}
                    disabled={
                      p2pProjectDetailService.processLoading.type === StatusEnum.AGREE
                    }
                  >
                    拒绝
                  </Button>
                </Popconfirm>
                <Button
                  type="primary"
                  onClick={() => processMessage(StatusEnum.AGREE)}
                  loading={p2pProjectDetailService.processLoading.agreeLoading}
                  disabled={
                    p2pProjectDetailService.processLoading.type === StatusEnum.REJECT
                  }
                >
                  同意
                </Button>
              </>
            ) : (
              <P2pProjectButtons project={data} />
            )}
          </Space>
        </div>
      }
    >
      {data.status === ProjectStatus.REVIEWING ? (
        <VoteInstsNodesComponent
          voteInstNodeList={p2pProjectDetailService.voteInstNodeList}
        />
      ) : (
        <ProjectDetailTabs tabKey={tabKey} onChange={handleTabChange} items={items} />
      )}
    </Modal>
  );
});

P2pProjectDetailModal.displayName = 'P2pProjectDetailModal';

export const p2pProjectDetailModal = {
  id: 'project-detail',
  visible: false,
  data: {},
};

getModel(DefaultModalManager).registerModal(p2pProjectDetailModal);
