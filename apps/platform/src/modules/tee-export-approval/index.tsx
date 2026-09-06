import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { parse } from 'query-string';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'umi';

import {
  MvpPage,
  RefreshButton,
  formatTime,
  saveBlob,
} from '@/modules/data-sandbox-mvp/common';
import {
  accessTime,
  expired,
  useAccessClock,
  viewDeadline,
} from '@/modules/data-sandbox-mvp/result-access';
import { LoginService } from '@/modules/login/login.service';
import { DataComputeApi, TeeExportApi, responseData } from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';
import { useModel } from '@/util/valtio-helper';

import { requestErrorMessage } from './error';

const { Text } = Typography;
const labels: Record<string, string> = {
  PENDING_APPROVAL: '待审批',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已撤回',
  PENDING: '待投票',
  EXPIRED: '已过期',
  DEADLINE_REQUIRED: '待确认期限',
  UNAVAILABLE: '不可用',
};
const colors: Record<string, string> = {
  PENDING_APPROVAL: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  EXPIRED: 'default',
};
const nameOf = (row: DataSandboxRecord) =>
  row.resultName || row.name || row.table_name || '历史结果（来源信息不完整）';
const idOf = (row: DataSandboxRecord) => row.resultId || row.table_name;
const untilOf = (row: DataSandboxRecord) =>
  row.effectiveExportUntil || row.exportUntil || row.export_until;
// 日期控件输入统一按北京时间解释，避免浏览器时区影响提交期限。
const toBeijingIso = (value: dayjs.Dayjs) =>
  new Date(`${value.format('YYYY-MM-DDTHH:mm:ss')}+08:00`).toISOString();
const pickerTime = (value: dayjs.Dayjs) => Date.parse(toBeijingIso(value));
const deadlineText = (value: unknown) => (value ? formatTime(value) : '待确认期限');

