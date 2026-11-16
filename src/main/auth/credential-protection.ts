import { app, safeStorage } from 'electron'

function requireWindowsEncryption(): void {
  if (!app.isReady() || process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows credential encryption is unavailable')
  }
}

export function encryptCredential(value: string): Buffer {
  requireWindowsEncryption()
  return safeStorage.encryptString(value)
}

export function decryptCredential(value: Buffer): string {
  requireWindowsEncryption()
  return safeStorage.decryptString(value)
}
