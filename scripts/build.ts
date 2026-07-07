#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const iconPath = resolve(root, 'assets', 'couchgaming.ico')
const outFile = resolve(root, 'dist', 'CouchGaming.exe')

const args = [
  'build',
  './src/main.ts',
  '--compile',
  '--target=bun-windows-x64',
  '--windows-hide-console',
  `--outfile=${outFile}`,
]

if (existsSync(iconPath)) {
  args.push(`--windows-icon=${iconPath}`)
} else {
  console.log(`(no icon at ${iconPath}, building without --windows-icon)`)
}

console.log(`bun ${args.join(' ')}`)
const proc = Bun.spawn(['bun', ...args], { cwd: root, stdout: 'inherit', stderr: 'inherit' })
const code = await proc.exited
process.exit(code)
