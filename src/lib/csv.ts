/**
 * Shared CSV Import / Export utilities.
 * Every page re-uses these two helpers so we avoid duplicating logic.
 *
 * Data exports are written in our proprietary encrypted ".kxv" format
 * (unreadable in Excel/Notepad, and unreadable by competitors — the decryption
 * key lives only on our server). Importing a .kxv decrypts via the backend
 * while signed in. Blank templates stay plain CSV so users can fill them in Excel.
 */
import { encryptExport, decryptExport, isEncryptedExport, needsServerDecrypt, downloadText } from './secureFile';
import { decryptSecureExport } from './backend';

// ─── EXPORT ─────────────────────────────────────────────────────────────────

// SECURITY: neutralize CSV/Excel formula injection. A cell beginning with
// = + - @ (or tab/CR) is interpreted as a formula by Excel/LibreOffice on open —
// e.g. =HYPERLINK(...) or =cmd|... — so we prefix such cells with a single quote.
function csvCell(raw: string): string {
  let v = raw.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v}"`;
}

/** Serialize rows to a CSV string. */
function buildCSV<T extends object>(data: T[], columns: { key: keyof T; label: string }[]): string {
  const header = columns.map((c) => csvCell(String(c.label))).join(',');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val instanceof Date) return `"${val.toISOString()}"`;
        if (val === null || val === undefined) return '""';
        return csvCell(String(val));
      })
      .join(','),
  );

  return [header, ...rows].join('\n');
}

/**
 * Export rows as an encrypted proprietary file (.kxv) \u2014 gibberish in Excel /
 * Notepad, but re-imports cleanly into this software. Falls back to plain CSV
 * only if Web Crypto is unavailable (so the user is never blocked).
 */
export function exportToCSV<T extends object>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  filename: string,
) {
  if (data.length === 0) return;
  const csv = buildCSV(data, columns);
  const date = new Date().toISOString().slice(0, 10);
  void encryptExport(csv)
    .then((cipher) => downloadText(`${filename}_${date}.kxv`, cipher))
    .catch(() => downloadText(`${filename}_${date}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;'));
}

// ─── IMPORT ─────────────────────────────────────────────────────────────────

/**
 * Open a file-picker, read a CSV (plain template) OR an encrypted .kxv export,
 * and return parsed rows as objects keyed by header. Encrypted files are
 * decrypted transparently.
 */
export function importFromCSV<T = Record<string, string>>(
  onData: (rows: T[]) => void,
  onError?: (err: string) => void,
) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt,.kxv';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        let text = evt.target?.result as string;
        // Our encrypted export → decrypt back to CSV before parsing.
        // KXV2 (envelope) files are decrypted by the server; legacy KXV1 locally.
        if (isEncryptedExport(text)) {
          try {
            text = needsServerDecrypt(text) ? await decryptSecureExport(text) : await decryptExport(text);
          } catch {
            onError?.('This file could not be read — you must be signed in to this software to import it.');
            return;
          }
        }
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
