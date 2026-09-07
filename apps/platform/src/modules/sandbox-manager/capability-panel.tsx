import { Alert, Collapse, Table, Tag, Typography } from 'antd';

import type { TeeCapabilities } from './capabilities';

/**
 * 技术要求对照。
 *
 * 左列为技术要求条款，右列分「系统支持」与「本实例当前」两栏：前者是本系统实现的能力，
 * 后者是本实例实测结论。两栏分列是有意为之，避免把支持能力读作已达成的硬件机密计算。
 */
export const CapabilityPanel = ({
  capabilities,
}: {
  capabilities?: TeeCapabilities;
}) => {
  const rows = capabilities?.requirements || [];
  const simulation = capabilities?.environment?.runtimeMode === 'SIMULATION';

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[
        {
          key: 'requirements',
          label: `TEE 环境技术要求对照${
            rows.length
              ? `（${rows.filter((row) => row.satisfied).length}/${
                  rows.length
                } 项已达成）`
              : ''
          }`,
          children: (
            <>
              {simulation && (
                <Alert
                  showIcon
                  type="warning"
                  message="本实例运行在 SIMULATION 档位"
                  description="未探测到 CPU TEE 字符设备，GPU 证据为实验室模拟。下表「系统支持」一栏描述本系统实现的能力，不代表本实例已具备硬件机密计算。"
                  style={{ marginBottom: 12 }}
                />
              )}
              <Table
                rowKey={(row) => row.requirement}
                size="small"
                scroll={{ x: 'max-content' }}
                dataSource={rows}
                pagination={false}
                columns={[
                  { title: '技术要求', dataIndex: 'requirement', width: 260 },
                  { title: '系统支持', dataIndex: 'supported' },
                  {
                    title: '本实例当前',
                    dataIndex: 'current',
                    render: (value: string, row) => (
                      <Tag color={row.satisfied ? 'success' : 'warning'}>{value}</Tag>
                    ),
                  },
                ]}
              />
              <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                取值来自 TEE 环境探测与 CipherGPU 能力接口，随实例硬件与运行档位变化。
              </Typography.Paragraph>
            </>
          ),
        },
      ]}
    />
  );
};
