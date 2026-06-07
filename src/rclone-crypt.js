import scrypt from 'scrypt-js'
import nacl from 'tweetnacl'

const DEFAULT_SALT = new Uint8Array([
  0xa8, 0x0d, 0xf4, 0x3a, 0x8f, 0xbd, 0x03, 0x08,
  0xa7, 0xca, 0xb8, 0x3e, 0x58, 0x1f, 0x86, 0xb1
])

const MAGIC = new Uint8Array([82, 67, 76, 79, 78, 69, 0, 0]) // "RCLONE\x00\x00"
const BLOCK_SIZE = 65536
const BLOCK_OVERHEAD = 16
const NONCE_SIZE = 24
// rclone uses extended-hex base32 (RFC 4648 §7), not standard base32
const B32_ALPHABET = '0123456789abcdefghijklmnopqrstuv'

export async function deriveKeys(password, password2 = '') {
  const enc = new TextEncoder()
  const pass = enc.encode(password + '\x00' + password2)
  const dk = await scrypt.scrypt(pass, DEFAULT_SALT, 16384, 8, 1, 80)
  return {
    dataKey: dk.slice(0, 32),
    nameKey: dk.slice(32, 64),
    nameTweak: dk.slice(64, 80)
  }
}

// GF(2^128) multiply-by-two, little-endian byte order (matches rfjakob/eme)
function multByTwo(b) {
  const out = new Uint8Array(16)
  let carry = 0
  for (let i = 0; i < 16; i++) {
    const next = (b[i] >> 7) & 1
    out[i] = ((b[i] << 1) | carry) & 0xff
    carry = next
  }
  if (carry) out[0] ^= 0x87
  return out
}

// AES-256 single-block encrypt. Uses AES-CBC with zero IV: first output block = AES-ECB.
async function aesEncBlock(key, block) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, block)
  return new Uint8Array(ct).slice(0, 16)
}

function xor16(a, b) {
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i]
  return out
}

// EME decrypt as implemented by rfjakob/eme (used by rclone).
// nameKey: 32 bytes, nameTweak (T): 16 bytes, data: multiple of 16 bytes.
//
// Pretransform:  PPP[j] = AES_K(data[j] XOR L[j])
// Mixing:        MC     = AES_K(MP) XOR T   (decrypt direction: T applied after AES)
//                M      = MP XOR MC
// Posttransform: out[j] = AES_K(PPP[j] XOR M*2^j) XOR L[j]
export async function emeDecrypt(nameKey, nameTweak, data) {
  const m = data.length / 16
  if (data.length % 16 !== 0) throw new Error('EME input not block-aligned')

  // Build L table: L[0] = AES_K(0^128), L[j] = 2*L[j-1] in GF(2^128)
  const LTable = []
  let Lcur = await aesEncBlock(nameKey, new Uint8Array(16))
  LTable.push(Lcur)
  for (let j = 1; j < m; j++) {
    Lcur = multByTwo(Lcur)
    LTable.push(Lcur)
  }

  // Pretransform
  const PPP = []
  for (let j = 0; j < m; j++) {
    const blk = data.slice(j * 16, j * 16 + 16)
    PPP.push(await aesEncBlock(nameKey, xor16(blk, LTable[j])))
  }

  // Mixing (decrypt: XOR T after AES)
  let MP = new Uint8Array(16)
  for (const p of PPP) MP = xor16(MP, p)
  const MC = xor16(await aesEncBlock(nameKey, MP), nameTweak)
  let M = xor16(MP, MC)

  // Posttransform
  const out = new Uint8Array(data.length)
  for (let j = 0; j < m; j++) {
    const pt = xor16(await aesEncBlock(nameKey, xor16(PPP[j], M)), LTable[j])
    out.set(pt, j * 16)
    M = multByTwo(M)
  }
  return out
}

export function base32Decode(str) {
  let bits = 0, val = 0
  const out = []
  for (const ch of str.toLowerCase()) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('Invalid base32 char: ' + ch)
    val = (val << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export async function decryptFilename(encName, nameKey, nameTweak) {
  const segments = encName.split('/')
  const decoded = []
  for (const seg of segments) {
    if (!seg) { decoded.push(seg); continue }
    const raw = base32Decode(seg)
    const pt = await emeDecrypt(nameKey, nameTweak, raw)
    const pad = pt[pt.length - 1]
    if (pad < 1 || pad > 16) throw new Error('Bad PKCS7 pad in filename')
    decoded.push(new TextDecoder().decode(pt.slice(0, pt.length - pad)))
  }
  return decoded.join('/')
}

export function decryptFileContent(encryptedBuffer, dataKey) {
  const data = new Uint8Array(encryptedBuffer)
  for (let i = 0; i < 8; i++) {
    if (data[i] !== MAGIC[i]) throw new Error('Bad magic - not an rclone crypt file')
  }
  const fileNonce = data.slice(8, 8 + NONCE_SIZE)
  const chunks = []
  let offset = 8 + NONCE_SIZE
  let blockNum = 0

  while (offset < data.length) {
    const encBlock = data.slice(offset, offset + BLOCK_SIZE + BLOCK_OVERHEAD)
    offset += encBlock.length

    // Block nonce = file nonce + blockNum as little-endian integer (rclone nonce.increment())
    const blockNonce = new Uint8Array(fileNonce)
    let carry = blockNum
    for (let i = 0; i < 24 && carry > 0; i++) {
      const sum = blockNonce[i] + carry
      blockNonce[i] = sum & 0xff
      carry = sum >>> 8
    }

    const pt = nacl.secretbox.open(encBlock, blockNonce, dataKey)
    if (!pt) throw new Error('Decryption failed on block ' + blockNum)
    chunks.push(pt)
    blockNum++
  }

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out
}
