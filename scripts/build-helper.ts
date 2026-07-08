#!/usr/bin/env bun
// Build the Rust display helper and stage it into `tools/`.
//
// On Windows CI this uses the pre-installed MSVC toolchain and produces a
// native `.exe`. On other platforms it tries `x86_64-pc-windows-gnu` which
// requires mingw-w64 to be installed for the link step; if not present, we
// emit a placeholder file so the Bun bundle graph resolves for local dev
// (the placeholder is NOT a working binary — never ship it).

import { mkdir, stat, writeFile, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dir, '..')
const crateDir = resolve(root, 'helper', 'couchgaming-display')
const toolsDir = resolve(root, 'tools')
const targetExe = join(toolsDir, 'couchgaming-display.exe')

await mkdir(toolsDir, { recursive: true })

const isWindows = process.platform === 'win32'
const rustTarget = isWindows ? 'x86_64-pc-windows-msvc' : 'x86_64-pc-windows-gnu'

console.log(`Building Rust helper for ${rustTarget}...`)

const cargo = Bun.spawn(
  ['cargo', 'build', '--release', '--target', rustTarget, '--manifest-path', join(crateDir, 'Cargo.toml')],
  { stdout: 'inherit', stderr: 'inherit' },
)
const code = await cargo.exited

if (code === 0) {
  const built = join(crateDir, 'target', rustTarget, 'release', 'couchgaming-display.exe')
  try {
    await stat(built)
    await copyFile(built, targetExe)
    console.log(`✓ ${targetExe}`)
    process.exit(0)
  } catch {
    console.error(`Rust build claimed success but produced no exe at ${built}`)
    process.exit(1)
  }
}

if (!isWindows) {
  console.warn('')
  console.warn('cargo build failed on non-Windows host.')
  console.warn('This is expected without mingw-w64 (brew install mingw-w64).')
  console.warn(`Writing a placeholder to ${targetExe} so local Bun bundles resolve.`)
  console.warn('DO NOT SHIP this bundle — CI produces the real binary.')
  console.warn('')
  await writeFile(targetExe, '# placeholder; CI overwrites this with the real Rust build\n')
  process.exit(0)
}

console.error('cargo build failed on Windows. See output above.')
process.exit(code)
