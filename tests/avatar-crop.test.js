// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert');
const AvatarCrop = require('../assets/js/avatar-crop.js');
const { computeFit, clampOffset, SIZE } = AvatarCrop;

test('computeFit: portrait image covers circle at zoom 1', () => {
  const f = computeFit(900, 1600, 0, 1);
  assert.ok(f.drawW >= SIZE && f.drawH >= SIZE, 'must cover stage');
  assert.strictEqual(Math.round(f.rw), 900);
});
test('computeFit: zoom 2 doubles scale', () => {
  const a = computeFit(1200, 800, 0, 1), b = computeFit(1200, 800, 0, 2);
  assert.ok(Math.abs(b.scale / a.scale - 2) < 1e-9);
});
test('computeFit: 90deg swaps bounding box', () => {
  const f0 = computeFit(1200, 800, 0, 1), f90 = computeFit(1200, 800, 90, 1);
  assert.strictEqual(f90.rw, 800); assert.strictEqual(f90.rh, 1200);
  assert.ok(Math.abs(f0.scale - f90.scale) < 1e-9, 'cover scale invariant under 90 rotation');
});
test('clampOffset: keeps circle covered (no empty edges)', () => {
  const o = clampOffset({ x: 9999, y: -9999 }, 560, 560);
  assert.strictEqual(o.x, (SIZE - 560) / 2 * -1);
  assert.ok(Math.abs(o.y - (SIZE - 560) / 2) < 1e-9);
});
test('clampOffset: covers exactly at min offset', () => {
  const o = clampOffset({ x: -1000, y: 0 }, 560, 560);
  assert.strictEqual(o.x, (SIZE - 560) / 2); // == -140; right edge at 140+280=... consistent cover
});
