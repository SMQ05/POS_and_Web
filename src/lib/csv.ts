/**
 * Shared CSV Import / Export utilities.
 * Every page re-uses these two helpers so we avoid duplicating logic.
 */

// ─── EXPORT ─────────────────────────────────────────────────────────────────

/** Convert an array of objects to a CSV Blob and trigger a download. */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  filename: string,
) {
  if (data.length === 0) return;

  const header = columns.map((c) => `"${String(c.label)}"`).join(',');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val instanceof Date) return `"${val.toISOString()}"`;
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(','),
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── IMPORT ─────────────────────────────────────────────────────────────────

/** Open a file-picker, read a CSV, and return parsed rows as objects keyed by header. */
export function importFromCSV<T = Record<string, string>>(
  onData: (rows: T[]) => void,
  onError?: (err: string) => void,
) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          onError?.('CSV file must have a header row and at least one data row.');
          return;
        }
        const headers = parseCSVLine(lines[0]);
        const rows: T[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            obj[h.trim()] = (values[idx] ?? '').trim();
          });
          rows.push(obj as unknown as T);
        }
        onData(rows);
      } catch {
        onError?.('Failed to parse the CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/** Parse a single CSV line respecting quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ─── TEMPLATE DOWNLOAD ─────────────────────────────────────────────────────

/** Download a blank CSV template with only the header row. */
export function downloadCSVTemplate(
  columns: { key: string; label: string }[],
  filename: string,
) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const blob = new Blob(['\uFEFF' + header + '\n'], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_template.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
