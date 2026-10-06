import { PublicKey } from '@solana/web3.js';
import crypto from 'crypto';

/**
 * Minimal Anchor-style encoder/decoder — enough for this program's args and
 * account layouts without shipping a generated IDL.
 *
 * Anchor instruction data = 8-byte sighash discriminator + borsh args.
 * Anchor account data      = 8-byte type discriminator + borsh fields.
 */

export function ixDiscriminator(name: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(`global:${name}`, 'utf8')
    .digest()
    .subarray(0, 8);
}

export function accountDiscriminator(name: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(`account:${name}`, 'utf8')
    .digest()
    .subarray(0, 8);
}

export class Encoder {
  private chunks: Buffer[] = [];

  u8(v: number) { this.chunks.push(Buffer.from([v & 0xff])); return this; }
  u16(v: number) { const b = Buffer.alloc(2); b.writeUInt16LE(v); this.chunks.push(b); return this; }
  u32(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.chunks.push(b); return this; }
  i32(v: number) { const b = Buffer.alloc(4); b.writeInt32LE(v); this.chunks.push(b); return this; }
  u64(v: number | bigint) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); this.chunks.push(b); return this; }
  i64(v: number | bigint) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); this.chunks.push(b); return this; }
  bool(v: boolean) { this.chunks.push(Buffer.from([v ? 1 : 0])); return this; }
  bytes(v: Buffer | Uint8Array) { this.chunks.push(Buffer.from(v)); return this; }
  bytes32(v: Uint8Array) { if (v.length !== 32) throw new Error('expected 32 bytes'); this.chunks.push(Buffer.from(v)); return this; }
  pubkey(v: PublicKey) { this.chunks.push(v.toBuffer()); return this; }
  str(v: string) {
    const data = Buffer.from(v, 'utf8');
    this.u32(data.length).bytes(data);
    return this;
  }
  optionPubkey(v: PublicKey | null) {
    if (v) this.u8(1).pubkey(v);
    else this.u8(0);
    return this;
  }
  /** C-style enum: 1-byte (u8) variant index. */
  enumVariant(index: number) { return this.u8(index); }

  done(): Buffer { return Buffer.concat(this.chunks); }
}

export class Reader {
  private offset = 0;
  constructor(private buf: Buffer) {}

  skip(n: number) { this.offset += n; return this; }
  u8() { return this.buf.readUInt8(this.offset++); }
  u16() { const v = this.buf.readUInt16LE(this.offset); this.offset += 2; return v; }
  u32() { const v = this.buf.readUInt32LE(this.offset); this.offset += 4; return v; }
  u64() { const v = this.buf.readBigUInt64LE(this.offset); this.offset += 8; return v; }
  i64() { const v = this.buf.readBigInt64LE(this.offset); this.offset += 8; return v; }
  bool() { return this.u8() === 1; }
  bytes(n: number) { const v = this.buf.subarray(this.offset, this.offset + n); this.offset += n; return v; }
  pubkey() { return new PublicKey(this.bytes(32)); }
  str() { const len = this.u32(); return this.bytes(len).toString('utf8'); }
  optionPubkey() { return this.u8() === 1 ? this.pubkey() : null; }
}
