import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
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

export async function presignGet(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getClient(), cmd, { expiresIn })
}
