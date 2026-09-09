/** @internal */
export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
/** @internal */
export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
