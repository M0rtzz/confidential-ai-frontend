import {
  Alert,
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import { parse } from 'query-string';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'umi';

import { formatTime, MvpPage, RefreshButton } from '@/modules/data-sandbox-mvp/common';
import { requestErrorMessage } from '@/modules/tee-export-approval/error';
import {
  DataComputeApi,
  DataDevApi,
  TeeExportApi,
  responseData,
} from '@/services/data-sandbox';
import type { DataSandboxRecord } from '@/services/data-sandbox';

const artifactTypeLabels: Record<string, string> = {
  JAR: 'JAR 制品',
  SQL: 'SQL 脚本',
  PYTHON: 'Python 函数',
  FUNCTION: '函数(UDF)',
};

const artifactTypeColors: Record<string, string> = {
  JAR: 'geekblue',
  SQL: 'blue',
  PYTHON: 'purple',
  FUNCTION: 'magenta',
};

const execTypeLabels: Record<string, string> = {
  JAR: 'JAR',
  SQL: 'SQL',
  PYTHON: 'Python',
  FUNCTION: '函数',
};

const runModeLabels: Record<string, string> = {
  DEV: '开发调试',
  PROD: '正式运行',
};

const statusLabels: Record<string, string> = {
  PENDING: '待执行',
  RUNNING: '执行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
};

const statusColors: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  FAILED: 'error',
  CANCELLED: 'default',
};

const CANCELLABLE = ['PENDING', 'RUNNING'];

