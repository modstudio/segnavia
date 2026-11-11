export async function withCrypto<T>(crypto: Crypto | undefined, run: () => T | Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto })
  try {
    return await run()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor)
    else delete (globalThis as { crypto?: Crypto }).crypto
  }
}
