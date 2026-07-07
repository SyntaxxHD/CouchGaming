#!/usr/bin/env bun
import { mkdir, writeFile, chmod } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { createInflateRaw } from "node:zlib"
import { TOOL_MANIFEST } from "../src/tools-bootstrap/manifest.ts"

const outDir = resolve(import.meta.dir, "..", "tools")

await mkdir(outDir, { recursive: true })

const results: Array<{ file: string; sha256: string }> = []

for (const entry of TOOL_MANIFEST) {
  console.log(`→ ${entry.zipUrl}`)
  const res = await fetch(entry.zipUrl, {
    headers: { "User-Agent": "CouchGaming build script" },
  })
  if (!res.ok) throw new Error(`Download failed: ${entry.zipUrl} (HTTP ${res.status})`)

  const zipBytes = new Uint8Array(await res.arrayBuffer())
  const memberBytes = await extractFromZip(zipBytes, entry.memberInZip)
  if (!memberBytes) throw new Error(`Member ${entry.memberInZip} not found in ${entry.zipUrl}`)

  const digest = sha256(memberBytes)
  if (entry.sha256 && entry.sha256 !== digest) {
    throw new Error(`SHA-256 mismatch for ${entry.filename}: expected ${entry.sha256}, got ${digest}`)
  }

  const target = join(outDir, entry.filename)
  await writeFile(target, memberBytes)
  try {
    await chmod(target, 0o755)
  } catch {
    /* ignore */
  }

  console.log(`  ${entry.filename}  sha256=${digest}  bytes=${memberBytes.length}`)
  results.push({ file: entry.filename, sha256: digest })
}

console.log("")
console.log("Pin these SHAs in src/tools-bootstrap/manifest.ts:")
for (const r of results) console.log(`  ${r.file}: ${r.sha256}`)

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function extractFromZip(zip: Uint8Array, memberName: string): Promise<Uint8Array | null> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocdOffset = findEocd(view)
  if (eocdOffset < 0) throw new Error("Not a ZIP file: EOCD not found")

  const cdEntries = view.getUint16(eocdOffset + 10, true)
  const cdSize = view.getUint32(eocdOffset + 12, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)

  let cursor = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Bad central-directory signature")
    const compressionMethod = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLen = view.getUint16(cursor + 28, true)
    const extraLen = view.getUint16(cursor + 30, true)
    const commentLen = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder("utf-8").decode(zip.subarray(cursor + 46, cursor + 46 + nameLen))

    if (name === memberName) {
      return await readLocalMember(zip, view, localHeaderOffset, compressionMethod, compressedSize)
    }

    cursor += 46 + nameLen + extraLen + commentLen
  }
  void cdSize
  return null
}

function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 65557)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i
  }
  return -1
}

async function readLocalMember(
  zip: Uint8Array,
  view: DataView,
  localHeaderOffset: number,
  compressionMethod: number,
  compressedSize: number,
): Promise<Uint8Array> {
  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) throw new Error("Bad local-header signature")
  const nameLen = view.getUint16(localHeaderOffset + 26, true)
  const extraLen = view.getUint16(localHeaderOffset + 28, true)
  const dataStart = localHeaderOffset + 30 + nameLen + extraLen
  const compressed = zip.subarray(dataStart, dataStart + compressedSize)

  if (compressionMethod === 0) {
    return compressed
  }
  if (compressionMethod === 8) {
    return inflateRaw(compressed)
  }
  throw new Error(`Unsupported compression method: ${compressionMethod}`)
}

function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolvePromise, rejectPromise) => {
    const stream = createInflateRaw()
    const chunks: Uint8Array[] = []
    stream.on("data", (c: Buffer) => chunks.push(new Uint8Array(c)))
    stream.on("end", () => {
      const totalLen = chunks.reduce((n, c) => n + c.length, 0)
      const out = new Uint8Array(totalLen)
      let off = 0
      for (const c of chunks) {
        out.set(c, off)
        off += c.length
      }
      resolvePromise(out)
    })
    stream.on("error", rejectPromise)
    stream.end(Buffer.from(input))
  })
}
