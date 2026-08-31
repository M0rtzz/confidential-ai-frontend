import { message } from 'antd';

import { reply } from '@/services/secretpad/MessageController';
import { projectParticipants } from '@/services/secretpad/P2PProjectController';
import { Model } from '@/util/valtio-helper';

import { StatusEnum } from '../message-center/message.service';

// 仅 p2p 项目支持
export class P2pProjectDetailService extends Model {
  loading = false;

  projectDetail = null;

  voteInstNodeList: API.ProjectParticipantsDetailVO[] = [];
  processLoading: {
    rejectLoading: boolean;
    agreeLoading: boolean;
    type: string | undefined;
  } = {
    rejectLoading: false,
    agreeLoading: false,
    type: undefined,
  };

  initData = async (voteId: string) => {
    await this.getVoteInstsNodes(voteId);
  };

  getVoteInstsNodes = async (voteId: string) => {
    try {
      const { status, data } = await projectParticipants({ voteId });
      if (status?.code !== 0) {
        message.error(status?.message);
        this.voteInstNodeList = [];
        return this.voteInstNodeList;
      }
      this.voteInstNodeList = Array.isArray(data) ? data : data ? [data] : [];
      return this.voteInstNodeList;
    } catch (e) {
      message.error(e);
      this.voteInstNodeList = [];
      return this.voteInstNodeList;
    }
  };

  /**
   * Process messages
   *
   * @param Agree or reject
   */
  process = async (params: API.VoteReplyRequest) => {
    this.processLoading = {
      type: params.action,
      rejectLoading: params.action === StatusEnum.REJECT ? true : false,
      agreeLoading: params.action === StatusEnum.AGREE ? true : false,
    };
    const res = await reply(params);
    this.processLoading = {
      rejectLoading: false,
      agreeLoading: false,
      type: undefined,
    };
    return res;
  };
}
