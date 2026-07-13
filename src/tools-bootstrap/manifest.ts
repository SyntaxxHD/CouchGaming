export interface ToolManifestEntry {
  filename: string
  sha256: string | null
  zipUrl: string
  memberInZip: string
}

export const TOOL_MANIFEST: readonly ToolManifestEntry[] = [
  {
    filename: 'MultiMonitorTool.exe',
    sha256: '99b472f85fd905d7ffea461f80362ca1ddfbb13b958f21b14d8c94b542d938da',
    zipUrl: 'https://www.nirsoft.net/utils/multimonitortool-x64.zip',
    memberInZip: 'MultiMonitorTool.exe',
  },
  {
    filename: 'SoundVolumeView.exe',
    sha256: '4d7fde058ed5f4deeb34da52a99bd401add6e80a42dfed3c075516c31d2af101',
    zipUrl: 'https://www.nirsoft.net/utils/soundvolumeview-x64.zip',
    memberInZip: 'SoundVolumeView.exe',
  },
] as const
