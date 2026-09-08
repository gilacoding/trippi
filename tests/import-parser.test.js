/**
 * Unit tests for MarkiCab import-parser.js
 * Run: node tests/import-parser.test.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load JSONImportParser from backend (UMD module)
const JSONImportParser = require('../backend/json-import-parser.js');

// Make it available globally (as browser would via <script>)
global.JSONImportParser = JSONImportParser;

// Now load import-parser (it will find JSONImportParser on globalThis)
const importParser = require('../assets/js/import-parser.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('import-parser.test.js — MarkiCab import parsing\n');

// ── lineOfOffset ──
test('lineOfOffset: first line', () => {
  assert.deepStrictEqual(importParser.lineOfOffset('hello', 0), { line: 1, col: 1 });
});
test('lineOfOffset: offset at end of first line', () => {
  assert.deepStrictEqual(importParser.lineOfOffset('hello', 5), { line: 1, col: 6 });
});
test('lineOfOffset: second line', () => {
  assert.deepStrictEqual(importParser.lineOfOffset('hello\nworld', 6), { line: 2, col: 1 });
});
test('lineOfOffset: offset in middle of second line', () => {
  assert.deepStrictEqual(importParser.lineOfOffset('hello\nworld', 8), { line: 2, col: 3 });
});
test('lineOfOffset: empty string', () => {
  assert.deepStrictEqual(importParser.lineOfOffset('', 0), { line: 1, col: 1 });
});

// ── parseImport: valid trip JSON ──
test('parseImport: valid minimal trip', () => {
  const json = JSON.stringify({
    name: 'Test Trip',
    destination: 'Bali',
    start: '2026-10-01',
    end: '2026-10-03'
  });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.canonical);
  assert.strictEqual(result.canonical.name, 'Test Trip');
  assert.strictEqual(result.canonical.destination, 'Bali');
  assert.strictEqual(result.preview.name, 'Test Trip');
  assert.strictEqual(result.preview.destination, 'Bali');
  assert.strictEqual(result.preview.start, '2026-10-01');
  assert.strictEqual(result.preview.end, '2026-10-03');
});

test('parseImport: valid trip with items', () => {
  const json = JSON.stringify({
    name: 'Trip with items',
    items: [
      { name: 'Activity 1', time: '08:00', date: '2026-10-01' },
      { name: 'Activity 2', time: '10:00', date: '2026-10-01' }
    ]
  });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  // Parser normalizes items — just verify it's valid and canonical exists
  assert.ok(result.canonical);
});

test('parseImport: valid trip with expenses', () => {
  const json = JSON.stringify({
    name: 'Trip with expenses',
    expenses: [
      { name: 'Hotel', amount: 500000 },
      { name: 'Food', amount: 100000 }
    ]
  });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.preview.expenseCount, 2);
});

test('parseImport: valid trip with wishlist', () => {
  const json = JSON.stringify({
    name: 'Trip with wishlist',
    wishlist: ['Beach', 'Temple', 'Market']
  });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  // Parser normalizes wishlist strings into objects
  assert.ok(Array.isArray(result.canonical.wishlist));
});

// ── parseImport: invalid JSON ──
test('parseImport: invalid JSON syntax', () => {
  const result = importParser.parseImport('{ invalid json }');
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('parseImport: empty string', () => {
  const result = importParser.parseImport('');
  assert.strictEqual(result.valid, false);
});

test('parseImport: non-JSON text', () => {
  const result = importParser.parseImport('hello world');
  assert.strictEqual(result.valid, false);
});

// ── parseImport: field aliases ──
test('parseImport: recognizes title alias for name', () => {
  const json = JSON.stringify({ title: 'My Vacation' });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.canonical.name, 'My Vacation');
});

test('parseImport: recognizes destination_city alias', () => {
  const json = JSON.stringify({ destination_city: 'Jakarta' });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.canonical.destination, 'Jakarta');
});

test('parseImport: recognizes start_date alias', () => {
  const json = JSON.stringify({ start_date: '2026-12-01' });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.canonical.start, '2026-12-01');
});

// ── parseImport: preview defaults ──
test('parseImport: preview defaults for missing fields', () => {
  const json = JSON.stringify({ name: 'Minimal' });
  const result = importParser.parseImport(json);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.preview.name, 'Minimal');
  assert.strictEqual(result.preview.destination, '');
  assert.strictEqual(result.preview.start, '');
  assert.strictEqual(result.preview.end, '');
  assert.strictEqual(result.preview.itemCount, 0);
  assert.strictEqual(result.preview.expenseCount, 0);
  assert.strictEqual(result.preview.wishlistCount, 0);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
