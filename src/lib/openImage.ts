// Opens an uploaded image / PDF in a new tab.
//
// Why this helper exists:
// We store uploaded scans (prescriptions, supplier invoices, payment proofs) as
// data URLs inside the JSON record. A naive `<a href={dataUrl} target="_blank">`
// works for small files, but Chrome / Edge / Firefox cap address-bar URLs at
// roughly 32 KB. A compressed photo data URL routinely exceeds 200 KB, so the
// link opens a blank tab with the truncated URL in the address bar (the bug
// the user hit).
//
// Fix: decode the data URL into a Blob and open the resulting blob: URL, which
// is just a short uuid the browser keeps in memory. This always renders the
// image / PDF reliably.

export function openDataUrlInNewTab(dataUrl: string, fileName?: string): void {
  if (!dataUrl) return;

  // Non-data URLs (http://, blob:) — just open them directly.
  if (!dataUrl.startsWith('data:')) {
    window.open(dataUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    // Parse data URL: data:<mime>[;base64],<payload>
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) {
      throw new Error('Malformed data URL');
    }
    const header = dataUrl.slice(5, commaIdx); // strip "data:"
    const payload = dataUrl.slice(commaIdx + 1);
    const isBase64 = header.includes(';base64');
    const rawMime = (header.split(';')[0] || 'application/octet-stream').toLowerCase();

    // SECURITY: a stored attachment whose MIME is text/html or image/svg+xml would,
    // when opened as a blob: URL (same origin), execute attacker JavaScript with the
    // app's session. Only ever RENDER a strict allowlist of inert types; force a
    // download (with a neutralized octet-stream type) for everything else so nothing
    // scriptable is ever navigated to in-origin.
    const RENDERABLE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']);
    const mime = RENDERABLE.has(rawMime) ? rawMime : 'application/octet-stream';

    let bytes: Uint8Array;
    if (isBase64) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }

    // Cast through BlobPart — newer TS lib.dom types reject Uint8Array directly
    // because its underlying buffer is widened to ArrayBufferLike.
    const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);

    // For images, wrap in a tiny HTML viewer so the image is centered with a
    // dark background and clickable to close. For PDFs, navigate directly so
    // the browser PDF viewer takes over.
    if (mime.startsWith('image/')) {
      const win = window.open('', '_blank', 'noopener,noreferrer');
      if (!win) {
        // Pop-up blocked — fall back to a direct nav
        window.location.href = url;
        return;
      }
      const safeName = (fileName || 'attachment').replace(/[<>"&]/g, '');
      win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${safeName}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0f172a; color: #fff; font-family: system-ui, sans-serif; }
  .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
  img { max-width: 100%; max-height: 95vh; object-fit: contain; box-shadow: 0 4px 20px rgba(0,0,0,0.6); border-radius: 6px; }
  .bar { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; }
  .btn { background: #fff; color: #0f172a; border: 0; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); text-decoration: none; }
  .btn:hover { background: #f1f5f9; }
</style></head><body>
  <div class="bar">
    <a class="btn" href="${url}" download="${safeName}">⬇ Download</a>
    <button class="btn" onclick="window.print()">🖨️ Print</button>
    <button class="btn" onclick="window.close()">✕ Close</button>
  </div>
  <div class="wrap"><img src="${url}" alt="${safeName}"></div>
</body></html>`);
      win.document.close();
      // Revoke after a delay — the new window has loaded the blob by then.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else if (mime === 'application/pdf') {
      // PDFs go straight to the browser viewer (inert).
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) {
        // Pop-up blocked — same-tab nav as fallback
        window.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      // Unknown / non-allowlisted type (e.g. an attacker-stored text/html or SVG):
      // never navigate to it. Force a download as an opaque octet-stream so it
      // can't run in our origin.
      const a = document.createElement('a');
      a.href = url;
      a.download = (fileName || 'attachment').replace(/[<>"&/\\]/g, '');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (err) {
    console.error('Failed to open data URL:', err);
    // Last-ditch fallback: try the original href
    window.open(dataUrl, '_blank', 'noopener,noreferrer');
  }
}
