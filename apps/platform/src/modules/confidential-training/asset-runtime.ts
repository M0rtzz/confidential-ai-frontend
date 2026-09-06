import {
  base64UrlToBytes,
  getSessionIdentity,
  randomId,
  restoreEncryptedFileDek,
  sealRememberedDek,
  sha256,
} from '@/security/crypto';
import { ConfidentialComputeApi } from '@/services/confidential-compute';
import {
  ConfidentialTrainingApi,
  type ConfidentialTrainingTask,
} from '@/services/confidential-training';

export const releaseTrainingKeys = async (task: ConfidentialTrainingTask) => {
  if (!task.taskSpec || !task.taskSpecDigest || !task.attestation) {
    throw new Error('训练任务尚未创建证明会话');
  }
  const attestation = task.attestation;
  const inputs = task.inputManifests || [];
  if (inputs.length < 2) throw new Error('训练任务缺少模型或数据清单');
  const identity = await getSessionIdentity();
  await ConfidentialComputeApi.registerIdentity({
    kid: identity.kid,
    encryptionPublicKey: identity.encryptionPublicKey,
    signingPublicKey: identity.signingPublicKey,
    proofOfPossession: identity.proofOfPossession,
  });
  if (identity.kid !== task.outputRecipientKid) {
    throw new Error('当前浏览器客户密钥不是该训练任务的结果接收密钥');
  }
  for (const input of inputs) await restoreEncryptedFileDek(input.manifest);
  const now = Date.now();
  const expiry = new Date(
    Math.min(
      Date.parse(task.taskSpec.expiresAt),
      Date.parse(attestation.expiresAt),
      now + 3 * 60 * 1000,
    ) - 1000,
  ).toISOString();
  const grantId = randomId('grant');
  const assetVersionIds = inputs.map((input) => input.assetVersionId);
  const claims = {
    contractVersion: 'ds-confidential/v1',
    grantId,
    jti: randomId('jti'),
    taskSpecDigest: task.taskSpecDigest,
    teeSessionId: attestation.sessionId,
    teeEphemeralPublicKeyHash: await sha256(
      base64UrlToBytes(attestation.teeEphemeralPublicKey),
    ),
    securityProfile: attestation.securityProfile,
    evidenceType: attestation.evidenceType,
    simulated: attestation.simulated,
    hardwareModel: attestation.hardwareModel,
    runtimeSecurityRequirement: 'controlled-sim-ok',
    assetVersionIds,
    outputRecipients: [identity.kid],
    nbf: new Date(now - 1000).toISOString(),
    exp: expiry,
    maxUses: 1,
  };
  const sealedDeks = await Promise.all(
    inputs.map(async (input) => {
      const aad = new TextEncoder().encode(
        `${task.taskSpecDigest}|${input.assetVersionId}|${grantId}|${expiry}`,
      );
      return {
        assetVersionId: input.assetVersionId,
        ...(await sealRememberedDek(
          input.manifest.envelopeId,
          attestation.teeEphemeralPublicKey,
          aad,
        )),
      };
    }),
  );
  return ConfidentialTrainingApi.releaseKeys(task.taskId, {
    grant: {
      claims,
      signingPublicKey: identity.signingPublicKey,
      signature: await identity.sign(claims),
    },
    sealedDeks,
  });
};
