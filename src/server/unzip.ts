/**
 * Reads the first file out of a ZIP archive (NSE ships its bhavcopy zipped). Enough of the
 * format for one entry, stored or deflated, via the central directory so a streamed archive
 * (sizes only in a data descriptor) still reads. Output is capped, so a hostile archive can't
 * exhaust memory. No dependency: `node:zlib` inflates.
 */
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_OUTPUT = 64 * 1024 * 1024;

/** The first entry's bytes. Throws `RangeError` on anything it can't read. */
export function firstZipEntry(zip: Uint8Array): Uint8Array {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end-of-central-directory record sits in the last 22 + 65535 (comment) bytes.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (v.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  if (end < 0 || v.getUint16(end + 10, true) < 1)
    throw new RangeError("not a zip archive");
  const dir = v.getUint32(end + 16, true);
  if (dir + 46 > zip.length || v.getUint32(dir, true) !== CENTRAL)
    throw new RangeError("bad zip directory");
  const method = v.getUint16(dir + 10, true);
  const size = v.getUint32(dir + 20, true);
  const local = v.getUint32(dir + 42, true);
  if (local + 30 > zip.length || v.getUint32(local, true) !== LOCAL)
    throw new RangeError("bad zip entry");
  const start =
    local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
  if (start + size > zip.length) throw new RangeError("truncated zip entry");
  const data = zip.subarray(start, start + size);
  if (method === 0) return data;
  if (method !== 8) throw new RangeError("unsupported zip compression");
  return new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_OUTPUT }));
}
