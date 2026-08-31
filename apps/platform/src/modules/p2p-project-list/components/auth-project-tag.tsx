import {
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd';
import Link from 'antd/es/typography/Link';
import React from 'react';
import { useLocation } from 'umi';

import { DefaultModalManager } from '@/modules/dag-modal-manager';
import { p2pProjectDetailModal } from '@/modules/p2p-project-detail/project-detail-modal';
import { useModel } from '@/util/valtio-helper';
import { DataAssetApi, DataSandboxRecord, responseData } from '@/services/data-sandbox';

import { P2pProjectListService } from '../p2p-project-list.service';

import styles from './auth-project-tag.less';
import { ProjectStatus } from './common';

interface IProps {
  currentInst: {
    id: string;
    name?: string;
  };
  project: API.ProjectVO;
  simple?: boolean;
}

export enum StatusEnum {
  PROCESS = 'REVIEWING',
  AGREE = 'APPROVED',
  REJECT = 'REJECTED',
}

const TagClassNameMapping = {
  [StatusEnum.AGREE]: 'agreeTag',
  [StatusEnum.PROCESS]: 'reviewingTag',
  [StatusEnum.REJECT]: 'rejectedTag',
};

export const StatusObj = {
  [StatusEnum.AGREE]: '已同意',
  [StatusEnum.PROCESS]: '待同意',
  [StatusEnum.REJECT]: '已拒绝',
};

export const moveItemToFrontById = (array: API.PartyVoteInfoVO[], id: string) => {
  const index = array.findIndex((item) => item.partyId === id);
  if (index > -1) {
    const [item] = array.splice(index, 1);
    array.unshift(item);
  }
  return array;
};

export const AuthProjectTag = (props: IProps) => {
  const { currentInst, project, simple } = props;
  const { partyVoteInfos = [], initiatorName, initiator, voteId } = project;
  const { pathname } = useLocation();
  const applyList = [
    {
      name: initiatorName,
      id: initiator,
    },
  ];
  const processList = React.useMemo(() => {
    return moveItemToFrontById(partyVoteInfos, currentInst.id).map((item) => ({
      name: item.partyName,
      id: item.partyId,
      status: item.action,
      reason: item.reason,
    }));
  }, [project]);

  const currentProcessList = simple ? processList.slice(0, 1) : processList;

  const viewInstance = useModel(P2pProjectListService);
  const modalManager = useModel(DefaultModalManager);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveLoading, setApproveLoading] = React.useState(false);
  const [localAssets, setLocalAssets] = React.useState<DataSandboxRecord[]>([]);
  const [approveForm] = Form.useForm();

  const openApprove = async () => {
    try {
      setLocalAssets(
        responseData(await DataAssetApi.catalog({}), []).filter(
          (asset: DataSandboxRecord) => asset.owned !== false,
        ),
      );
      setApproveOpen(true);
    } catch (error: any) {
      message.error(error.message || '加载本节点数据失败');
    }
  };

  const approveWithAssets = async ({ assetIds = [] }: { assetIds?: string[] }) => {
    if (!voteId || !project.projectId) return;
    setApproveLoading(true);
    try {
      const success = await viewInstance.process(StatusEnum.AGREE, voteId, pathname);
      if (!success) return;

      if (assetIds.length) {
        try {
          responseData(
            await DataAssetApi.attachProjectAssets({
              projectId: project.projectId,
              assetIds,
            }),
            [],
          );
        } catch (error: any) {
          message.warning(
            `项目已同意，数据挂载失败：${error.message || '请稍后在项目中重试'}`,
          );
        }
      }
      setApproveOpen(false);
      approveForm.resetFields();
    } catch (error: any) {
      message.error(error.message || '同意项目失败');
    } finally {
      setApproveLoading(false);
    }
  };

  const handleOpenProjectDetail = () => {
    modalManager.openModal(p2pProjectDetailModal.id, project);
  };

  return (
    <div className={styles.content}>
      <div className={styles.applyContent}>
        <Space>
          <Tag className={styles.tagApply}>发起</Tag>
          <div className={styles.nodeName}>
            {/* <DatabaseOutlined /> */}
            {applyList[0].name} 机构
          </div>
          {currentInst.id === applyList[0].id && <div>(我的)</div>}
        </Space>
      </div>
      <div>
        {currentProcessList.map((item) => {
          return (
            <div className={styles.processContent} key={item.id}>
              <Space className={styles.processRow}>
                <Tag className={styles.tagProcess}>受邀</Tag>
                <div className={styles.nodeName}>
                  {/* <DatabaseOutlined /> */}
                  {item.name} 机构
                </div>
                {/* 当前项目是待审批状态，且当前节点是本方节点，并且本方节点是待处理状态 */}
                {project.status === ProjectStatus.REVIEWING &&
                currentInst.id === item.id &&
                item.status === StatusEnum.PROCESS &&
                voteId ? (
                  <Space
                    direction="vertical"
                    size={4}
                    align="center"
                    className={styles.invitationActions}
                  >
                    <div className={styles.agree} onClick={openApprove}>
                      同意
                    </div>
                    <Popconfirm
                      title="你确定要拒绝吗？"
                      placement="left"
                      destroyTooltipOnHide
                      onOpenChange={(open) => {
                        if (!open) {
                          viewInstance.setComment('');
                        }
                      }}
                      description={
                        <Input.TextArea
                          maxLength={50}
                          placeholder="请输50字符以内的理由"
                          allowClear
                          onChange={(e) => viewInstance.setComment(e.target.value)}
                        />
                      }
                      okText="拒绝"
                      cancelText="取消"
                      okButtonProps={{
                        danger: true,
                        ghost: true,
                      }}
                      onConfirm={() =>
                        viewInstance.process(StatusEnum.REJECT, voteId, pathname)
                      }
                    >
                      <div className={styles.reject}>拒绝</div>
                    </Popconfirm>
                    <Link
                      onClick={handleOpenProjectDetail}
                    >{`共${processList.length}方机构`}</Link>
                  </Space>
                ) : (
                  <Space>
                    <Tooltip
                      title={
                        item.status === StatusEnum.REJECT
                          ? item.reason || '暂无原因'
                          : ''
                      }
                    >
                      <Tag
                        className={
                          styles[
                            TagClassNameMapping[item.status as keyof typeof StatusObj]
                          ]
                        }
                      >
                        {StatusObj[item.status as keyof typeof StatusObj]}
                      </Tag>
                    </Tooltip>
                    {currentInst.id === item.id && <div>(我的)</div>}
                  </Space>
                )}
              </Space>
            </div>
          );
        })}
      </div>
      <Modal
        title="同意项目并挂载本节点数据"
        open={approveOpen}
        confirmLoading={approveLoading}
        okText="提交并同意"
        cancelText="取消"
        onCancel={() => setApproveOpen(false)}
        onOk={() => approveForm.submit()}
      >
        <Form form={approveForm} layout="vertical" onFinish={approveWithAssets}>
          <Form.Item
            name="assetIds"
            label="本节点挂载数据（可选）"
            tooltip="所选数据会与创建方及其他参与方挂载的数据合并为项目共享数据目录"
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="选择源数据或抽样脱敏后的数据"
              options={localAssets.map((asset) => ({
                value: asset.id,
                label: `${asset.name}（${
                  asset.data_stage === 'RAW' ? '源数据' : '抽样脱敏数据'
                }）`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
