import {
  S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand,
  DeleteObjectCommand, PutObjectCommand, CopyObjectCommand,
  ListObjectVersionsCommand, GetBucketVersioningCommand, PutBucketVersioningCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = 'moriah-backup'
const REGION = 'eu-central-003'
const ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com'

let client = null

export function initClient(keyId, appKey) {
  client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey }
  })
}

export function getClient() {
  if (!client) throw new Error('B2 client not initialised')
  return client
}

export async function listPrefix(prefix = '') {
  const cmd = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    Delimiter: '/'
  })
  const resp = await getClient().send(cmd)
  return {
    folders: (resp.CommonPrefixes || []).map(p => p.Prefix),
    files: (resp.Contents || []).map(o => ({
      key: o.Key,
      size: o.Size,
      lastModified: o.LastModified
    }))
  }
}

export async function getObjectBytes(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  const resp = await getClient().send(cmd)
  const reader = resp.Body.getReader()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out.buffer
}

export async function getObjectRange(key, startByte, endByte) {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Range: `bytes=${startByte}-${endByte}`
  })
  const resp = await getClient().send(cmd)
  const chunks = []
  for await (const chunk of resp.Body) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out
}

export async function presignGet(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getClient(), cmd, { expiresIn })
}

export async function deleteObject(key) {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  await getClient().send(cmd)
}

export async function putObject(key, data) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: data })
  await getClient().send(cmd)
}

// Like putObject but fires onProgress({ loaded, total, percent, speedMBs }) during upload
export async function uploadWithProgress(key, data, onProgress) {
  const upload = new Upload({
    client: getClient(),
    params: { Bucket: BUCKET, Key: key, Body: data },
  })
  const startTime = Date.now()
  upload.on('httpUploadProgress', ({ loaded, total }) => {
    const elapsed = (Date.now() - startTime) / 1000 || 0.001
    const percent  = total ? Math.round((loaded / total) * 100) : 0
    const speedMBs = (loaded / 1024 / 1024 / elapsed).toFixed(1)
    onProgress({ loaded, total, percent, speedMBs })
  })
  await upload.done()
}

export async function copyAndDelete(srcKey, dstKey) {
  const copyCmd = new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: encodeURIComponent(`${BUCKET}/${srcKey}`),
    Key: dstKey,
  })
  await getClient().send(copyCmd)
  await deleteObject(srcKey)
}

export async function getBucketVersioning() {
  try {
    const cmd = new GetBucketVersioningCommand({ Bucket: BUCKET })
    const resp = await getClient().send(cmd)
    return resp.Status === 'Enabled'
  } catch {
    return false
  }
}

export async function enableBucketVersioning() {
  const cmd = new PutBucketVersioningCommand({
    Bucket: BUCKET,
    VersioningConfiguration: { Status: 'Enabled' },
  })
  await getClient().send(cmd)
}

export async function listObjectVersions(key) {
  const cmd = new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: key })
  const resp = await getClient().send(cmd)
  return (resp.Versions || []).filter(v => v.Key === key)
}

export async function restoreVersion(key, versionId) {
  const cmd = new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${key}?versionId=${versionId}`,
    Key: key,
  })
  await getClient().send(cmd)
}

export async function deleteVersion(key, versionId) {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key, VersionId: versionId })
  await getClient().send(cmd)
}

// Like getObjectBytes but returns null instead of throwing on a missing key
export async function getMetaObject(key) {
  try {
    return await getObjectBytes(key)
  } catch {
    return null
  }
}

export async function listAllObjects(prefix = '') {
  const allFiles = []
  let continuationToken = undefined
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    })
    const resp = await getClient().send(cmd)
    for (const obj of (resp.Contents || [])) {
      allFiles.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified })
    }
    continuationToken = resp.NextContinuationToken
  } while (continuationToken)
  return allFiles
}
