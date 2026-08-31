import { CloseOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Form, Input, message, Select, Space } from 'antd';
import type { ValidateStatus } from 'antd/es/form/FormItem';
import { parse } from 'query-string';
import { useEffect, useState } from 'react';
import { useLocation, history } from 'umi';

import { AccessWrapper, Platform, hasAccess } from '@/components/platform-wrapper';
import { useModel } from '@/util/valtio-helper';

import { NodeState } from '../managed-node-list';

import { CooperativeNodeService } from './cooperative-node.service';
import styles from './index.less';
import { SelectBefore, getProtocol, replaceProtocol } from './slectBefore';

const withProtocol = (address?: string) => {
  if (!address) return '';
  return /^https?:\/\//.test(address) ? address : `http://${address}`;
};

export const AddCooperativeNodeDrawer = ({
  open,
  onClose,
  onOk,
}: {
  open: boolean;
  onClose: () => void;
  onOk: () => void;
}) => {
  const service = useModel(CooperativeNodeService);

  const { computeNodeList, computeNodeLoading } = service;
  const [messageApi, contextHolder] = message.useMessage();
  const [submittable, setSubmittable] = useState(false);
  const [cooperativeServiceType, setCooperativeServiceType] = useState('http://');
  const isAutonomyMode = hasAccess({ type: [Platform.AUTONOMY] });

  const [form] = Form.useForm();

  const computeNodeId = Form.useWatch(['cooperativeNode', 'computeNodeName'], form);
  const verifyCodeValue = Form.useWatch('verifyCode', form);
  // Watch all values
  const values = Form.useWatch([], form);

  const { search } = useLocation();
  const { ownerId } = parse(search);

  useEffect(() => {
    if (open) {
      if (!isAutonomyMode) {
        service.getComputeNodeList();
      }
      const localNodeId = service.nodeService.currentNode?.nodeId || ownerId;
      if (localNodeId) {
        service.getNodeInfo(localNodeId);
      }
    }
  }, [open, ownerId, isAutonomyMode]);

  useEffect(() => {
    form.validateFields({ validateOnly: true }).then(
      () => {
        setSubmittable(true);
      },
      () => {
        setSubmittable(false);
      },
    );
  }, [values]);

  useEffect(() => {
    if (!isAutonomyMode) {
      // AUTONOMY 模式下，需要手动填写计算节点ID和计算节点名称
      form.setFieldValue(['cooperativeNode', 'computeNodeId'], computeNodeId);
      const address = computeNodeList.find(
        (item) => item.controlNodeId === computeNodeId,
      )?.netAddress;
      form.setFieldValue(['cooperativeNode', 'nodeAddress'], replaceProtocol(address));
      if (address) {
        const protocol = getProtocol(address);
        setCooperativeServiceType(protocol);
      }
    }
  }, [computeNodeId]);

  const handleOk = () => {
    form.validateFields().then(async (value) => {
      if (isAutonomyMode) {
        const { status } = await service.addCooperativeNode({
          mode: 1,
          masterNodeId: value.cooperativeNode.masterNodeId,
          dstNodeId: value.cooperativeNode.computeNodeId,
          name: value.cooperativeNode.computeNodeName,
          certText: value.cooperativeNode.cert,
          dstNetAddress: `${cooperativeServiceType}${value.cooperativeNode.nodeAddress}`,
          dstInstId: value.cooperativeNode.instId,
          dstInstName: value.cooperativeNode.instName,
          srcNodeId: service.nodeInfo.nodeId || ownerId,
        });
        if (status && status.code !== 0) {
          message.error(status.msg);
        } else {
          onOk();
          handleClose();
          messageApi.success(<>添加成功！</>);
        }
      } else {
        const { status } = await service.addApprovalAudit({
          initiatorId: ownerId as string,
          voteType: 'NODE_ROUTE',
          voteConfig: {
            srcNodeId: ownerId as string,
            desNodeId: value.cooperativeNode.computeNodeId,
            srcNodeAddr: withProtocol(service.nodeInfo.netAddress),
            desNodeAddr: `${cooperativeServiceType}${value.cooperativeNode.nodeAddress}`,
            isSingle: false,
            // isSingle: value.cooperativeNode.routeType === 'FullDuplex' ? false : true,
          },
        });
        if (status && status.code !== 0) {
          message.error(status.msg);
        } else {
          onOk();
          handleClose();
          messageApi.success(
            <>
              添加成功！请到
              <a
                onClick={() => {
                  history.push(`/message?ownerId=${ownerId}`);
                }}
              >
                消息中心
              </a>
              查看合作进度
            </>,
          );
        }
      }
    });
  };

  const handleClose = () => {
    form.resetFields();
    setCooperativeServiceType('http://');
    onClose();
  };

  const [verifyCodeStatus, setVerifyCodeStatus] = useState<ValidateStatus>('');
  const [verifyCodeHelp, setVerifyCodeHelp] = useState<string>('');
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    if (!verifyCodeValue) {
      setVerifyCodeStatus('');
      setVerifyCodeHelp('');
      setShowAlert(false);
    }
  }, [verifyCodeValue]);

  const base64ToBytes = (base64: string) => {
    const binString = atob(base64);
    const arr = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    return new TextDecoder().decode(arr);
  };

  const handleParseVerifyCode = () => {
    try {
      const base64String = base64ToBytes(verifyCodeValue);
      const jsonObj = JSON.parse(base64String);
      // 全部解析出值才算成功
      if (
        jsonObj.certText &&
        jsonObj.dstNodeId &&
        jsonObj.name &&
        jsonObj.dstNetAddress &&
        jsonObj.instId &&
        jsonObj.instName &&
        jsonObj.masterNodeId
      ) {
        const protocol = getProtocol(jsonObj.dstNetAddress);
        setCooperativeServiceType(protocol);
        form.setFieldsValue({
          cooperativeNode: {
            cert: jsonObj.certText,
            computeNodeId: jsonObj.dstNodeId,
            computeNodeName: jsonObj.name,
            nodeAddress: replaceProtocol(jsonObj.dstNetAddress),
            instName: jsonObj.instName,
            instId: jsonObj.instId,
            masterNodeId: jsonObj.masterNodeId,
          },
        });
        setShowAlert(true);
        setVerifyCodeStatus('');
        setVerifyCodeHelp('');
      } else {
        throw new Error('');
      }
    } catch (error) {
      setVerifyCodeStatus('error');
      setVerifyCodeHelp('无法解析，请确认输入的认证码是否正确');
      setShowAlert(false);
    }
  };

  return (
    <>
      <Drawer
        title="添加合作节点"
        placement="right"
        onClose={handleClose}
        destroyOnClose
        open={open}
        closable={false}
        width={560}
        className={styles.addCooperativeNodeDrawer}
        extra={
          <CloseOutlined
            style={{ fontSize: 12 }}
            onClick={() => {
              handleClose();
            }}
          />
        }
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button disabled={!submittable} type="primary" onClick={handleOk}>
              确定
            </Button>
          </Space>
        }
      >
        {isAutonomyMode && (
          <Alert
            type="warning"
            showIcon
            message="如存在多节点，本机构主节点和对方机构主节点之间需要相互授权"
            style={{ marginBottom: 16 }}
          ></Alert>
        )}
        <Form form={form} layout="vertical">
          <div className={styles.subTitle}>合作节点</div>
          <div className={styles.formGroup}>
            <AccessWrapper accessType={{ type: [Platform.AUTONOMY] }}>
              <Form.Item
                name={'verifyCode'}
                className={styles.verifyCodeForm}
                validateStatus={verifyCodeStatus}
                help={verifyCodeHelp}
                label={
                  <div className={styles.verifyCodeCode}>
                    <div className={styles.tips}>节点认证码 (可选)</div>
                    <Button
                      disabled={!verifyCodeValue}
                      type="link"
                      className={styles.linkTips}
                      onClick={handleParseVerifyCode}
                    >
                      识别解析
                    </Button>
                  </div>
                }
              >
                <Input.TextArea
                  rows={4}
                  placeholder="请输入合作方认证码，识别解析后可自动填充合作节点信息"
                />
              </Form.Item>
              {showAlert && (
                <Alert
                  showIcon
                  message="认证码识别成功，节点信息已为你自动填充，建议不要手动修改"
                  type="success"
                  style={{ marginBottom: 8 }}
                />
              )}
              <Form.Item
                name={['cooperativeNode', 'instName']}
                label={'所属机构'}
                rules={[
                  {
                    required: true,
                    message: '请输入合作方认证码自动解析',
                  },
                ]}
              >
                <Input placeholder="输入合作方认证码后自动解析"></Input>
              </Form.Item>
              <Form.Item
                name={['cooperativeNode', 'instId']}
                label={'所属机构ID'}
                rules={[
                  {
                    required: true,
                    message: '请输入合作方认证码自动解析',
                  },
                ]}
              >
                <Input placeholder="输入合作方认证码后自动解析"></Input>
              </Form.Item>
              <Form.Item
                name={['cooperativeNode', 'masterNodeId']}
                label={'管控节点ID'}
                rules={[
                  {
                    required: true,
                    message: '请输入合作方认证码自动解析',
                  },
                ]}
              >
                <Input placeholder="输入合作方认证码后自动解析"></Input>
              </Form.Item>
            </AccessWrapper>
            <Form.Item
              name={['cooperativeNode', 'computeNodeName']}
              label={'计算节点名'}
              rules={[
                {
                  required: true,
                  message: isAutonomyMode ? '请输入' : '请选择',
                },
              ]}
            >
              {isAutonomyMode ? (
                <Input placeholder="请输入计算节点名" />
              ) : (
                <Select
                  placeholder="请选择"
                  options={computeNodeList
                    .filter(
                      (item) =>
                        item.nodeId !== ownerId && item.nodeStatus === NodeState.READY,
                    )
                    .map((item) => ({
                      value: item.nodeId,
                      label: item.nodeName,
                    }))}
                  loading={computeNodeLoading}
                  showSearch
                ></Select>
              )}
            </Form.Item>
            <Form.Item
              name={['cooperativeNode', 'computeNodeId']}
              label={'计算节点ID'}
              rules={[
                {
                  required: isAutonomyMode ? true : false,
                  message: '请输入',
                },
              ]}
            >
              {isAutonomyMode ? (
                <Input placeholder="请输入计算节点ID" />
              ) : (
                <Input placeholder="选择计算节点后自动填充" disabled />
              )}
            </Form.Item>
            <Form.Item
              name={['cooperativeNode', 'nodeAddress']}
              label={'节点通讯地址'}
              rules={[
                { required: true, message: '请输入通讯地址' },
                {
                  pattern:
                    /^(?!.*\s)(.{1,50}):([0-9]|[1-9]\d|[1-9]\d{2}|[1-9]\d{3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/,
                  message: '请输入正确的通讯地址',
                },
              ]}
            >
              <Input
                placeholder="127.0.0.1"
                addonBefore={
                  <SelectBefore
                    serviceType={cooperativeServiceType}
                    onChange={setCooperativeServiceType}
                  />
                }
              ></Input>
            </Form.Item>
            <AccessWrapper accessType={{ type: [Platform.AUTONOMY] }}>
              <Form.Item
                rules={[{ required: true, message: '请输入节点公钥' }]}
                name={['cooperativeNode', 'cert']}
                label={'节点公钥'}
              >
                <Input.TextArea placeholder="请输入" />
              </Form.Item>
            </AccessWrapper>
            {/* <Form.Item
              label="访问方式"
              name={['cooperativeNode', 'routeType']}
              initialValue={'FullDuplex'}
            >
              <Radio.Group>
                <Radio value={'FullDuplex'}>
                  <Space>双向（合作双方节点互访问）</Space>
                </Radio>
                <Radio value={'Single'}>
                  <Space>单向（发起节点访问合作节点）</Space>
                </Radio>
              </Radio.Group>
            </Form.Item> */}
          </div>
          <Alert
            type="info"
            showIcon
            message={`本方节点将自动使用当前节点：${
              service.nodeInfo.nodeName ||
              service.nodeInfo.nodeId ||
              ownerId ||
              '解析中'
            }`}
            description="本方节点 ID 和通讯地址由系统根据当前登录节点自动解析，无需手动选择或填写。"
            style={{ marginTop: 16 }}
          />
        </Form>
      </Drawer>
      {contextHolder}
    </>
  );
};
