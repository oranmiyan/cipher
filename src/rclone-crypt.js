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

export const HEADER_SIZE = 32        // 8 magic + 24 nonce
export const ENC_BLOCK_SIZE = 65552  // 65536 data + 16 Poly1305 tag
export const PLAIN_BLOCK_SIZE = 65536

export function parseFileHeader(buffer) {
  const data = new Uint8Array(buffer)
  for (let i = 0; i < 8; i++) {
    if (data[i] !== MAGIC[i]) throw new Error('Bad magic - not an rclone crypt file')
  }
  return data.slice(8, 32) // nonce
}

export function decryptBlock(encBlock, fileNonce, blockNum, dataKey) {
  const blockNonce = new Uint8Array(fileNonce)
  let carry = blockNum
  for (let i = 0; i < 24 && carry > 0; i++) {
    const sum = blockNonce[i] + carry
    blockNonce[i] = sum & 0xff
    carry = sum >>> 8
  }
  const pt = nacl.secretbox.open(encBlock, blockNonce, dataKey)
  if (!pt) throw new Error(`Decryption failed on block ${blockNum}`)
  return pt
}
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

// AES-256 single-block encrypt via AES-CBC with zero IV (first output block = AES-ECB).
async function aesEncBlock(key, block) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, block)
  return new Uint8Array(ct).slice(0, 16)
}

// AES-256 single-block decrypt via 2-block AES-CBC trick.
// Computes C2 = AES_enc(0x10*16 XOR block), then CBC-decrypts block||C2 with IV=0.
// The second plaintext block is guaranteed to be 0x10*16 (full valid PKCS7),
// so WebCrypto strips it and returns exactly 16 bytes = AES^-1(block).
async function aesDecBlock(key, block) {
  const pad = new Uint8Array(16).fill(0x10)
  const c2 = await aesEncBlock(key, xor16(pad, block))
  const input = new Uint8Array(32)
  input.set(block, 0); input.set(c2, 16)
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, input)
  return new Uint8Array(pt)
}

function xor16(a, b) {
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i]
  return out
}

// EME decrypt — matches rfjakob/eme DirectionDecrypt exactly.
// nameKey: 32 bytes, nameTweak (T): 16 bytes, data: multiple of 16 bytes.
export async function emeDecrypt(nameKey, nameTweak, data) {
  const m = data.length / 16
  if (data.length % 16 !== 0) throw new Error('EME input not block-aligned')

  // L table: L[i] = 2^(i+1) * AES_K(0) — multiply BEFORE storing, so L[0] = 2*AES(0)
  const L = []
  let Li = await aesEncBlock(nameKey, new Uint8Array(16))
  for (let i = 0; i < m; i++) { Li = multByTwo(Li); L.push(Li) }

  // Step 1: PPP[j] = AES_dec(data[j] XOR L[j])
  const PPP = []
  for (let j = 0; j < m; j++)
    PPP.push(await aesDecBlock(nameKey, xor16(data.slice(j * 16, j * 16 + 16), L[j])))

  // Step 2: MP = T XOR (XOR of all PPP[j])
  let MP = new Uint8Array(nameTweak)
  for (const p of PPP) MP = xor16(MP, p)

  // Step 3: MC = AES_dec(MP)
  const MC = await aesDecBlock(nameKey, MP)

  // Step 4: M = MP XOR MC
  let M = xor16(MP, MC)

  // Step 5: CCC[j] for j>=1
  const CCC = new Array(m)
  for (let j = 1; j < m; j++) { M = multByTwo(M); CCC[j] = xor16(PPP[j], M) }

  // Step 6: CCC[0] = MC XOR T XOR (XOR of all CCC[j>=1])
  let ccc0 = xor16(MC, nameTweak)
  for (let j = 1; j < m; j++) ccc0 = xor16(ccc0, CCC[j])
  CCC[0] = ccc0

  // Step 7: out[j] = AES_dec(CCC[j]) XOR L[j]
  const out = new Uint8Array(data.length)
  for (let j = 0; j < m; j++)
    out.set(xor16(await aesDecBlock(nameKey, CCC[j]), L[j]), j * 16)

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

// EME encrypt — same structure as emeDecrypt but using aesEncBlock throughout
export async function emeEncrypt(nameKey, nameTweak, data) {
  const m = data.length / 16
  if (data.length % 16 !== 0) throw new Error('EME input not block-aligned')

  const L = []
  let Li = await aesEncBlock(nameKey, new Uint8Array(16))
  for (let i = 0; i < m; i++) { Li = multByTwo(Li); L.push(Li) }

  const PPP = []
  for (let j = 0; j < m; j++)
    PPP.push(await aesEncBlock(nameKey, xor16(data.slice(j * 16, j * 16 + 16), L[j])))

  let MP = new Uint8Array(nameTweak)
  for (const p of PPP) MP = xor16(MP, p)

  const MC = await aesEncBlock(nameKey, MP)
  let M = xor16(MP, MC)

  const CCC = new Array(m)
  for (let j = 1; j < m; j++) { M = multByTwo(M); CCC[j] = xor16(PPP[j], M) }

  let ccc0 = xor16(MC, nameTweak)
  for (let j = 1; j < m; j++) ccc0 = xor16(ccc0, CCC[j])
  CCC[0] = ccc0

  const out = new Uint8Array(data.length)
  for (let j = 0; j < m; j++)
    out.set(xor16(await aesEncBlock(nameKey, CCC[j]), L[j]), j * 16)

  return out
}

export function base32Encode(data) {
  let bits = 0, val = 0, out = ''
  for (const byte of data) {
    val = (val << 8) | byte
    bits += 8
    while (bits >= 5) { bits -= 5; out += B32_ALPHABET[(val >>> bits) & 31] }
  }
  if (bits > 0) out += B32_ALPHABET[(val << (5 - bits)) & 31]
  return out
}

export async function encryptFilename(name, nameKey, nameTweak) {
  const nameBytes = new TextEncoder().encode(name)
  const padLen = 16 - (nameBytes.length % 16)
  const padded = new Uint8Array(nameBytes.length + padLen)
  padded.set(nameBytes)
  padded.fill(padLen, nameBytes.length)
  const encrypted = await emeEncrypt(nameKey, nameTweak, padded)
  return base32Encode(encrypted)
}

export function encryptFileContent(plainBytes, dataKey) {
  if (!(plainBytes instanceof Uint8Array)) plainBytes = new Uint8Array(plainBytes)
  const fileNonce = nacl.randomBytes(24)
  const header = new Uint8Array(32)
  header.set(MAGIC, 0)
  header.set(fileNonce, 8)

  const chunks = [header]
  let offset = 0, blockNum = 0

  while (offset <= plainBytes.length) {
    if (offset === plainBytes.length && blockNum > 0) break
    const block = plainBytes.slice(offset, offset + BLOCK_SIZE)
    if (block.length === 0) break
    const blockNonce = new Uint8Array(fileNonce)
    let carry = blockNum
    for (let i = 0; i < 24 && carry > 0; i++) {
      const sum = blockNonce[i] + carry
      blockNonce[i] = sum & 0xff
      carry = sum >>> 8
    }
    chunks.push(nacl.secretbox(block, blockNonce, dataKey))
    offset += block.length
    blockNum++
  }

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { result.set(c, pos); pos += c.length }
  return result
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
