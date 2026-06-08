import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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
