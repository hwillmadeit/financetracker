// 비밀번호 기반 AES-256-GCM 암복호화 유틸리티
// PBKDF2로 비밀번호 → 키 유도, 매 암호화마다 새 salt/iv 사용

const PBKDF2_ITERATIONS = 150000

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface EncryptedPayload {
  salt: string
  iv: string
  data: string
}

export async function encryptData(plaintext: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const enc = new TextEncoder()
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return {
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    data: bufToBase64(cipherBuf),
  }
}

export async function decryptData(payload: EncryptedPayload, password: string): Promise<string> {
  const salt = new Uint8Array(base64ToBuf(payload.salt))
  const iv = new Uint8Array(base64ToBuf(payload.iv))
  const key = await deriveKey(password, salt)
  const cipherBuf = base64ToBuf(payload.data)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf)
  return new TextDecoder().decode(plainBuf)
}

// 비밀번호 검증용 해시 (평문 비밀번호는 저장하지 않음)
export async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await deriveKey(password, salt)
  const raw = await crypto.subtle.exportKey('raw', key)
  return bufToBase64(raw)
}
