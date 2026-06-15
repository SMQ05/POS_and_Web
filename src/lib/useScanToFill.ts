import { useState } from 'react';
import { parseScannedCode, type ParsedScan } from '@/lib/gs1';

/**
 * Buffered scan input for stock-entry forms. Accumulates USB-scanner keystrokes
 * in a text input; on Enter it parses the raw buffer (GS separator preserved)
 * and hands the structured result to `onParsed`, then clears. Forms decide what
 * to do with the parsed batch / expiry / MRP.
 */
export function useScanToFill(onParsed: (p: ParsedScan) => void) {
  const [buffer, setBuffer] = useState('');
  const inputProps = {
    value: buffer,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setBuffer(e.target.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const raw = buffer;
        if (!raw.trim()) return;
        onParsed(parseScannedCode(raw));
        setBuffer('');
      }
    },
  };
  return { buffer, setBuffer, inputProps };
}
