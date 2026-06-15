// Client-side image compression for files we store inline as data URLs
// (prescription scans, supplier invoices, payment proofs, company logos).
//
// We re-encode JPEG/PNG at quality 0.75 capped at 1600px on the long side —
// keeps text legible while typically shrinking 5–10×. PDFs aren't re-encoded
// (would need a heavy lib); they pass through as-is.

const MAX_DIM_DEFAULT = 1600;
const QUALITY_DEFAULT = 0.75;

export interface CompressOptions {
  maxDim?: number;
  quality?: number;
}

export async function compressImageFile(file: File, opts: CompressOptions = {}): Promise<string> {
  const maxDim = opts.maxDim ?? MAX_DIM_DEFAULT;
  const quality = opts.quality ?? QUALITY_DEFAULT;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image decode failed'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // White background so PNGs with transparency don't go black after JPEG conversion
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

export interface UploadResult {
  dataUrl: string;
  /** Original file size in bytes */
  beforeBytes: number;
  /** Final stored size in bytes (≈ base64 payload size) */
  afterBytes: number;
  /** True if compressed; false for PDFs / failures */
  compressed: boolean;
}

/**
 * Accept a user-picked file → return a data URL ready to store.
 * Compresses images, passes PDFs through. Rejects anything else.
 */
export async function processUploadedFile(
  file: File,
  opts: CompressOptions & { maxFileBytes?: number } = {},
): Promise<UploadResult> {
  const maxFileBytes = opts.maxFileBytes ?? 15 * 1024 * 1024;
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
    throw new Error('Please upload an image or PDF');
  }
  if (file.size > maxFileBytes) {
    throw new Error(`File must be under ${Math.round(maxFileBytes / 1024 / 1024)} MB`);
  }
  if (file.type === 'application/pdf') {
    const dataUrl = await readFileAsDataUrl(file);
    return { dataUrl, beforeBytes: file.size, afterBytes: file.size, compressed: false };
  }
  const dataUrl = await compressImageFile(file, opts);
  // base64 payload size ≈ 4/3 × bytes; subtract the header
  const after = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 3 / 4);
  return { dataUrl, beforeBytes: file.size, afterBytes: after, compressed: true };
}
