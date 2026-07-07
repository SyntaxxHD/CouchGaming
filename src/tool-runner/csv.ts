export function parseNirCsv(csv: string): Record<string, string>[] {
  const rows = splitCsvRows(csv)
  if (rows.length === 0) return []
  const header = rows[0]!.map(h => h.trim())
  const out: Record<string, string>[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    if (row.length === 1 && row[0]!.trim() === '') continue
    const rec: Record<string, string> = {}
    for (let c = 0; c < header.length; c++) {
      rec[header[c]!] = (row[c] ?? '').trim()
    }
    out.push(rec)
  }
  return out
}

function splitCsvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\r') continue
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
