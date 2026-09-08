/**
 * Unit tests for MarkiCab utils.js
 * Run: node tests/utils.test.js
 */
const assert = require('assert');
const utils = require('../assets/js/utils.js');

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

console.log('utils.test.js — MarkiCab pure utilities\n');

// ── esc ──
test('esc: escapes ampersand', () => {
  assert.strictEqual(utils.esc('a&b'), 'a&amp;b');
});
test('esc: escapes less-than', () => {
  assert.strictEqual(utils.esc('a<b'), 'a&lt;b');
});
test('esc: escapes greater-than', () => {
  assert.strictEqual(utils.esc('a>b'), 'a&gt;b');
});
test('esc: escapes single quote', () => {
  assert.strictEqual(utils.esc("a'b"), 'a&#39;b');
});
test('esc: escapes double quote', () => {
  assert.strictEqual(utils.esc('a"b'), 'a&quot;b');
});
test('esc: handles null/undefined', () => {
  assert.strictEqual(utils.esc(null), '');
  assert.strictEqual(utils.esc(undefined), '');
});
test('esc: passes through safe strings', () => {
  assert.strictEqual(utils.esc('hello world'), 'hello world');
});

// ── money ──
test('money: formats IDR currency', () => {
  assert.match(utils.money(1000000), /Rp\s?1\.000\.000/);
});
test('money: handles zero', () => {
  assert.match(utils.money(0), /Rp\s?0/);
});
test('money: handles string number', () => {
  assert.match(utils.money('50000'), /Rp\s?50\.000/);
});
test('money: handles null/undefined', () => {
  assert.match(utils.money(null), /Rp\s?0/);
  assert.match(utils.money(undefined), /Rp\s?0/);
});

// ── dateText ──
test('dateText: formats ISO date', () => {
  assert.strictEqual(utils.dateText('2026-10-01'), '1 Okt 2026');
});
test('dateText: handles empty string', () => {
  assert.strictEqual(utils.dateText(''), '');
});
test('dateText: handles null', () => {
  assert.strictEqual(utils.dateText(null), '');
});
test('dateText: handles invalid date', () => {
  assert.strictEqual(utils.dateText('invalid'), '');
});

// ── normalizeLink ──
test('normalizeLink: prepends https:// if no scheme', () => {
  assert.strictEqual(utils.normalizeLink('example.com'), 'https://example.com');
});
test('normalizeLink: keeps http://', () => {
  assert.strictEqual(utils.normalizeLink('http://example.com'), 'http://example.com');
});
test('normalizeLink: keeps https://', () => {
  assert.strictEqual(utils.normalizeLink('https://example.com'), 'https://example.com');
});
test('normalizeLink: trims whitespace', () => {
  assert.strictEqual(utils.normalizeLink('  example.com  '), 'https://example.com');
});
test('normalizeLink: handles empty string', () => {
  assert.strictEqual(utils.normalizeLink(''), '');
});

// ── daysBetween ──
test('daysBetween: generates inclusive date range', () => {
  const result = utils.daysBetween('2026-10-01', '2026-10-03');
  assert.deepStrictEqual(result, ['2026-10-01', '2026-10-02', '2026-10-03']);
});
test('daysBetween: handles same start and end', () => {
  const result = utils.daysBetween('2026-10-01', '2026-10-01');
  assert.deepStrictEqual(result, ['2026-10-01']);
});
test('daysBetween: handles empty input', () => {
  assert.deepStrictEqual(utils.daysBetween('', ''), []);
  assert.deepStrictEqual(utils.daysBetween(null, null), []);
});

// ── categoryIcon ──
test('categoryIcon: returns emoji for known categories', () => {
  assert.strictEqual(utils.categoryIcon('Makan'), '🍜');
  assert.strictEqual(utils.categoryIcon('Transport'), '🚗');
  assert.strictEqual(utils.categoryIcon('Hotel'), '🛏️');
  assert.strictEqual(utils.categoryIcon('Tiket'), '🎟️');
  assert.strictEqual(utils.categoryIcon('Belanja'), '🛍️');
  assert.strictEqual(utils.categoryIcon('Lainnya'), '•');
});
test('categoryIcon: returns bullet for unknown', () => {
  assert.strictEqual(utils.categoryIcon('Unknown'), '•');
});

// ── isPlaceholderName ──
test('isPlaceholderName: detects placeholders', () => {
  assert.strictEqual(utils.isPlaceholderName('guest'), true);
  assert.strictEqual(utils.isPlaceholderName('user'), true);
  assert.strictEqual(utils.isPlaceholderName('anonymous'), true);
  assert.strictEqual(utils.isPlaceholderName('creator'), true);
  assert.strictEqual(utils.isPlaceholderName('owner'), true);
  assert.strictEqual(utils.isPlaceholderName('member'), true);
  assert.strictEqual(utils.isPlaceholderName('anggota'), true);
});
test('isPlaceholderName: detects null/undefined/empty', () => {
  assert.strictEqual(utils.isPlaceholderName(null), true);
  assert.strictEqual(utils.isPlaceholderName(undefined), true);
  assert.strictEqual(utils.isPlaceholderName(''), true);
});
test('isPlaceholderName: allows real names', () => {
  assert.strictEqual(utils.isPlaceholderName('Gilang'), false);
  assert.strictEqual(utils.isPlaceholderName('Budi'), false);
});

// ── humanErr ──
test('humanErr: translates invalid login', () => {
  assert.strictEqual(utils.humanErr({ message: 'Invalid login credentials' }), 'Email atau password salah.');
});
test('humanErr: translates user already registered', () => {
  assert.strictEqual(utils.humanErr({ message: 'User already registered' }), 'Email sudah terdaftar. Coba masuk.');
});
test('humanErr: translates password too short', () => {
  assert.strictEqual(utils.humanErr({ message: 'Password should be at least 6 characters.' }), 'Password minimal 6 karakter.');
});
test('humanErr: translates invalid email', () => {
  assert.strictEqual(utils.humanErr({ message: 'Unable to validate email address.' }), 'Format email tidak valid.');
});
test('humanErr: passes through unknown errors', () => {
  assert.strictEqual(utils.humanErr({ message: 'Something else' }), 'Something else');
});
test('humanErr: handles empty/null', () => {
  assert.strictEqual(utils.humanErr({}), 'Terjadi kesalahan. Coba lagi.');
  assert.strictEqual(utils.humanErr(null), 'Terjadi kesalahan. Coba lagi.');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