export const TeeExportApprovalComponent = () => {
  const search = useLocation().search;
  const query = parse(search);
  const sandboxId = String(query.sandboxId || '');
  const loginService = useModel(LoginService);
  const client = loginService.userInfo?.endRole === 'CLIENT';
  const { now, syncClock } = useAccessClock();
  const [rows, setRows] = useState<DataSandboxRecord[]>([]);
  const [mine, setMine] = useState<DataSandboxRecord[]>([]);
  const [pending, setPending] = useState<DataSandboxRecord[]>([]);
  const [records, setRecords] = useState<DataSandboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [ordinaryError, setOrdinaryError] = useState('');
  const [activeTab, setActiveTab] = useState('results');
  const [keyword, setKeyword] = useState(String(query.resultId || ''));
  const [project, setProject] = useState(String(query.projectId || ''));
  const [sandbox, setSandbox] = useState(sandboxId);
  const [kind, setKind] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [dateRange, setDateRange] = useState<
    [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  >(null);
  const [detail, setDetail] = useState<DataSandboxRecord>();
  const [application, setApplication] = useState<DataSandboxRecord>();
  const [control, setControl] = useState<DataSandboxRecord>();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [form] = Form.useForm();
  const [controlForm] = Form.useForm();
  const allowExport = Form.useWatch('allowExport', controlForm);
  useEffect(() => {
    const next = parse(search);
    setKeyword(String(next.resultId || ''));
    setProject(String(next.projectId || ''));
    setSandbox(String(next.sandboxId || ''));
    setKind(undefined);
    setStatus(undefined);
    setDateRange(null);
    setActiveTab('results');
    setDetail(undefined);
  }, [search]);
  const orderExpired = (row: DataSandboxRecord) =>
    row.accessStatus === 'EXPIRED' || expired(untilOf(row), now);
  const applyReason = (row: DataSandboxRecord) =>
    !client
      ? '请由贡献机构客户端申请导出'
      : row.disabledReason ||
        (!row.maxExportUntil
          ? '待确认授权期限'
          : expired(row.maxExportUntil, now)
          ? '授权已过期'
          : row.canApply !== true
          ? '当前不可申请'
          : '');
  const downloadReason = (row: DataSandboxRecord) =>
    !client
      ? '请在申请机构客户端下载'
      : orderExpired(row)
      ? '导出申请已过期'
      : !untilOf(row)
      ? '待确认导出期限'
      : row.canDownload !== true
      ? row.disabledReason || '当前机构无下载权限'
      : '';
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setOrdinaryError('');
    try {
      const result = responseData(
        await (client ? TeeExportApi.exportable() : TeeExportApi.catalog()),
        {},
      );
      syncClock(result.serverTime);
      let ordinary: DataSandboxRecord[] = [];
      if (sandboxId) {
        try {
          ordinary = responseData(await DataComputeApi.resultControls(sandboxId), [])
            .filter((row: DataSandboxRecord) => !row.tee_encrypted)
            .map((row: DataSandboxRecord) => ({
              ...row,
              ordinary: !row.tee_report,
              report: !!row.tee_report,
              sandboxId: row.sandboxId || row.sandbox_id || sandboxId,
              projectId:
                row.projectId || row.project_id || String(query.projectId || ''),
              createdAt: row.createdAt || row.finished_at || row.created_at,
              taskName: row.taskName || row.task_name,
              runId: row.runId || row.run_id || row.task_id,
              resultId: row.table_name,
              kind: row.tee_report ? 'REPORT' : 'TABLE',
            }));
        } catch (e: unknown) {
          setOrdinaryError(
            requestErrorMessage(
              e,
              '当前无法读取普通结果及报告；密文结果和导出工单仍可使用。',
            ),
          );
        }
      }
      setRows([...(result.items || []), ...ordinary]);
      if (client) {
        const responses = await Promise.all([
          TeeExportApi.mine(),
          TeeExportApi.pending(),
          TeeExportApi.history(),
        ]);
        const values = responses.map((res) => responseData(res, {}).items || []);
        setMine(values[0]);
        setPending(values[1]);
        setRecords(values[2]);
      } else {
        setMine([]);
        setPending([]);
        setRecords([]);
      }
    } catch (e: unknown) {
      setError(requestErrorMessage(e, '加载结果导出与审批失败'));
    } finally {
      setLoading(false);
    }
  }, [client, sandboxId, syncClock]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const openDetail = async (row: DataSandboxRecord) => {
    try {
      setDetail(
        row.exportId ? responseData(await TeeExportApi.detail(row.exportId), {}) : row,
      );
    } catch (e: unknown) {
      message.error(requestErrorMessage(e, '加载详情失败'));
    }
  };
  const submit = async () => {
    if (!application) return;
    const reason = applyReason(application);
    if (reason) {
      message.warning(reason);
      return;
    }
    try {
      const values = await form.validateFields();
      setBusyId(idOf(application));
      await TeeExportApi.create(
        application.resultId,
        toBeijingIso(values.exportUntil),
        values.purpose.trim(),
      );
      setApplication(undefined);
      message.success('申请已提交，等待贡献机构审批');
      setActiveTab('mine');
      await refresh();
    } catch (e: any) {
      if (!e.errorFields) message.error(requestErrorMessage(e, '提交申请失败'));
    } finally {
      setBusyId('');
    }
  };
  const act = async (action: 'APPROVE' | 'REJECT') => {
    if (!detail?.canVote || !client || orderExpired(detail) || !untilOf(detail)) return;
    setBusyId(detail.exportId);
    try {
      setDetail(
        responseData(
          await TeeExportApi.action(
            detail.exportId,
            action,
            action === 'REJECT' ? rejectComment.trim() : '',
          ),
          {},
        ),
      );
      setRejectOpen(false);
      setRejectComment('');
      message.success('审批意见已保存');
      await refresh();
    } catch (e: unknown) {
      message.error(requestErrorMessage(e, '审批失败'));
    } finally {
      setBusyId('');
    }
  };
  const download = async (row: DataSandboxRecord) => {
    const reason = row.ordinary
      ? expired(untilOf(row), now) ||
        expired(viewDeadline(row), now) ||
        !untilOf(row) ||
        row.canExport !== true
        ? '导出权限已过期或未授权'
        : ''
      : downloadReason(row);
    if (reason) {
      message.warning(reason);
      return;
    }
    setBusyId(row.exportId || idOf(row));
    try {
      if (row.ordinary)
        saveBlob(
          await DataComputeApi.sandboxDbTableExport(sandboxId, row.table_name),
          `${row.table_name}.csv`,
        );
      else {
        const result = await TeeExportApi.download(row.exportId);
        saveBlob(result.blob, result.fileName);
      }
      message.success('结果已下载');
    } catch (e: unknown) {
      message.error(requestErrorMessage(e, '下载失败'));
    } finally {
      setBusyId('');
    }
  };
  const cancel = (row: DataSandboxRecord) =>
    Modal.confirm({
      title: '撤回导出申请',
      content: '撤回后工单不能继续审批，确定撤回？',
      okText: '撤回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await TeeExportApi.cancel(row.exportId);
          setDetail(undefined);
          await refresh();
        } catch (e: unknown) {
          message.error(requestErrorMessage(e, '撤回失败'));
        }
      },
    });
  const stateOf = (row: DataSandboxRecord) =>
    row.status || row.latestStatus || 'UNREQUESTED';
  const accessStatusOf = (row: DataSandboxRecord) => {
    if (row.ordinary || row.report) {
      if (expired(viewDeadline(row), now) || row.accessStatus === 'EXPIRED')
        return 'EXPIRED';
      if (
        row.accessStatus === 'UNAVAILABLE' ||
        ['UNAVAILABLE', 'INVALID', 'REVOKED'].includes(row.status)
      )
        return 'UNAVAILABLE';
      if (
        !Number.isFinite(accessTime(viewDeadline(row))) ||
        row.accessStatus === 'UNKNOWN'
      )
        return 'DEADLINE_REQUIRED';
      return row.accessStatus === 'DEADLINE_REQUIRED' ? 'DEADLINE_REQUIRED' : 'ACTIVE';
    }
    const state = row.accessStatus || row.latestAccessStatus;
    if (
      orderExpired(row) ||
      state === 'EXPIRED' ||
      (!row.exportId && expired(row.maxExportUntil, now))
    )
      return 'EXPIRED';
    if (state === 'UNAVAILABLE') return 'UNAVAILABLE';
    if (state === 'UNKNOWN' || state === 'DEADLINE_REQUIRED')
      return 'DEADLINE_REQUIRED';
    const deadline = row.exportId ? untilOf(row) : row.maxExportUntil;
    if (!Number.isFinite(accessTime(deadline))) return 'DEADLINE_REQUIRED';
    if (row.latestExportId && !state) return 'DEADLINE_REQUIRED';
    return state === 'ACTIVE' ||
      (!row.exportId && !row.latestExportId && row.canApply === true)
      ? 'ACTIVE'
      : 'UNAVAILABLE';
  };
  const accessOf = (row: DataSandboxRecord) =>
    ((
      {
        ACTIVE: '有效',
        EXPIRED: '已过期',
        DEADLINE_REQUIRED: '待确认期限',
        UNAVAILABLE: '不可用',
      } as Record<string, string>
    )[accessStatusOf(row)]);
  const filtered = (items: DataSandboxRecord[]) =>
    items.filter((row) => {
      const text = [
        nameOf(row),
        idOf(row),
        row.exportId,
        row.projectName,
        row.sandboxName,
        row.taskName,
        row.task_name,
        row.runId,
      ]
        .join(' ')
        .toLowerCase();
      const generated = dayjs(row.createdAt || row.created_at);
      return (
        (!keyword || text.includes(keyword.toLowerCase())) &&
        (!project || row.projectId === project) &&
        (!sandbox || (row.sandboxId || sandboxId) === sandbox) &&
        (!kind || row.kind === kind) &&
        (!status ||
          (['EXPIRED', 'DEADLINE_REQUIRED', 'UNAVAILABLE'].includes(status)
            ? accessStatusOf(row) === status
            : stateOf(row) === status)) &&
        (!dateRange?.[0] ||
          (generated.isValid() && !generated.isBefore(dateRange[0].startOf('day')))) &&
        (!dateRange?.[1] ||
          (generated.isValid() && !generated.isAfter(dateRange[1].endOf('day'))))
      );
    });
  const identityColumns = [
    {
      title: '结果名称',
      key: 'name',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space
          direction="vertical"
          size={0}
          style={{ width: '100%', overflowWrap: 'anywhere' }}
        >
          <Text strong>{nameOf(row)}</Text>
          <Text type="secondary">
            {(
              {
                DATA: '数据',
                MODEL: '模型',
                REPORT: '报告',
                TABLE: '开发结果表',
              } as Record<string, string>
            )[row.kind] || row.kind}
            <Text copyable={{ text: idOf(row) }}> · {idOf(row)}</Text>
          </Text>
        </Space>
      ),
    },
    {
      title: '项目 / 沙箱',
      key: 'source',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space
          direction="vertical"
          size={0}
          style={{ width: '100%', overflowWrap: 'anywhere' }}
        >
          <span>{row.projectName || row.projectId || '来源待补齐'}</span>
          <Text type="secondary">
            {row.sandboxName || row.sandboxId || '来源待补齐'}
          </Text>
        </Space>
      ),
    },
    {
      title: '来源任务 / 运行',
      key: 'task',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space
          direction="vertical"
          size={0}
          style={{ width: '100%', overflowWrap: 'anywhere' }}
        >
          <span>{row.taskName || row.task_name || '历史结果，来源信息不完整'}</span>
          <Text type="secondary">{row.runId || row.run_id || row.task_id || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '生成时间',
      key: 'created',
      render: (_: unknown, row: DataSandboxRecord) =>
        formatTime(row.createdAt || row.created_at),
    },
  ];
  const orderColumns = [
    ...identityColumns,
    {
      title: '申请用途 / 机构',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space
          direction="vertical"
          size={0}
          style={{ width: '100%', overflowWrap: 'anywhere' }}
        >
          <span>{row.purpose || '-'}</span>
          <Text type="secondary">{row.requesterOwnerId || row.requester || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '导出截止时间',
      render: (_: unknown, row: DataSandboxRecord) => deadlineText(untilOf(row)),
    },
    {
      title: '状态',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space
          direction="vertical"
          size={0}
          style={{ width: '100%', overflowWrap: 'anywhere' }}
        >
          <Tag color={colors[stateOf(row)]}>{labels[stateOf(row)] || stateOf(row)}</Tag>
          <Text type="secondary">{accessOf(row)}</Text>
        </Space>
      ),
    },
    {
      title: '操作',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(row)}>
            详情
          </Button>
          {activeTab === 'mine' && row.status === 'APPROVED' && (
            <Tooltip title={downloadReason(row)}>
              <Button
                type="link"
                disabled={!!downloadReason(row)}
                loading={busyId === row.exportId}
                onClick={() => download(row)}
              >
                解密下载
              </Button>
            </Tooltip>
          )}
          {activeTab === 'mine' && row.canCancel && (
            <Button
              type="link"
              danger
              disabled={orderExpired(row)}
              onClick={() => cancel(row)}
            >
              撤回
            </Button>
          )}
        </Space>
      ),
    },
  ];
  const resultColumns = [
    ...identityColumns,
    {
      title: '查看截止时间',
      render: (_: unknown, row: DataSandboxRecord) => deadlineText(viewDeadline(row)),
    },
    {
      title: '最晚导出时间',
      render: (_: unknown, row: DataSandboxRecord) =>
        row.report
          ? '按输出规则展示，无需申请'
          : deadlineText(row.maxExportUntil || untilOf(row)),
    },
    {
      title: '状态',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Tag>
          {row.report
            ? '明文报告'
            : row.ordinary
            ? '普通结果表'
            : labels[stateOf(row)] || '未申请'}
        </Tag>
      ),
    },
    {
      title: '有效性',
      render: (_: unknown, row: DataSandboxRecord) => accessOf(row),
    },
    {
      title: '操作',
      render: (_: unknown, row: DataSandboxRecord) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(row)}>
            详情
          </Button>
          {row.report ? null : row.ordinary ? (
            <>
              <Button
                type="link"
                onClick={() => {
                  setControl(row);
                  controlForm.setFieldsValue({
                    viewUntil: row.view_until
                      ? dayjs(formatTime(row.view_until))
                      : undefined,
                    allowExport: !!row.allow_export,
                    exportUntil: row.export_until
                      ? dayjs(formatTime(row.export_until))
                      : undefined,
                  });
                }}
              >
                管理权限
              </Button>
              <Button
                type="link"
                disabled={
                  row.canExport !== true ||
                  !untilOf(row) ||
                  expired(untilOf(row), now) ||
                  expired(viewDeadline(row), now)
                }
                loading={busyId === idOf(row)}
                onClick={() => download(row)}
              >
                下载结果表
              </Button>
            </>
          ) : (
            <>
              <Tooltip title={applyReason(row)}>
                <Button
                  type="link"
                  disabled={!!applyReason(row)}
                  onClick={() => {
                    form.resetFields();
                    setApplication(row);
                  }}
                >
                  申请导出
                </Button>
              </Tooltip>
              {client && row.latestExportId && (
                <Button
                  type="link"
                  onClick={() => openDetail({ exportId: row.latestExportId })}
                >
                  最近申请
                </Button>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];
  const all = [...rows, ...mine, ...pending, ...records];
  const options = (id: string, name: string) =>
    Array.from(
      new Map(
        all
          .filter((row) => row[id])
          .map((row) => [row[id], { value: row[id], label: row[name] || row[id] }]),
      ).values(),
    );
  const table = (items: DataSandboxRecord[], results = false) => (
    <Table
      rowKey={(row) => row.exportId || idOf(row)}
      loading={loading}
      dataSource={filtered(items)}
      tableLayout="fixed"
      columns={(results ? resultColumns : orderColumns).map((column) => ({
        ...column,
        width: column.title === '结果名称' ? 260 : column.title === '操作' ? 230 : 190,
        ellipsis: true,
        onCell: () => ({
          style: { overflowWrap: 'anywhere' as const, whiteSpace: 'normal' as const },
        }),
      }))}
      scroll={{ x: results ? 1820 : 1630 }}
      pagination={{ pageSize: 10 }}
      locale={{ emptyText: <Empty description="暂无符合条件的记录，请调整筛选条件" /> }}
    />
  );
  return (
    <MvpPage
      title="结果导出与审批"
      description="按项目、沙箱和任务定位结果，统一管理导出申请与期限。时间均为北京时间。"
      error={error}
      onRetry={refresh}
      extra={<RefreshButton loading={loading} onClick={refresh} />}
    >
      <Alert
        type="info"
        showIcon
        message={
          client
            ? '密文结果需要全部贡献机构同意；到期后不能继续审批或下载。普通开发结果表沿用原有授权规则。'
            : '中心端查看计算结果；密文结果由贡献机构在客户端申请、审批和下载。'
        }
        style={{ marginBottom: 16 }}
      />
      {ordinaryError && (
        <Alert
          type="warning"
          showIcon
          message="普通结果及报告暂不可读取"
          description={ordinaryError}
          style={{ marginBottom: 16 }}
        />
      )}
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="结果名称、完整标识或任务"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 280 }}
        />
        <Select
          allowClear
          placeholder="项目"
          value={project || undefined}
          onChange={(v) => setProject(v || '')}
          options={options('projectId', 'projectName')}
          style={{ width: 160 }}
        />
        <Select
          allowClear
          placeholder="沙箱"
          value={sandbox || undefined}
          onChange={(v) => setSandbox(v || '')}
          options={options('sandboxId', 'sandboxName')}
          style={{ width: 160 }}
        />
        <Select
          allowClear
          placeholder="结果类型"
          value={kind}
          onChange={setKind}
          options={['DATA', 'MODEL', 'REPORT', 'TABLE'].map((v) => ({
            value: v,
            label: (
              {
                DATA: '数据',
                MODEL: '模型',
                REPORT: '报告',
                TABLE: '开发结果表',
              } as Record<string, string>
            )[v],
          }))}
          style={{ width: 140 }}
        />
        <Select
          allowClear
          placeholder="状态"
          value={status}
          onChange={setStatus}
          options={Object.entries({ ...labels, UNREQUESTED: '未申请' })
            .filter(([v]) => v !== 'PENDING')
            .map(([value, label]) => ({ value, label }))}
          style={{ width: 140 }}
        />
        <DatePicker.RangePicker value={dateRange} onChange={setDateRange} />
        <Button
          onClick={() => {
            setKeyword('');
            setProject('');
            setSandbox('');
            setKind(undefined);
            setStatus(undefined);
            setDateRange(null);
          }}
        >
          重置筛选
        </Button>
      </Space>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'results',
            label: `结果列表 (${rows.length})`,
            children: table(rows, true),
          },
          ...(client
            ? [
                {
                  key: 'mine',
                  label: `我的申请 (${mine.length})`,
                  children: table(mine),
                },
                {
                  key: 'pending',
                  label: `待我审批 (${pending.length})`,
                  children: table(pending),
                },
                {
                  key: 'history',
                  label: `审批记录 (${records.length})`,
                  children: table(records),
                },
              ]
            : []),
        ]}
      />
      <Drawer
        title={detail?.exportId ? `导出工单：${detail.exportId}` : '结果详情'}
        width={780}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        extra={
          client && detail?.canVote ? (
            <Space>
              <Button
                danger
                disabled={orderExpired(detail) || !untilOf(detail)}
                onClick={() => setRejectOpen(true)}
              >
                拒绝
              </Button>
              <Button
                type="primary"
                loading={busyId === detail.exportId}
                disabled={orderExpired(detail) || !untilOf(detail)}
                onClick={() => act('APPROVE')}
              >
                同意
              </Button>
            </Space>
          ) : null
        }
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions
              bordered
              size="small"
              column={1}
              contentStyle={{ overflowWrap: 'anywhere' }}
            >
              {[
                ['结果名称', nameOf(detail)],
                ['结果标识', idOf(detail)],
                ['项目', detail.projectName || detail.projectId],
                ['沙箱', detail.sandboxName || detail.sandboxId],
                ['来源任务', detail.taskName || detail.task_name],
                ['运行标识', detail.runId || detail.run_id || detail.task_id],
                ['生成时间', formatTime(detail.createdAt || detail.created_at)],
                ['查看截止时间', deadlineText(viewDeadline(detail))],
                [
                  '使用截止时间',
                  deadlineText(
                    detail.useUntil ||
                      detail.use_until ||
                      (detail.ordinary
                        ? detail.viewUntil || detail.view_until
                        : undefined),
                  ),
                ],
                [
                  '申请导出截止时间',
                  deadlineText(detail.exportUntil || detail.export_until),
                ],
                ['当前有效导出截止时间', deadlineText(untilOf(detail))],
                ['最晚导出时间', deadlineText(detail.maxExportUntil)],
                ['申请用途', detail.purpose],
                ['申请机构', detail.requesterOwnerId || detail.requester],
                ['有效性', accessOf(detail)],
                ['申请时间', formatTime(detail.requestedAt)],
                ['密文对象', detail.objectId],
                [
                  '结果密钥',
                  detail.keyId ? `${detail.keyId} · v${detail.keyVersion}` : '-',
                ],
                ['结果摘要', detail.ciphertextSha256],
              ].map(([label, value]) => (
                <Descriptions.Item key={label} label={label}>
                  {value || '-'}
                </Descriptions.Item>
              ))}
            </Descriptions>
            {detail.exportId && (
              <Tag color={colors[stateOf(detail)]}>
                {labels[stateOf(detail)] || stateOf(detail)}
              </Tag>
            )}
            {detail.votes && (
              <Table
                size="small"
                rowKey="ownerId"
                pagination={false}
                tableLayout="fixed"
                scroll={{ x: 880 }}
                dataSource={detail.votes}
                columns={[
                  { title: '贡献机构', dataIndex: 'ownerId' },
                  {
                    title: '审批意见',
                    dataIndex: 'status',
                    render: (v: string) => labels[v] || v,
                  },
                  { title: '审批人', dataIndex: 'voter' },
                  { title: '说明', dataIndex: 'comment' },
                  { title: '审批时间', dataIndex: 'votedAt', render: formatTime },
                ].map((column) => ({
                  ...column,
                  width: column.title === '审批时间' ? 200 : 170,
                  ellipsis: true,
                }))}
              />
            )}
            {!detail.exportId && !detail.ordinary && !detail.report && client && (
              <>
                <Text strong>历次申请</Text>
                {table(mine.filter((row) => row.resultId === detail.resultId))}
              </>
            )}
          </Space>
        )}
      </Drawer>
      <Modal
        title={`申请导出：${application ? nameOf(application) : ''}`}
        open={!!application}
        onCancel={() => setApplication(undefined)}
        onOk={submit}
        okText="提交申请"
        cancelText="取消"
        confirmLoading={!!busyId}
        okButtonProps={{ disabled: !!application && !!applyReason(application) }}
      >
        <Form form={form} layout="vertical">
          <Alert
            showIcon
            type="info"
            message={`最晚可导出至 ${deadlineText(
              application?.maxExportUntil,
            )}；接收机构为当前机构。`}
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            name="purpose"
            label="申请用途"
            rules={[{ required: true, whitespace: true, message: '请填写申请用途' }]}
          >
            <Input.TextArea maxLength={1000} showCount rows={3} />
          </Form.Item>
          <Form.Item
            name="exportUntil"
            label="导出截止时间（北京时间）"
            rules={[
              { required: true, message: '请设置导出截止时间' },
              {
                validator: (_, value) =>
                  !value ||
                  (pickerTime(value) > now &&
                    pickerTime(value) <= accessTime(application?.maxExportUntil))
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error('截止时间必须晚于当前时间，且不超过授权上限'),
                      ),
              },
            ]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="拒绝导出"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={() => act('REJECT')}
        okText="确认拒绝"
        cancelText="取消"
        confirmLoading={!!busyId}
        okButtonProps={{
          danger: true,
          disabled: !rejectComment.trim() || !detail || orderExpired(detail),
        }}
      >
        <Input.TextArea
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="请输入拒绝意见"
        />
      </Modal>
      <Modal
        title={`普通结果权限：${control ? nameOf(control) : ''}`}
        open={!!control}
        onCancel={() => setControl(undefined)}
        onOk={() => controlForm.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={controlForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!control) return;
            try {
              await DataComputeApi.saveResultControl({
                sandboxId,
                tableName: control.table_name,
                taskId: control.task_id,
                viewUntil: toBeijingIso(values.viewUntil),
                allowExport: values.allowExport,
                exportUntil: values.allowExport ? toBeijingIso(values.exportUntil) : '',
                version: control.version || 0,
              });
              setControl(undefined);
              await refresh();
              message.success('结果权限已更新');
            } catch (e: unknown) {
              message.error(requestErrorMessage(e, '保存失败'));
            }
          }}
        >
          <Form.Item
            name="viewUntil"
            label="查看截止时间（北京时间）"
            rules={[{ required: true, message: '请设置查看截止时间' }]}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
          </Form.Item>
          <Form.Item
            name="allowExport"
            label="允许导出开发结果"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {allowExport && (
            <Form.Item
              name="exportUntil"
              label="导出截止时间（北京时间）"
              dependencies={['viewUntil']}
              rules={[
                { required: true, message: '请设置导出截止时间' },
                ({ getFieldValue }) => ({
                  validator: (_, value) =>
                    !value ||
                    (pickerTime(value) > now &&
                      !value.isAfter(getFieldValue('viewUntil')))
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error('导出截止时间必须晚于当前时间且不超过查看截止时间'),
                        ),
                }),
              ]}
            >
              <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </MvpPage>
  );
};
