import { readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { paths } from "../config/paths.ts"
import { run } from "../tool-runner/index.ts"
import { parseNirCsv } from "../tool-runner/csv.ts"

export interface AudioDevice {
  commandLineId: string
  itemId: string
  name: string
  deviceName: string
  direction: "Render" | "Capture" | ""
  type: string
  isDefaultRender: boolean
  isDefaultMultimedia: boolean
  isDefaultCommunications: boolean
  disabled: boolean
}

export async function enumerate(): Promise<AudioDevice[]> {
  const tmp = join(tmpdir(), `svv-${process.pid}-${Date.now()}.csv`)
  try {
    await run(paths.soundVolumeView, ["/scomma", tmp])
    const csv = await readFile(tmp, "utf8")
    return parseNirCsv(csv)
      .map(toAudioDevice)
      .filter(d => d.type === "Device")
  } finally {
    try {
      await unlink(tmp)
    } catch {
      /* ignore */
    }
  }
}

export async function getDefaultRender(): Promise<AudioDevice | null> {
  const devices = await enumerate()
  return devices.find(d => d.direction === "Render" && d.isDefaultMultimedia) ?? null
}

export async function setDefault(commandLineId: string): Promise<void> {
  await run(paths.soundVolumeView, ["/SetDefault", commandLineId, "all"])
}

function toAudioDevice(row: Record<string, string>): AudioDevice {
  const direction = row["Direction"] as AudioDevice["direction"]
  const defaultFlag = (row["Default"] ?? "").toLowerCase()
  const defaultMm = (row["Default Multimedia"] ?? "").toLowerCase()
  const defaultCom = (row["Default Communications"] ?? "").toLowerCase()
  return {
    commandLineId: row["Command-Line Friendly ID"] ?? "",
    itemId: row["Item ID"] ?? "",
    name: row["Name"] ?? "",
    deviceName: row["Device Name"] ?? "",
    direction: direction === "Render" || direction === "Capture" ? direction : "",
    type: row["Type"] ?? "",
    isDefaultRender: defaultFlag === "render" || defaultFlag === "yes",
    isDefaultMultimedia: defaultMm === "render" || defaultMm === "yes",
    isDefaultCommunications: defaultCom === "render" || defaultCom === "yes",
    disabled: (row["Device State"] ?? "").toLowerCase() === "disabled",
  }
}
