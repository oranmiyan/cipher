import scrypt from 'scrypt-js'
import nacl from 'tweetnacl'

// Default rclone salt
const DEFAULT_SALT = new Uint8Array([
  0xa8, 0x0d, 0xf4, 0x3a, 0x8f, 0xbd, 0x03, 0x08,
  0xa7, 0xca, 0xb8, 0x3e, 0x58, 0x1f, 0x86, 0xb1
])

const MAGIC = new Uint8Array([82, 67, 76, 79, 78, 69, 0, 0]) // "RCLONE\x00\x00"
const BLOCK_SIZE = 65536
const BLOCK_OVERHEAD = 16 // poly1305 tag
const NONCE_SIZE = 24
const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

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

// GF(2^128) multiply by 2 (little-endian bytes)
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

// AES-256 single-block encrypt using WebCrypto
async function aesEncBlock(key, block) {
  // WebCrypto AES-CBC with zero IV: first block = AES-ECB
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt'])
  const iv = new Uint8Array(16)
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, block)
  return new Uint8Array(ct).slice(0, 16)
}

// Build L table for EME (16 entries)
async function tabulateL(key) {
  const L = []
  let val = await aesEncBlock(key, new Uint8Array(16))
  for (let i = 0; i < 16; i++) {
    L.push(val)
    val = multByTwo(val)
  }
  return L
}

function xor16(a, b) {
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i]
  return out
}

// EME decrypt: nameKey=32 bytes, nameTweak=16 bytes, data=multiple of 16 bytes
export async function emeDecrypt(nameKey, nameTweak, data) {
  const m = data.length / 16
  if (data.length % 16 !== 0) throw new Error('EME input not block-aligned')
  const L = await tabulateL(nameKey)

  // PPPj = AES_enc(Tj XOR Pj) for each block j
  const T = new Array(m)
  T[0] = nameTweak.slice(0, 16)
  for (let j = 1; j < m; j++) {
    T[j] = await aesEncBlock(nameKey, xor16(T[j - 1], L[0]))
  }

  // First pass: PPPj = AES(Tj XOR Pj)
  const PPP = []
  for (let j = 0; j < m; j++) {
    const blk = data.slice(j * 16, j * 16 + 16)
    PPP.push(await aesEncBlock(nameKey, xor16(T[j], blk)))
  }

  // MP = XOR of all PPP blocks
  let MP = new Uint8Array(16)
  for (const p of PPP) MP = xor16(MP, p)

  // MC = AES_enc(MP)
  const MC = await aesEncBlock(nameKey, MP)

  // M = MC XOR MP
  let M = xor16(MC, MP)

  // CCCj = PPPj XOR (M * 2^j)
  const CCC = []
  for (let j = 0; j < m; j++) {
    CCC.push(xor16(PPP[j], M))
    M = multByTwo(M)
  }

  // Second pass: AES_enc(CCCj) XOR Tj => plaintext blocks
  const out = new Uint8Array(data.length)
  for (let j = 0; j < m; j++) {
    const pt = xor16(await aesEncBlock(nameKey, CCC[j]), T[j])
    out.set(pt, j * 16)
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
  // Each path segment is decoded independently
  const segments = encName.split('/')
  const decoded = []
  for (const seg of segments) {
    if (!seg) { decoded.push(seg); continue }
    const raw = base32Decode(seg)
    const pt = await emeDecrypt(nameKey, nameTweak, raw)
    // PKCS7 unpad
    const pad = pt[pt.length - 1]
    if (pad < 1 || pad > 16) throw new Error('Bad PKCS7 pad')
    decoded.push(new TextDecoder().decode(pt.slice(0, pt.length - pad)))
  }
  return decoded.join('/')
}

export function decryptFileContent(encryptedBuffer, dataKey) {
  const data = new Uint8Array(encryptedBuffer)
  // Verify magic
  for (let i = 0; i < 8; i++) {
    if (data[i] !== MAGIC[i]) throw new Error('Bad magic bytes — not an rclone crypt file')
  }
  const fileNonce = data.slice(8, 8 + NONCE_SIZE)
  const chunks = []
  let offset = 8 + NONCE_SIZE
  let blockNum = 0

  while (offset < data.length) {
    const encBlock = data.slice(offset, offset + BLOCK_SIZE + BLOCK_OVERHEAD)
    offset += encBlock.length

    // Derive block nonce: file nonce + little-endian block counter (last 8 bytes)
    const blockNonce = fileNonce.slice()
    let n = blockNum
    for (let i = 16; i < 24; i++) {
      blockNonce[i] ^= n & 0xff
      n >>>= 8
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
