// Standalone test for the GS1 parser. Run with: npx tsx src/lib/gs1.test.ts
// (the project has no test framework yet; tsx is already a dependency).
import assert from 'node:assert';
import { parseScannedCode, gtinMatches, decodeYYMMDD, toDateInputValue } from './gs1';

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

console.log('GS1 parser');

check('Code 1 — standard GS1 DataMatrix', () => {
  const p = parseScannedCode('010896400023515710BAF1761125070917270630');
  assert.equal(p.gtin, '08964000235157', `gtin=${p.gtin}`);
  assert.equal(p.batchNumber, 'BAF176', `batch=${p.batchNumber}`);
  assert.equal(p.manufactureDate && toDateInputValue(p.manufactureDate), '2025-07-09', `mfg=${p.manufactureDate}`);
  assert.equal(p.expiryDate && toDateInputValue(p.expiryDate), '2027-06-30', `exp=${p.expiryDate}`);
  assert.equal(p.isStructured, true);
});

check('Code 2 — FBR QR tail (robust subset)', () => {
  const p = parseScannedCode('02450490010896110154006710H58121730093021J92Y8QPU240AnafortanPlus80tab30sRs.950.00');
  assert.equal(p.mrp, 950, `mrp=${p.mrp}`);
  assert.ok(p.packSize && /80 tab/.test(p.packSize), `pack=${p.packSize}`);
  assert.ok(p.productName && /Anafortan\s*Plus/i.test(p.productName), `name=${p.productName}`);
  assert.equal(p.isStructured, true);
});

check('GS-separated batch parses exactly', () => {
  const p = parseScannedCode('0108964000235157\x1d10BAF176\x1d17270630');
  assert.equal(p.gtin, '08964000235157');
  assert.equal(p.batchNumber, 'BAF176');
  assert.equal(p.expiryDate && toDateInputValue(p.expiryDate), '2027-06-30');
});

check('symbology identifier ]d2 stripped', () => {
  const p = parseScannedCode(']d2010896400023515710BAF1761125070917270630');
  assert.equal(p.gtin, '08964000235157');
  assert.equal(p.batchNumber, 'BAF176');
});

check('decodeYYMMDD DD=00 → last day of month', () => {
  const d = decodeYYMMDD('270600');
  assert.equal(d && toDateInputValue(d), '2027-06-30');
});

check('gtinMatches EAN-13 ↔ GTIN-14', () => {
  assert.equal(gtinMatches('08964000235157', '8964000235157'), true);
  assert.equal(gtinMatches('08964000235157', '08964000235157'), true);
  assert.equal(gtinMatches('08964000235157', '1234567890123'), false);
});

check('plain EAN-13 is not structured', () => {
  const p = parseScannedCode('8964000235157');
  assert.equal(p.isStructured, false);
  assert.equal(p.gtin, undefined);
});

check('garbage never throws', () => {
  for (const s of ['', '   ', 'hello world', '@@@@', '01']) {
    const p = parseScannedCode(s);
    assert.equal(p.isStructured, false);
    assert.equal(p.raw, s);
  }
});

console.log(`\n${passed} checks passed`);
