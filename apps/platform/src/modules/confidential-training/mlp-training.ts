import Papa from 'papaparse';

type Tensor = { dtype: string; shape: number[]; values: Float32Array };
type TensorMap = Record<string, Tensor>;

const labels = ['Iris-setosa', 'Iris-versicolor', 'Iris-virginica'];
const features = ['SepalLengthCm', 'SepalWidthCm', 'PetalLengthCm', 'PetalWidthCm'];

const parseWeights = (bytes: Uint8Array): TensorMap => {
  if (bytes.byteLength < 9) throw new Error('safetensors 文件过小');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = Number(view.getBigUint64(0, true));
  if (headerLength <= 0 || headerLength > bytes.byteLength - 8)
    throw new Error('safetensors 头部长度无效');
  const header = JSON.parse(
    new TextDecoder().decode(bytes.slice(8, 8 + headerLength)).trim(),
  ) as Record<
    string,
    { dtype: string; shape: number[]; data_offsets: [number, number] }
  >;
  const dataStart = 8 + headerLength;
  const result: TensorMap = {};
  Object.entries(header).forEach(([name, meta]) => {
    if (name === '__metadata__') return;
    if (meta.dtype !== 'F32') throw new Error(`暂不支持 ${meta.dtype} 权重`);
    const [start, end] = meta.data_offsets;
    if (dataStart + end > bytes.byteLength || (end - start) % 4)
      throw new Error(`张量 ${name} 的数据范围无效`);
    const values = new Float32Array((end - start) / 4);
    const tensorView = new DataView(
      bytes.buffer,
      bytes.byteOffset + dataStart + start,
      end - start,
    );
    values.forEach(
      (_, index) => (values[index] = tensorView.getFloat32(index * 4, true)),
    );
    result[name] = { dtype: meta.dtype, shape: meta.shape, values };
  });
  for (const name of ['fc1.weight', 'fc1.bias', 'fc2.weight', 'fc2.bias']) {
    if (!result[name]) throw new Error(`模型缺少张量 ${name}`);
  }
  if (
    result['fc1.weight'].shape.join(',') !== '5,4' ||
    result['fc2.weight'].shape.join(',') !== '3,5'
  )
    throw new Error('首期训练适配器要求 MLP 结构为 4→5→3');
  return result;
};

const encodeWeights = (tensors: TensorMap) => {
  let offset = 0;
  const header: Record<string, unknown> = {};
  const names = ['fc1.bias', 'fc1.weight', 'fc2.bias', 'fc2.weight'];
  names.forEach((name) => {
    const tensor = tensors[name];
    const size = tensor.values.byteLength;
    header[name] = {
      dtype: 'F32',
      shape: tensor.shape,
      data_offsets: [offset, offset + size],
    };
    offset += size;
  });
  const rawHeader = new TextEncoder().encode(JSON.stringify(header));
  const headerLength = Math.ceil(rawHeader.byteLength / 8) * 8;
  const output = new Uint8Array(8 + headerLength + offset);
  new DataView(output.buffer).setBigUint64(0, BigInt(headerLength), true);
  output.fill(0x20, 8, 8 + headerLength);
  output.set(rawHeader, 8);
  let dataOffset = 8 + headerLength;
  names.forEach((name) => {
    const values = tensors[name].values;
    const view = new DataView(output.buffer, dataOffset, values.byteLength);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    dataOffset += values.byteLength;
  });
  return output;
};

const forward = (x: number[], tensors: TensorMap) => {
  const w1 = tensors['fc1.weight'].values;
  const b1 = tensors['fc1.bias'].values;
  const w2 = tensors['fc2.weight'].values;
  const b2 = tensors['fc2.bias'].values;
  const hidden = Array.from({ length: 5 }, (_, i) =>
    Math.max(0, b1[i] + x.reduce((sum, value, j) => sum + w1[i * 4 + j] * value, 0)),
  );
  const logits = Array.from(
    { length: 3 },
    (_, i) => b2[i] + hidden.reduce((sum, value, j) => sum + w2[i * 5 + j] * value, 0),
  );
  const max = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(value - max));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return { hidden, probabilities: exp.map((value) => value / total) };
};

export const trainIrisMlp = async (
  csvBytes: Uint8Array,
  weightBytes: Uint8Array,
  epochs: number,
  learningRate: number,
  onEpoch: (epoch: number, loss: number, accuracy: number) => Promise<void>,
) => {
  const parsed = Papa.parse<Record<string, string>>(
    new TextDecoder().decode(csvBytes),
    {
      header: true,
      skipEmptyLines: true,
    },
  );
  if (parsed.errors.length)
    throw new Error(`CSV 解析失败：${parsed.errors[0].message}`);
  const samples = parsed.data.map((row, index) => {
    const x = features.map((name) => Number(row[name]));
    const y = labels.indexOf(row.Species);
    if (x.some((value) => !Number.isFinite(value)) || y < 0)
      throw new Error(`CSV 第 ${index + 2} 行不符合 Iris 字段约定`);
    return { id: row.Id || String(index + 1), x, y, source: row };
  });
  if (!samples.length) throw new Error('CSV 中没有可训练样本');
  const tensors = parseWeights(weightBytes);
  const w1 = tensors['fc1.weight'].values;
  const b1 = tensors['fc1.bias'].values;
  const w2 = tensors['fc2.weight'].values;
  const b2 = tensors['fc2.bias'].values;
  let finalLoss = 0;
  let finalAccuracy = 0;

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    let loss = 0;
    let correct = 0;
    for (const sample of samples) {
      const { hidden, probabilities } = forward(sample.x, tensors);
      loss -= Math.log(Math.max(probabilities[sample.y], 1e-9));
      const prediction = probabilities.indexOf(Math.max(...probabilities));
      if (prediction === sample.y) correct += 1;
      const dLogits = probabilities.map(
        (value, index) => value - (index === sample.y ? 1 : 0),
      );
      const dHidden = hidden.map((value, j) =>
        value > 0 ? dLogits.reduce((sum, grad, i) => sum + grad * w2[i * 5 + j], 0) : 0,
      );
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 5; j += 1)
          w2[i * 5 + j] -= learningRate * dLogits[i] * hidden[j];
        b2[i] -= learningRate * dLogits[i];
      }
      for (let i = 0; i < 5; i += 1) {
        for (let j = 0; j < 4; j += 1)
          w1[i * 4 + j] -= learningRate * dHidden[i] * sample.x[j];
        b1[i] -= learningRate * dHidden[i];
      }
    }
    finalLoss = loss / samples.length;
    finalAccuracy = correct / samples.length;
    await onEpoch(epoch, finalLoss, finalAccuracy);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
  }

  const resultRows = samples.map((sample) => {
    const { probabilities } = forward(sample.x, tensors);
    const prediction = probabilities.indexOf(Math.max(...probabilities));
    return {
      ...sample.source,
      PredictedSpecies: labels[prediction],
      Confidence: Math.max(...probabilities).toFixed(6),
    };
  });
  const resultCsv = Papa.unparse(resultRows);
  csvBytes.fill(0);
  weightBytes.fill(0);
  return {
    resultCsv: new TextEncoder().encode(resultCsv),
    resultWeights: encodeWeights(tensors),
    metrics: { loss: finalLoss, accuracy: finalAccuracy, samples: samples.length },
  };
};
