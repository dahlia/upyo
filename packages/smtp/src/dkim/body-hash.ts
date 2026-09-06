import { createHash } from "node:crypto";

/** Incremental RFC 6376 body hash with bounded whitespace and line state. */
export class BodyHasher {
  private readonly hash = createHash("sha256");
  private readonly buffer = new Uint8Array(65536);
  private used = 0;
  private cr = false;
  private whitespace = false;
  private newlines = 0;
  private nonempty = false;

  constructor(private readonly mode: "simple" | "relaxed") {}

  update(bytes: Uint8Array): void {
    const relaxed = this.mode === "relaxed";
    for (let offset = 0; offset < bytes.length;) {
      const byte = bytes[offset++];
      if (this.cr) {
        this.cr = false;
        if (byte === 10) {
          this.whitespace = false;
          this.newlines++;
          continue;
        }
        this.content(13);
      }
      if (byte === 13) {
        this.cr = true;
      } else if (relaxed && (byte === 32 || byte === 9)) {
        this.whitespace = true;
      } else {
        this.content(byte);
        // Only CR and relaxed-mode whitespace need per-byte state changes.
        const start = offset;
        while (
          offset < bytes.length && bytes[offset] !== 13 &&
          (!relaxed || (bytes[offset] !== 32 && bytes[offset] !== 9))
        ) offset++;
        this.emitSpan(bytes, start, offset);
      }
    }
  }

  private emitSpan(bytes: Uint8Array, start: number, end: number): void {
    while (start < end) {
      const length = Math.min(end - start, this.buffer.length - this.used);
      this.buffer.set(bytes.subarray(start, start + length), this.used);
      this.used += length;
      start += length;
      if (this.used === this.buffer.length) {
        this.hash.update(this.buffer);
        this.used = 0;
      }
    }
  }

  private content(byte: number): void {
    if (this.mode === "relaxed" && (byte === 32 || byte === 9)) {
      this.whitespace = true;
      return;
    }
    while (this.newlines > 0) {
      this.emit(13);
      this.emit(10);
      this.newlines--;
    }
    if (this.whitespace) {
      this.emit(32);
      this.whitespace = false;
    }
    this.emit(byte);
    this.nonempty = true;
  }

  private emit(byte: number): void {
    this.buffer[this.used++] = byte;
    if (this.used === this.buffer.length) {
      this.hash.update(this.buffer);
      this.used = 0;
    }
  }

  digest(): string {
    if (this.cr) this.content(13);
    if (this.nonempty || this.mode === "simple") {
      this.emit(13);
      this.emit(10);
    }
    this.hash.update(this.buffer.subarray(0, this.used));
    return this.hash.digest("base64");
  }
}