/** File → base64（JAR 内联上传）。 */
const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String((reader.result as string).split(',')[1] || ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

/** 渲染 header[] + rows[][] 预览表。 */
const renderPreviewTable = (preview: DataSandboxRecord, showRowCount = true) => {
  const header = (preview.header || []) as string[];
  const rows = (preview.rows || []) as string[][];
  if (!header.length) return null;
  return (
    <div style={{ margin: '8px 0' }}>
      <Space wrap size={4} style={{ marginBottom: 8 }}>
        {showRowCount && <Tag>行数 {preview.sourceRows ?? rows.length}</Tag>}
        <Tag>表头 {header.join(', ')}</Tag>
      </Space>
      <Table
        size="small"
        rowKey={(_, i) => String(i)}
        pagination={false}
        scroll={{ x: 'max-content', y: 360 }}
        dataSource={rows.map((r, i) =>
          Object.fromEntries(header.map((h, j) => [h, r[j]])),
        )}
        columns={header.map((h) => ({
          title: h,
          dataIndex: h,
          ellipsis: true,
          width: 120,
        }))}
      />
    </div>
  );
};

/** P6 已验签结果的 P7 展示：密文只展示元数据，REPORT 直接展示明文内容。 */
const TeeResultCards = ({ summaryValue }: { summaryValue?: unknown }) => {
  let summary: DataSandboxRecord = {};
  let parseError = false;
  try {
    summary =
      typeof summaryValue === 'string'
        ? JSON.parse(summaryValue || '{}')
        : (summaryValue as DataSandboxRecord) || {};
  } catch {
    parseError = true;
  }
  const isTeeResult = summary.runtimeMode === 'SIMULATION';
  const encrypted = Array.isArray(summary.encryptedOutputs)
    ? summary.encryptedOutputs
    : [];
  const reports = Array.isArray(summary.reports) ? summary.reports : [];
  const submitExport = async (resultId: string) => {
    try {
      await TeeExportApi.create(resultId);
      message.success('导出申请已提交，请到「结果导出审批」查看票面与下载');
    } catch (error: unknown) {
      message.error(requestErrorMessage(error, '提交导出申请失败'));
    }
  };
  const requestExport = (resultId: string) => {
    Modal.confirm({
      title: '申请导出密文结果',
      content: '接收方为当前机构，系统将使用本机构受管证书密封结果密钥。确认提交？',
      okText: '提交申请',
      cancelText: '取消',
      onOk: () => submitExport(resultId),
    });
  };
  if (parseError) {
    return <Alert showIcon type="error" message="TEE 结果摘要无法解析" />;
  }
  if (!isTeeResult) return null;
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {encrypted.map((item: DataSandboxRecord) => {
        const status = item.exportState || 'PENDING_APPROVAL';
        const statusView: Record<string, [string, string]> = {
          APPROVED: ['success', '已批准'],
          REJECTED: ['error', '已拒绝'],
          CANCELLED: ['default', '已撤回'],
          PENDING_APPROVAL: ['processing', '待审批'],
        };
        const [color, label] = statusView[status] || statusView.PENDING_APPROVAL;
        return (
          <Card
            key={item.resultId || item.objectId}
            size="small"
            title={`${item.kind || 'DATA'} 密文结果`}
            extra={<Tag color={color}>{label}</Tag>}
          >
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="结果标识">
                {item.resultId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="密文对象">
                {item.objectId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="结果密钥">
                {item.keyId || '-'} · v{item.keyVersion || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="结果摘要">
                {String(item.ciphertextSha256 || '-').slice(0, 8)}…
              </Descriptions.Item>
              <Descriptions.Item label="贡献机构">
                {(item.contributors || []).join('、') || '-'}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              showIcon
              type="info"
              message="TEE 结果为密文对象，导出审批完成前不提供明文预览。"
              style={{ margin: '12px 0' }}
            />
            <Button type="primary" onClick={() => requestExport(item.resultId)}>
              申请导出
            </Button>
          </Card>
        );
      })}
      {reports.map((report: DataSandboxRecord, index: number) => (
        <Card
          key={`${report.reportKind || 'REPORT'}-${index}`}
          size="small"
          title={`${report.reportKind || 'REPORT'} 明文报告`}
          extra={<Tag color="success">按授权规则明文出域</Tag>}
        >
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(report.content || {}, null, 2)}
          </pre>
        </Card>
      ))}
    </Space>
  );
};

export const DataDevComponent = () => {
  const computeQuery = parse(useLocation().search);
  const sandboxId = String(computeQuery.sandboxId || '');
  /* 沙箱权威库表（sandboxDbDirectory → 提交任务源表下拉） */
  const [sandboxTables, setSandboxTables] = useState<DataSandboxRecord[]>([]);
  /* --------------------------------- 制品 --------------------------------- */
  const [artifacts, setArtifacts] = useState<DataSandboxRecord[]>([]);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactType, setArtifactType] = useState('');
  const [artifactKeyword, setArtifactKeyword] = useState('');
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [artifactItem, setArtifactItem] = useState<DataSandboxRecord>();
  const [artifactForm] = Form.useForm();
  /* 版本列表 */
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsItem, setVersionsItem] = useState<DataSandboxRecord>();
  const [versions, setVersions] = useState<DataSandboxRecord[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  /* --------------------------------- 任务 --------------------------------- */
  const [tasks, setTasks] = useState<DataSandboxRecord[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');
  const [taskRunMode, setTaskRunMode] = useState('');
  const [taskExecType, setTaskExecType] = useState('');
  const [taskKeyword, setTaskKeyword] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm] = Form.useForm();
  const taskExec = Form.useWatch('execType', taskForm);
  const taskArtifactName = Form.useWatch('artifactName', taskForm);
  const allowResultExport = Form.useWatch('allowExport', taskForm);
  const [preview, setPreview] = useState<DataSandboxRecord>();
  const [allArtifacts, setAllArtifacts] = useState<DataSandboxRecord[]>([]);
  const [jarFile, setJarFile] = useState<File>();

  /* ------------------------------- 详情 / 日志 / 结果 ------------------------------- */
  const [detailItem, setDetailItem] = useState<DataSandboxRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [logItem, setLogItem] = useState<DataSandboxRecord>();
  const [logOpen, setLogOpen] = useState(false);
  const [logDetail, setLogDetail] = useState<DataSandboxRecord>();
  const [logAttempt, setLogAttempt] = useState<number | undefined>(undefined);
  const [logLoading, setLogLoading] = useState(false);
  const [resultItem, setResultItem] = useState<DataSandboxRecord>();
  const [resultOpen, setResultOpen] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultControls, setResultControls] = useState<DataSandboxRecord[]>([]);
  const [controlLoading, setControlLoading] = useState(false);
  const [controlItem, setControlItem] = useState<DataSandboxRecord>();
  const [controlForm] = Form.useForm();
  const controlAllowExport = Form.useWatch('allowExport', controlForm);

  /* ------------------------------- 数据加载 ------------------------------- */

  const refreshArtifacts = useCallback(async () => {
    setArtifactLoading(true);
    try {
      setArtifacts(
        responseData(
          await DataDevApi.artifacts({ type: artifactType, keyword: artifactKeyword }),
          [],
        ),
      );
    } catch (error: any) {
      message.error(error.message || '加载制品失败');
    } finally {
      setArtifactLoading(false);
    }
  }, [artifactType, artifactKeyword]);

  const refreshTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      setTasks(
        responseData(
          await DataDevApi.tasks({
            status: taskStatus,
            runMode: taskRunMode,
            execType: taskExecType,
            keyword: taskKeyword,
          }),
          [],
        ),
      );
    } catch (error: any) {
      message.error(error.message || '加载任务失败');
    } finally {
      setTaskLoading(false);
    }
  }, [taskStatus, taskRunMode, taskExecType, taskKeyword]);

  const refreshResultControls = useCallback(async () => {
    if (!sandboxId) return;
    setControlLoading(true);
    try {
      setResultControls(
        responseData(await DataComputeApi.resultControls(sandboxId), []),
      );
    } catch (error: any) {
      message.error(error.message || '加载产出权限失败');
    } finally {
      setControlLoading(false);
    }
  }, [sandboxId]);

  useEffect(() => {
    refreshArtifacts();
  }, [refreshArtifacts]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    refreshResultControls();
  }, [refreshResultControls]);

  useEffect(() => {
    if (taskOpen) {
      DataDevApi.artifacts().then((res) => setAllArtifacts(responseData(res, [])));
      if (sandboxId) {
        DataComputeApi.sandboxDbDirectory(sandboxId)
          .then((res) => setSandboxTables(responseData(res, {}).items || []))
          .catch((error: any) => message.error(error.message || '加载沙箱表失败'));
      }
    }
  }, [taskOpen]);

  useEffect(() => {
    if (versionsOpen && versionsItem) {
      setVersionsLoading(true);
      DataDevApi.versions(versionsItem.id)
        .then((res) => setVersions(responseData(res, [])))
        .finally(() => setVersionsLoading(false));
    }
  }, [versionsOpen, versionsItem]);

  /* ------------------------------- 制品操作 ------------------------------- */

  const openArtifactEdit = (row: DataSandboxRecord) => {
    setArtifactItem(row);
    artifactForm.setFieldsValue({
      name: row.name,
      type: row.type,
      description: row.description || '',
    });
    setArtifactOpen(true);
  };

  const saveArtifact = async (values: DataSandboxRecord) => {
    try {
      if (artifactItem?.id) {
        responseData(
          await DataDevApi.updateArtifact({ id: artifactItem.id, ...values }),
          {},
        );
        message.success('制品已更新');
      } else {
        responseData(await DataDevApi.createArtifact(values), {});
        message.success('制品已创建');
      }
      setArtifactOpen(false);
      artifactForm.resetFields();
      refreshArtifacts();
    } catch (error: any) {
      message.error(error.message || '保存制品失败');
    }
  };

  const deleteArtifact = async (row: DataSandboxRecord) => {
    try {
      responseData(await DataDevApi.deleteArtifact(row.id), {});
      message.success('制品已删除');
      refreshArtifacts();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  /** 查看最新版本程序信息（JAR：大小/SHA256+下载；脚本：只读代码）。 */
  const viewArtifact = async (row: DataSandboxRecord) => {
    try {
      const list = responseData(await DataDevApi.versions(row.id), []);
      const latest = [...list].sort((a, b) => Number(b.version) - Number(a.version))[0];
      if (!latest) {
        message.info('该制品暂无版本');
        return;
      }
      if (row.type === 'JAR') {
        Modal.info({
          title: `制品 ${row.name} v${latest.version}`,
          width: 640,
          okText: '确认',
          content: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                大小：{((latest.size || 0) / 1024).toFixed(1)} KB · SHA256：
                <span style={{ fontFamily: 'monospace' }}>{latest.sha256 || '-'}</span>
              </div>
              <div>
                <Button type="primary" onClick={() => downloadJar(latest.id)}>
                  下载 JAR
                </Button>
              </div>
            </Space>
          ),
        });
      } else {
        Modal.info({
          title: `制品 ${row.name} v${latest.version}`,
          width: 720,
          okText: '确认',
          content: (
            <pre
              style={{
                maxHeight: 420,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {latest.content_text || '(空)'}
            </pre>
          ),
        });
      }
    } catch (error: any) {
      message.error(error.message || '查看失败');
    }
  };

  const openVersions = (row: DataSandboxRecord) => {
    setVersionsItem(row);
    setVersionsOpen(true);
  };

  const downloadJar = async (versionId: string) => {
    try {
      const blob = await DataDevApi.downloadJar(versionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${versionId}.jar`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      message.error(error.message || '下载失败');
    }
  };

  const deleteVersion = async (versionId: string) => {
    try {
      responseData(await DataDevApi.deleteVersion(versionId), {});
      message.success('版本已删除');
      if (versionsItem) {
        const res = await DataDevApi.versions(versionsItem.id);
        setVersions(responseData(res, []));
      }
      refreshArtifacts();
    } catch (error: any) {
      message.error(error.message || '删除版本失败');
    }
  };

  /* ------------------------------- 任务操作 ------------------------------- */

  const openTaskSubmit = () => {
    taskForm.resetFields();
    setPreview(undefined);
    setJarFile(undefined);
    taskForm.setFieldsValue({ runMode: 'DEV', execType: 'SQL', allowExport: false });
    setTaskOpen(true);
  };

  /** 沙箱表预览：data-dev 沙箱表源（schema → header，rows 数组保持不变）。 */
  const previewSandboxTable = async () => {
    const { sourceTable, limit } = taskForm.getFieldsValue();
    if (!sandboxId || !sourceTable) {
      message.warning('请先选择沙箱表');
      return;
    }
    try {
      const raw = responseData(
        await DataDevApi.sandboxPreview(sandboxId, sourceTable, limit || 10),
        {},
      );
      const schema: DataSandboxRecord[] = Array.isArray(raw.schema) ? raw.schema : [];
      setPreview({
        header: schema.map((c) => String(c.name)),
        rows: raw.rows || [],
        sourceRows: raw.totalRows,
      });
    } catch (error: any) {
      message.error(error.message || '预览失败');
    }
  };

  /** 自适应模板默认值：选中沙箱表后按 execType 预填脚本骨架（仅当文本框为空）。 */
  const onSourceTableChange = (sourceTable: string) => {
    const exec = taskForm.getFieldValue('execType');
    if (exec === 'SQL' && !taskForm.getFieldValue('sql')) {
      taskForm.setFieldsValue({ sql: `SELECT * FROM ${sourceTable} LIMIT 10;` });
    } else if (exec === 'PYTHON' && !taskForm.getFieldValue('script')) {
      taskForm.setFieldsValue({
        script:
          'import argparse, csv\n' +
          '\n' +
          'ap = argparse.ArgumentParser()\n' +
          "ap.add_argument('--input', required=True, help='input CSV path')\n" +
          "ap.add_argument('--output', required=True, help='output CSV path')\n" +
          "ap.add_argument('--params', default='{}')\n" +
          'args = ap.parse_args()\n' +
          '\n' +
          "with open(args.input, 'r', encoding='utf-8') as f:\n" +
          '    rows = list(csv.DictReader(f))\n' +
          '\n' +
          '# TODO: 基于 rows 实现你的计算逻辑\n' +
          "print('输入行数:', len(rows))\n" +
          '\n' +
          "with open(args.output, 'w', newline='', encoding='utf-8') as f:\n" +
          '    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [])\n' +
          '    w.writeheader()\n' +
          '    w.writerows(rows)\n',
      });
    } else if (exec === 'FUNCTION' && !taskForm.getFieldValue('sql')) {
      taskForm.setFieldsValue({
        functionName: 'risk_score',
        functionNargs: 2,
        functionSource:
          'def risk_score(balance, trans_amount):\n' +
          '    """资金风险评分：余额越低、单笔交易越大 → 风险越高（3=高/2=中/1=低）"""\n' +
          '    score = 1\n' +
          '    if balance < 20000:\n' +
          '        score += 1\n' +
          '    if trans_amount > 3000:\n' +
          '        score += 1\n' +
          '    if trans_amount > 5000 or balance < 8000:\n' +
          '        score += 1\n' +
          '    return min(score, 3)\n',
        sql:
          'SELECT account_no, branch, category, card_type, balance, trans_amount,\n' +
          '       risk_score(balance, trans_amount) AS risk_level,\n' +
          "       CASE WHEN trans_amount > 3000 THEN 'Y' ELSE 'N' END AS big_txn\n" +
          `FROM ${sourceTable}\n` +
          'ORDER BY risk_level DESC, trans_amount DESC;\n',
      });
    }
  };

  const submitTask = async (values: DataSandboxRecord) => {
    try {
      if (sandboxId) {
        const source = sandboxTables.find(
          (item) => item.tableName === values.sourceTable,
        );
        if (source?.canUse === false) {
          message.error(source.disabledReason || '该挂载数据当前不可使用');
          return;
        }
      }
      const { artifactName, version, ...rest } = values;
      rest.viewUntil = values.viewUntil?.toISOString?.() || '';
      rest.exportUntil = values.allowExport
        ? values.exportUntil?.toISOString?.() || ''
        : '';
      // 表单 params 为 JSON 字符串，后端要求对象
      if (typeof rest.params === 'string' && rest.params.trim()) {
        try {
          rest.params = JSON.parse(rest.params);
        } catch {
          message.warning('运行参数不是合法 JSON，已忽略');
          rest.params = {};
        }
      }
      let payload: DataSandboxRecord = rest;
      const execType = String(rest.execType);
      // JAR 内联上传：先读 base64（若同时填制品名则改为按制品版本引用提交）
      let jarB64 = '';
      if (execType === 'JAR') {
        if (!jarFile) {
          message.warning('请上传 .jar 文件');
          return;
        }
        jarB64 = await fileToBase64(jarFile);
      }
      // 制品名称（可选）：已有制品 → 发布新版本（版本号用户手填/自动）；新名称 → 新建制品+首版；留空 → 不落制品
      if (artifactName) {
        const isFunction = execType === 'FUNCTION';
        const contentText = isFunction ? rest.functionSource : rest.sql || rest.script;
        const existing = allArtifacts.find(
          (a) => a.name === artifactName && a.type === execType,
        );
        let artifactId: string;
        if (existing) {
          artifactId = existing.id;
        } else {
          const created = responseData(
            await DataDevApi.createArtifact({ name: artifactName, type: execType }),
            {},
          );
          artifactId = created.id;
        }
        if (execType === 'JAR') {
          // 发布 JAR 新版本（version 手填可选；后端查重/自增）
          const createdVersion = responseData(
            await DataDevApi.uploadJarVersion(artifactId, jarFile as File, {
              paramsSchema: values.paramsSchema || '[]',
              defaultParams: values.defaultParams || '{}',
              description: values.description || '',
              version: version || undefined,
            }),
            {},
          );
          payload = { ...payload, artifactId, version: createdVersion.version };
        } else {
          const createdVersion = responseData(
            await DataDevApi.createVersion({
              artifactId,
              version: version || undefined,
              contentText,
              paramsSchema: values.paramsSchema || '[]',
              defaultParams: values.defaultParams || '{}',
              ...(isFunction
                ? {
                    functionName: rest.functionName,
                    functionNargs: rest.functionNargs,
                    sqlTemplate: rest.sql,
                  }
                : {}),
            }),
            {},
          );
          payload = { ...payload, artifactId, version: createdVersion.version };
          delete payload.sql;
          delete payload.script;
          if (isFunction) {
            delete payload.functionSource;
            delete payload.functionName;
            delete payload.functionNargs;
          }
        }
      } else if (execType === 'JAR') {
        // 内联 JAR 提交（不落制品）
        payload.jar = jarB64;
      }
      if (sandboxId) {
        // 沙箱表源：走沙箱 SQLite 计算契约（源表/输出表/JDBC 注入）
        responseData(await DataDevApi.submitSandboxTask({ ...payload, sandboxId }), {});
      } else {
        responseData(await DataDevApi.submitTask(payload), {});
      }
      message.success('任务已提交');
      setTaskOpen(false);
      taskForm.resetFields();
      setPreview(undefined);
      setJarFile(undefined);
      refreshTasks();
      refreshArtifacts();
    } catch (error: any) {
      message.error(error.message || '提交失败');
    }
  };

  const directTask = async (row: DataSandboxRecord, action: 'cancel' | 'retry') => {
    try {
      if (action === 'cancel') {
        responseData(await DataDevApi.cancelTask(row.id), {});
        message.success('任务已取消');
      } else {
        responseData(await DataDevApi.retryTask(row.id), {});
        message.success('已重新执行');
      }
      refreshTasks();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const openDetail = async (row: DataSandboxRecord) => {
    setDetailItem(responseData(await DataDevApi.taskDetail(row.id), {}));
    setDetailOpen(true);
  };

  /** DEV 调试运行：打开日志 Drawer（runLog 全文 + 结果预览）。 */
  const openLog = async (row: DataSandboxRecord) => {
    setLogItem(row);
    setLogAttempt(undefined);
    setLogDetail(undefined);
    setLogOpen(true);
    await loadLog(row.id, undefined);
  };

  const loadLog = async (taskId: string, attempt?: number) => {
    setLogLoading(true);
    try {
      setLogDetail(responseData(await DataDevApi.runLog(taskId, attempt), {}));
      setLogAttempt(attempt);
    } catch (error: any) {
      message.error(error.message || '加载日志失败');
    } finally {
      setLogLoading(false);
    }
  };

  /** PROD 结果：打开结果 Drawer（viewResult 预览表 + 挂载项目）。 */
  const openResult = async (row: DataSandboxRecord) => {
    setResultLoading(true);
    setResultOpen(true);
    try {
      const resp = responseData(await DataDevApi.viewResult(row.id), { id: row.id });
      setResultItem({ ...resp, id: row.id });
    } catch (error: any) {
      message.error(error.message || '加载结果失败');
      setResultItem(undefined);
    } finally {
      setResultLoading(false);
    }
  };

  /* ------------------------------- 渲染 ------------------------------- */

  return (
    <MvpPage
      title="数据开发"
      extra={
        <RefreshButton
          loading={artifactLoading || taskLoading || controlLoading}
          onClick={() => {
            refreshArtifacts();
            refreshTasks();
            refreshResultControls();
          }}
        />
      }
    >
      <Tabs
        items={[
          {
            key: 'artifacts',
            label: '制品管理',
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Select
                    value={artifactType}
                    onChange={setArtifactType}
                    style={{ width: 150 }}
                    options={[
                      { value: '', label: '全部类型' },
                      ...Object.entries(artifactTypeLabels).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ]}
                  />
                  <Input.Search
                    placeholder="制品名称"
                    allowClear
                    onSearch={setArtifactKeyword}
                    style={{ width: 240 }}
                  />
                </Space>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="制品不手工创建：所有新制品/新版本均在「提交任务」时填写制品名称自动创建（已有制品选名发布新版本，新名称新建首版）。"
                />
                <Table
                  rowKey="id"
                  loading={artifactLoading}
                  dataSource={artifacts}
                  scroll={{ x: 1100 }}
                  columns={[
                    {
                      title: '制品',
                      dataIndex: 'name',
                      render: (v: string, row: DataSandboxRecord) => (
                        <Space direction="vertical" size={0}>
                          <strong>{v}</strong>
                          <span style={{ color: '#888' }}>{row.id}</span>
                        </Space>
                      ),
                    },
                    {
                      title: '类型',
                      dataIndex: 'type',
                      render: (v: string) => (
                        <Tag color={artifactTypeColors[v]}>
                          {artifactTypeLabels[v] || v}
                        </Tag>
                      ),
                    },
                    { title: '最新版本', dataIndex: 'latest_version' },
                    { title: '创建人', dataIndex: 'created_by' },
                    { title: '更新时间', dataIndex: 'updated_at', render: formatTime },
                    {
                      title: '操作',
                      width: 300,
                      render: (_: unknown, row: DataSandboxRecord) => (
                        <Space wrap>
                          <Button type="link" onClick={() => viewArtifact(row)}>
                            查看
                          </Button>
                          <Button type="link" onClick={() => openVersions(row)}>
                            版本列表
                          </Button>
                          <Button type="link" onClick={() => openArtifactEdit(row)}>
                            编辑
                          </Button>
                          <Button
                            type="link"
                            danger
                            onClick={() => deleteArtifact(row)}
                          >
                            删除
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'tasks',
            label: '任务管理',
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Select
                    value={taskStatus}
                    onChange={setTaskStatus}
                    style={{ width: 130 }}
                    options={[
                      { value: '', label: '全部状态' },
                      { value: 'SUCCEEDED', label: '成功' },
                      { value: 'FAILED', label: '失败' },
                    ]}
                  />
                  <Select
                    value={taskRunMode}
                    onChange={setTaskRunMode}
                    style={{ width: 150 }}
                    options={[
                      { value: '', label: '全部模式' },
                      ...Object.entries(runModeLabels).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ]}
                  />
                  <Select
                    value={taskExecType}
                    onChange={setTaskExecType}
                    style={{ width: 130 }}
                    options={[
                      { value: '', label: '全部类型' },
                      ...Object.entries(execTypeLabels).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ]}
                  />
                  <Input.Search
                    placeholder="任务 ID 或名称"
                    allowClear
                    onSearch={setTaskKeyword}
                    style={{ width: 240 }}
                  />
                  <Button type="primary" onClick={openTaskSubmit}>
                    提交任务
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  loading={taskLoading}
                  dataSource={tasks}
                  scroll={{ x: 1300 }}
                  columns={[
                    {
                      title: '任务名称',
                      dataIndex: 'name',
                      render: (value: string) => value || '-',
                    },
                    {
                      title: '类型',
                      dataIndex: 'exec_type',
                      render: (value: string) => (
                        <Tag color={artifactTypeColors[value]}>
                          {execTypeLabels[value] || value}
                        </Tag>
                      ),
                    },
                    {
                      title: '模式',
                      dataIndex: 'run_mode',
                      render: (value: string) => (
                        <Tag color={value === 'PROD' ? 'orange' : 'cyan'}>
                          {runModeLabels[value] || value}
                        </Tag>
                      ),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (v: string, row: DataSandboxRecord) => (
                        <Tooltip title={row.error_message || ''}>
                          <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>
                        </Tooltip>
                      ),
                    },
                    { title: '提交人', dataIndex: 'created_by' },
                    { title: '提交时间', dataIndex: 'created_at', render: formatTime },
                    {
                      title: '操作',
                      width: 260,
                      render: (_: unknown, row: DataSandboxRecord) => (
                        <Space wrap>
                          {CANCELLABLE.includes(row.status) && (
                            <Button
                              type="link"
                              onClick={() => directTask(row, 'cancel')}
                            >
                              取消
                            </Button>
                          )}
                          {row.status === 'FAILED' && (
                            <Button
                              type="link"
                              onClick={() => directTask(row, 'retry')}
                            >
                              重试
                            </Button>
                          )}
                          {row.status === 'SUCCEEDED' && row.run_mode === 'DEV' && (
                            <Button type="link" onClick={() => openLog(row)}>
                              调试日志
                            </Button>
                          )}
                          {row.status === 'SUCCEEDED' && (
                            <Button type="link" onClick={() => openResult(row)}>
                              结果
                            </Button>
                          )}
                          <Button type="link" onClick={() => openDetail(row)}>
                            详情
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          ...(sandboxId
            ? [
                {
                  key: 'result-controls',
                  label: '产出与权限',
                  children: (
                    <Table
                      rowKey="table_name"
                      loading={controlLoading}
                      dataSource={resultControls}
                      columns={[
                        { title: '开发结果', dataIndex: 'name' },
                        {
                          title: '任务名称',
                          dataIndex: 'task_name',
                          render: (value: string) => value || '-',
                        },
                        { title: '行数', dataIndex: 'row_count' },
                        {
                          title: '查看截止时间',
                          dataIndex: 'view_until',
                          render: (value: string) => formatTime(value),
                        },
                        {
                          title: '是否允许导出',
                          dataIndex: 'allow_export',
                          render: (value: boolean) => (
                            <Tag color={value ? 'success' : 'default'}>
                              {value ? '是' : '否'}
                            </Tag>
                          ),
                        },
                        {
                          title: '操作',
                          render: (_: unknown, row: DataSandboxRecord) => (
                            <Button
                              type="link"
                              onClick={() => {
                                setControlItem(row);
                                controlForm.setFieldsValue({
                                  viewUntil: row.view_until
                                    ? dayjs(row.view_until)
                                    : undefined,
                                  allowExport: !!row.allow_export,
                                  exportUntil: row.export_until
                                    ? dayjs(row.export_until)
                                    : undefined,
                                });
                              }}
                            >
                              设置权限
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        title={`产出权限：${controlItem?.name || controlItem?.table_name || ''}`}
        open={!!controlItem}
        onCancel={() => setControlItem(undefined)}
        onOk={() => controlForm.submit()}
        okText="保存"
      >
        <Form
          form={controlForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!controlItem) return;
            try {
              responseData(
                await DataComputeApi.saveResultControl({
                  sandboxId,
                  tableName: controlItem.table_name,
                  taskId: controlItem.task_id,
                  viewUntil: values.viewUntil?.toISOString?.() || '',
                  allowExport: values.allowExport,
                  exportUntil: values.allowExport
                    ? values.exportUntil?.toISOString?.() || ''
                    : '',
                  version: controlItem.version || 0,
                }),
                {},
              );
              message.success('产出权限已更新');
              setControlItem(undefined);
              refreshResultControls();
            } catch (error: any) {
              message.error(error.message || '保存失败');
            }
          }}
        >
          <Form.Item
            name="viewUntil"
            label="查看截止时间"
            rules={[{ required: true, message: '请设置查看截止时间' }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm:ss' }}
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name="allowExport"
            label="允许导出开发结果"
            valuePropName="checked"
          >
            <Switch checkedChildren="允许" unCheckedChildren="禁止" />
          </Form.Item>
          {controlAllowExport && (
            <Form.Item
              name="exportUntil"
              label="导出截止时间"
              dependencies={['viewUntil']}
              rules={[
                { required: true, message: '允许导出时必须设置导出截止时间' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const viewUntil = getFieldValue('viewUntil');
                    return !value || !viewUntil || !value.isAfter(viewUntil)
                      ? Promise.resolve()
                      : Promise.reject(new Error('导出截止时间不能晚于查看截止时间'));
                  },
                }),
              ]}
            >
              <DatePicker
                showTime={{ format: 'HH:mm:ss' }}
                format="YYYY-MM-DD HH:mm:ss"
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 制品 编辑元数据 */}
      <Modal
        title={`编辑制品：${artifactItem?.name || ''}`}
        open={artifactOpen}
        onCancel={() => setArtifactOpen(false)}
        onOk={() => artifactForm.submit()}
      >
        <Form form={artifactForm} layout="vertical" onFinish={saveArtifact}>
          <Form.Item name="name" label="制品名称" rules={[{ required: true }]}>
            <Input placeholder="例如：银行对账聚合" />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select
              disabled
              options={Object.entries(artifactTypeLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="仅可编辑名称/描述等元数据，程序内容（代码/JAR）不可修改。"
          />
        </Form>
      </Modal>

      {/* 版本列表 */}
      <Modal
        title={`版本列表：${versionsItem?.name || ''}`}
        open={versionsOpen}
        width={900}
        footer={null}
        onCancel={() => setVersionsOpen(false)}
      >
        <Table
          rowKey="id"
          size="small"
          loading={versionsLoading}
          dataSource={versions}
          pagination={false}
          scroll={{ x: 800, y: 380 }}
          columns={[
            { title: '版本', dataIndex: 'version' },
            ...(versionsItem?.type === 'JAR'
              ? [
                  {
                    title: '大小',
                    dataIndex: 'size',
                    render: (v: number) => `${((v || 0) / 1024).toFixed(1)} KB`,
                  },
                  {
                    title: 'SHA256',
                    dataIndex: 'sha256',
                    render: (v: string) => (
                      <span style={{ fontFamily: 'monospace' }}>
                        {v ? v.slice(0, 16) + '…' : '-'}
                      </span>
                    ),
                  },
                ]
              : [
                  {
                    title: '内容',
                    dataIndex: 'content_text',
                    render: (v: string) => (
                      <Tooltip
                        title={
                          <pre style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>
                            {v}
                          </pre>
                        }
                      >
                        <span style={{ fontFamily: 'monospace', color: '#555' }}>
                          {v ? v.slice(0, 60) + (v.length > 60 ? '…' : '') : '-'}
                        </span>
                      </Tooltip>
                    ),
                  },
                ]),
            { title: '参数 Schema', dataIndex: 'params_schema' },
            { title: '创建人', dataIndex: 'created_by' },
            { title: '创建时间', dataIndex: 'created_at', render: formatTime },
            {
              title: '操作',
              width: 130,
              render: (_: unknown, row: DataSandboxRecord) => (
                <Space wrap>
                  {versionsItem?.type === 'JAR' ? (
                    <Button type="link" onClick={() => downloadJar(row.id)}>
                      下载
                    </Button>
                  ) : (
                    <Button
                      type="link"
                      onClick={() =>
                        Modal.info({
                          title: `版本 ${row.version} 内容`,
                          width: 720,
                          okText: '确认',
                          content: (
                            <pre
                              style={{
                                maxHeight: 420,
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {row.content_text || '(空)'}
                            </pre>
                          ),
                        })
                      }
                    >
                      查看
                    </Button>
                  )}
                  <Button type="link" danger onClick={() => deleteVersion(row.id)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      {/* 任务 提交 */}
      <Modal
        title="提交计算任务"
        open={taskOpen}
        width={820}
        onCancel={() => {
          setTaskOpen(false);
          taskForm.resetFields();
          setPreview(undefined);
        }}
        onOk={() => taskForm.submit()}
      >
        <Form
          form={taskForm}
          layout="vertical"
          initialValues={{ limit: 20 }}
          onFinish={submitTask}
        >
          <Space size="large" wrap style={{ width: '100%' }}>
            <Form.Item name="execType" label="执行类型" rules={[{ required: true }]}>
              <Select
                style={{ width: 150 }}
                options={Object.entries(execTypeLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
            <Form.Item name="runMode" label="运行模式" rules={[{ required: true }]}>
              <Radio.Group
                optionType="button"
                options={Object.entries(runModeLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
            <Form.Item name="name" label="任务名称">
              <Input placeholder="默认：计算任务-<id>" style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Space size="large" wrap style={{ width: '100%' }}>
            <Form.Item name="sourceTable" label="沙箱表" rules={[{ required: true }]}>
              <Select
                style={{ width: 360 }}
                showSearch
                optionFilterProp="label"
                placeholder="选择沙箱 sandbox_data.db 中的表（计算结果不可作源）"
                onChange={onSourceTableChange}
                options={sandboxTables
                  .filter(
                    (item) =>
                      item.kind === 'MOUNT' &&
                      !String(item.tableName || '').startsWith('result_'),
                  )
                  .map((item) => ({
                    value: item.tableName,
                    disabled: item.canUse === false,
                    label: `${item.tableName}（${item.name || item.tableName}${
                      item.source === 'SYNCED' ? '·跨节点' : ''
                    }）${
                      item.canUse === false
                        ? ` · ${item.disabledReason || '不可使用'}`
                        : item.use_until
                        ? ` · 可使用至 ${formatTime(item.use_until)}`
                        : ''
                    }`,
                  }))}
              />
            </Form.Item>
            <Form.Item label="源数据预览">
              <Space>
                <Form.Item name="limit" noStyle>
                  <InputNumber min={1} max={100} style={{ width: 80 }} />
                </Form.Item>
                <Button onClick={previewSandboxTable}>预览前 N 行</Button>
              </Space>
            </Form.Item>
          </Space>
          {preview && renderPreviewTable(preview)}
          {taskExec === 'JAR' ? (
            <>
              <Form.Item label="JAR 文件" required>
                <Upload.Dragger
                  beforeUpload={(file) => {
                    if (!file.name.toLowerCase().endsWith('.jar')) {
                      message.error('仅支持 .jar 文件');
                      return Upload.LIST_IGNORE;
                    }
                    setJarFile(file as unknown as File);
                    return false;
                  }}
                  maxCount={1}
                  accept=".jar"
                >
                  <p>点击或拖拽 .jar 文件到此处（内联上传，≤48MB）</p>
                </Upload.Dragger>
              </Form.Item>
              <Alert
                type="info"
                showIcon
                message="JAR 运行契约：沙箱 DB 快照送 pod，经 --jdbc-url jdbc:sqlite:/workspace/sandbox_data.db 直连真实表名（另注入 --input-table/--output-table 与输入 CSV）；结果 CSV 写入 --output（或 stdout）；长驻服务超时终止判失败。"
              />
            </>
          ) : (
            <>
              {taskExec === 'FUNCTION' && (
                <>
                  <Space size="large" wrap style={{ width: '100%' }}>
                    <Form.Item
                      name="functionName"
                      label="函数名"
                      rules={[
                        { required: true },
                        {
                          pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
                          message: '需为合法 Python 标识符',
                        },
                      ]}
                    >
                      <Input placeholder="例如 risk_score" style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item
                      name="functionNargs"
                      label="参数个数"
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0} max={127} style={{ width: 110 }} />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    name="functionSource"
                    label="函数源码"
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea
                      rows={8}
                      style={{ fontFamily: 'monospace' }}
                      placeholder={
                        'def risk_score(balance, trans_amount):\n' +
                        '    score = 1\n' +
                        '    ...\n' +
                        '    return min(score, 3)'
                      }
                    />
                  </Form.Item>
                </>
              )}
              <Form.Item
                name={
                  taskExec === 'FUNCTION'
                    ? 'sql'
                    : taskExec === 'SQL'
                    ? 'sql'
                    : 'script'
                }
                label={
                  taskExec === 'SQL'
                    ? 'SQL 脚本'
                    : taskExec === 'FUNCTION'
                    ? '调用函数 SQL'
                    : 'Python 函数'
                }
                rules={[{ required: true }]}
              >
                <Input.TextArea
                  rows={taskExec === 'FUNCTION' ? 5 : 8}
                  style={{ fontFamily: 'monospace' }}
                  placeholder={
                    taskExec === 'SQL'
                      ? 'SELECT category, count(*) c FROM src GROUP BY category'
                      : taskExec === 'FUNCTION'
                      ? 'SELECT account_no, risk_score(balance, trans_amount) AS risk_level FROM <table>'
                      : 'import argparse, csv\nap = argparse.ArgumentParser()\n...'
                  }
                />
              </Form.Item>
              {taskExec === 'FUNCTION' && (
                <Alert
                  type="info"
                  showIcon
                  message="函数执行契约：沙箱 DB 快照送 python-runner pod，包装器 create_function 注册 UDF 后执行下方 SQL；结果 CSV 回填。脚本 import 的库若缺失，运行时自动 pip 安装并记录本次导入。"
                />
              )}
            </>
          )}
          <Space size="large" wrap style={{ width: '100%' }}>
            <Form.Item
              name="artifactName"
              label="制品名称（可选）"
              tooltip="留空不保存制品；选择已有制品发布新版本，输入新名称则自动新建制品（查重）"
            >
              <AutoComplete
                allowClear
                style={{ width: 360 }}
                placeholder={
                  taskExec === 'JAR'
                    ? '选择已有 JAR 制品发布新版本，或输入新名称'
                    : '选择已有脚本制品发布新版本，或输入新名称'
                }
                options={allArtifacts
                  .filter((a) => a.type === taskExec)
                  .map((a) => ({ value: a.name, label: a.name }))}
              />
            </Form.Item>
            {allArtifacts.some(
              (a) => a.name === taskArtifactName && a.type === taskExec,
            ) && (
              <Form.Item
                name="version"
                label="版本号（已有制品发布新版本）"
                tooltip="手填版本号，与已有版本重复将报错；留空自动递增"
              >
                <InputNumber
                  min={1}
                  style={{ width: 150 }}
                  placeholder="留空自动 v++"
                />
              </Form.Item>
            )}
          </Space>
          <Space size="large" wrap style={{ width: '100%' }} align="start">
            <Form.Item
              name="params"
              label="运行参数 (JSON)"
              style={{ minWidth: 380, marginBottom: 0 }}
            >
              <Input.TextArea rows={2} placeholder='{"filter":"A"}' />
            </Form.Item>
            <Form.Item
              name="outputTable"
              label="输出表名（可选）"
              tooltip="JAR/Python 结果表名；留空自动 result_<任务id>"
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="例如 result_agg" style={{ width: 220 }} />
            </Form.Item>
          </Space>
          {sandboxId && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 16, marginBottom: 12 }}
                message="产出权限随任务保存；结果生成后可在“产出与权限”中调整。"
              />
              <Space size="large" wrap align="start">
                <Form.Item
                  name="viewUntil"
                  label="查看截止时间"
                  rules={[{ required: true, message: '请设置开发结果查看截止时间' }]}
                >
                  <DatePicker
                    showTime={{ format: 'HH:mm:ss' }}
                    format="YYYY-MM-DD HH:mm:ss"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item
                  name="allowExport"
                  label="允许导出开发结果"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="允许" unCheckedChildren="禁止" />
                </Form.Item>
                {allowResultExport && (
                  <Form.Item
                    name="exportUntil"
                    label="导出截止时间"
                    dependencies={['viewUntil']}
                    rules={[
                      { required: true, message: '允许导出时必须设置导出截止时间' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const viewUntil = getFieldValue('viewUntil');
                          return !value || !viewUntil || !value.isAfter(viewUntil)
                            ? Promise.resolve()
                            : Promise.reject(
                                new Error('导出截止时间不能晚于查看截止时间'),
                              );
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      showTime={{ format: 'HH:mm:ss' }}
                      format="YYYY-MM-DD HH:mm:ss"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                )}
              </Space>
            </>
          )}
        </Form>
      </Modal>

      {/* 任务详情 */}
      <Drawer
        title={`任务详情：${detailItem?.id || ''}`}
        width={680}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detailItem && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Tag color={statusColors[detailItem.status]}>
                {statusLabels[detailItem.status] || detailItem.status}
              </Tag>
              <Tag color={artifactTypeColors[detailItem.exec_type]}>
                {execTypeLabels[detailItem.exec_type] || detailItem.exec_type}
              </Tag>
              <Tag color={detailItem.run_mode === 'PROD' ? 'orange' : 'cyan'}>
                {runModeLabels[detailItem.run_mode] || detailItem.run_mode}
              </Tag>
              {detailItem.result_datatable_id && (
                <Tag color="green">
                  结果：{detailItem.result_node_id}/{detailItem.result_datatable_id}（
                  {detailItem.result_rows} 行）
                </Tag>
              )}
            </Space>
            {detailItem.error_message && (
              <div style={{ color: '#cf1322' }}>错误：{detailItem.error_message}</div>
            )}
            <div>
              源表：{detailItem.source_node_id}/{detailItem.source_datatable_id}（
              {detailItem.source_rows} 行）
            </div>
            <div>
              创建：{detailItem.created_by} · {formatTime(detailItem.created_at)}
            </div>
            {detailItem.finished_at && (
              <div>完成：{formatTime(detailItem.finished_at)}</div>
            )}
            <TeeResultCards summaryValue={detailItem.result_summary} />
            {detailItem.retry_count > 0 && (
              <div>重试次数：{detailItem.retry_count}</div>
            )}
            {detailItem.content_snapshot && (
              <>
                <strong>脚本快照</strong>
                <pre
                  style={{
                    maxHeight: 260,
                    overflow: 'auto',
                    background: '#f5f5f5',
                    padding: 8,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {detailItem.content_snapshot}
                </pre>
              </>
            )}
            {(detailItem.runLogs || []).length > 0 && (
              <>
                <strong>调试日志摘要</strong>
                {(detailItem.runLogs as DataSandboxRecord[]).map((l) => (
                  <div key={l.id} style={{ color: '#555' }}>
                    attempt {l.attempt} · {l.log_len} 字节 · {formatTime(l.created_at)}
                  </div>
                ))}
              </>
            )}
          </Space>
        )}
      </Drawer>

      {/* 调试日志 */}
      <Drawer
        title={`调试日志：${logItem?.id || ''}`}
        width={760}
        open={logOpen}
        onClose={() => setLogOpen(false)}
      >
        {logItem && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Button.Group size="small">
                {[undefined, 0, 1, 2, 3].map((attempt) => (
                  <Button
                    key={String(attempt)}
                    type={logAttempt === attempt ? 'primary' : 'default'}
                    onClick={() => loadLog(logItem.id, attempt)}
                  >
                    {attempt === undefined ? '全部' : `attempt ${attempt}`}
                  </Button>
                ))}
              </Button.Group>
              <Button size="small" onClick={() => loadLog(logItem.id, logAttempt)}>
                刷新
              </Button>
            </Space>
            <div>
              <strong>日志</strong>
              {logLoading ? (
                <div>加载中…</div>
              ) : (
                <pre
                  style={{
                    maxHeight: 420,
                    overflow: 'auto',
                    background: '#1f1f1f',
                    color: '#d9d9d9',
                    padding: 12,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {logDetail?.attempt !== undefined
                    ? logDetail.logText || '(该次运行无日志)'
                    : (logDetail?.attempts || [])
                        .map(
                          (l: DataSandboxRecord) =>
                            `[attempt ${l.attempt}] ${l.log_text}`,
                        )
                        .join('\n') || '(无日志)'}
                </pre>
              )}
            </div>
          </Space>
        )}
      </Drawer>

      {/* 结果 Drawer */}
      <Drawer
        title={`运行结果：${resultItem?.id || ''}`}
        width={820}
        open={resultOpen}
        onClose={() => setResultOpen(false)}
      >
        {resultLoading ? (
          <div>加载中…</div>
        ) : (
          resultItem && (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space wrap>
                <Tag color={resultItem.runMode === 'DEV' ? 'cyan' : 'orange'}>
                  {runModeLabels[resultItem.runMode] || resultItem.runMode}
                </Tag>
                {resultItem.resultDatatableId && (
                  <Tag color="green">
                    {resultItem.resultNodeId}/{resultItem.resultDatatableId}
                  </Tag>
                )}
              </Space>
              {renderPreviewTable(resultItem.preview, false)}
              {resultItem.runMode === 'PROD' && (
                <Alert
                  type="warning"
                  showIcon
                  message="计算结果仅支持预览与导出（数据目录），不能挂载到项目，也不能作为沙箱计算源。"
                />
              )}
            </Space>
          )
        )}
      </Drawer>
    </MvpPage>
  );
};
