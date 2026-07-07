import { run } from "../tool-runner/index.ts"

const KEY = "HKCU\\Software\\Valve\\Steam"
const VALUE = "BigPictureInForeground"

export async function readBigPictureValue(): Promise<number> {
  const { stdout, code } = await run("reg.exe", ["QUERY", KEY, "/v", VALUE], { allowNonZero: true })
  if (code !== 0) return 0
  const match = /BigPictureInForeground\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(stdout)
  if (!match) return 0
  return parseInt(match[1]!, 16)
}
