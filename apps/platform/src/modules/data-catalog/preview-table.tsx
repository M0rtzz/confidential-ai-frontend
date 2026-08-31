import { Alert, Empty, Image, Spin, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { DataSandboxRecord } from '@/services/data-sandbox';

export const DataAssetPreviewTable = ({
  preview,
  emptyText,
}: {
  preview?: DataSandboxRecord;
  emptyText?: string;
}) => {
  const previewRows = preview?.rows;
  const previewColumns = preview?.columns;
  const rows: DataSandboxRecord[] = Array.isArray(previewRows) ? previewRows : [];
  const names: string[] = Array.isArray(previewColumns)
    ? previewColumns
    : Object.keys(rows[0] || {});
  const modality = String(preview?.asset?.modality || '').toUpperCase();
  const contentType = String(
    preview?.asset?.content_type || preview?.asset?.contentType || '',
  ).toLowerCase();
  const isImage = modality === 'IMAGE' || contentType.startsWith('image/');
  const imageAssetId = String(preview?.asset?.id || '');
  const [imagePreview, setImagePreview] = useState<{
    assetId: string;
    url: string;
  }>();
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState(false);

  useEffect(() => {
    if (!isImage || !imageAssetId) {
      setImagePreview(undefined);
      setImagePreviewLoading(false);
      setImagePreviewError(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | undefined;
    setImagePreview(undefined);
    setImagePreviewLoading(true);
    setImagePreviewError(false);

    const loadImage = async () => {
      try {
        const response = await fetch(
          `/api/v1alpha1/data-assets/content?id=${encodeURIComponent(imageAssetId)}`,
          {
            credentials: 'include',
            headers: {
              'User-Token': localStorage.getItem('User-Token') || '',
            },
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImagePreview({ assetId: imageAssetId, url: objectUrl });
      } catch {
        if (!controller.signal.aborted) {
          setImagePreviewError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setImagePreviewLoading(false);
        }
      }
    };

    void loadImage();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageAssetId, isImage]);

  return (
    <>
      {preview?.masked && (
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 12 }}
          message="源数据已自动脱敏，预览不会展示完整字段值"
        />
      )}
      {preview?.sharedMetadataOnly && (
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 12 }}
          message="该数据由项目合作节点提供，当前展示已同步的字段格式；样例数据仍由提供方保管"
        />
      )}
      {preview?.asset?.name && (
        <Typography.Text type="secondary">
          数据集：{preview.asset.name}
        </Typography.Text>
      )}
      {isImage ? (
          imagePreviewLoading ? (
            <Spin style={{ display: 'block', marginTop: 12 }} tip="图片加载中..." />
          ) : imagePreviewError ? (
            <Alert
              showIcon
              type="error"
              style={{ marginTop: 12 }}
              message="图片预览加载失败"
              description="请刷新后重试，或检查当前登录状态。"
            />
          ) : imagePreview?.assetId === imageAssetId ? (
            <Image
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 560,
                marginTop: 12,
                objectFit: 'contain',
              }}
              src={imagePreview.url}
              alt={String(preview?.asset?.name || '图片数据')}
              preview
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无图片预览" />
          )
      ) : names.length ? (
        <Table
          style={{ marginTop: 12 }}
          size="small"
          bordered
          pagination={false}
          rowKey={(_, index) => String(index)}
          locale={{ emptyText: emptyText || '暂无数据' }}
          dataSource={rows}
          scroll={{ x: 'max-content', y: 480 }}
          columns={names.map((name) => ({
            title: name,
            dataIndex: name,
            key: name,
            width: 160,
            render: (value: unknown) =>
              value === null || value === undefined || value === '' ? (
                <Tag>空</Tag>
              ) : (
                String(value)
              ),
          }))}
        />
      ) : (
        <Empty description={emptyText || '该数据暂无可表格化预览内容'} />
      )}
    </>
  );
};
