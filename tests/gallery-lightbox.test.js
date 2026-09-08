/**
 * Unit tests for MarkiCab gallery-lightbox.js
 * Run: node tests/gallery-lightbox.test.js
 */
const assert = require('assert');

// Mock DOM environment for Node.js
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

// Load gallery-lightbox
const gallery = require('../assets/js/gallery-lightbox.js');

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

// Clean up lightbox between tests
function cleanup() {
  const lb = document.getElementById('galleryLightbox');
  if (lb) lb.remove();
  gallery.setOnNavigate(null);
}

console.log('gallery-lightbox.test.js — MarkiCab gallery lightbox\n');

const mockItems = [
  { id: '1', signed_url: 'https://example.com/img1.jpg', mime_type: 'image/jpeg', caption: 'Photo 1' },
  { id: '2', signed_url: 'https://example.com/img2.jpg', mime_type: 'image/jpeg', caption: 'Photo 2' },
  { id: '3', signed_url: 'https://example.com/vid1.mp4', mime_type: 'video/mp4', caption: 'Video 1' }
];

// ── open ──
test('open: creates lightbox element', () => {
  cleanup();
  gallery.open(0, mockItems);
  const lb = document.getElementById('galleryLightbox');
  assert.ok(lb, 'lightbox should exist');
  assert.ok(lb.classList.contains('active'), 'should be active');
});

test('open: sets dataset.idx', () => {
  cleanup();
  gallery.open(1, mockItems);
  const lb = document.getElementById('galleryLightbox');
  assert.strictEqual(lb.dataset.idx, '1');
});

test('open: does nothing with empty items', () => {
  cleanup();
  gallery.open(0, []);
  // Should not throw
});

// ── close ──
test('close: removes active class', () => {
  cleanup();
  gallery.open(0, mockItems);
  gallery.close();
  const lb = document.getElementById('galleryLightbox');
  assert.ok(!lb.classList.contains('active'));
});

// ── navigate ──
test('navigate: next wraps around', () => {
  cleanup();
  gallery.open(0, mockItems);
  gallery.navigate(1, mockItems);
  const lb = document.getElementById('galleryLightbox');
  assert.strictEqual(lb.dataset.idx, '1');
});

test('navigate: prev wraps around', () => {
  cleanup();
  gallery.open(0, mockItems);
  gallery.navigate(-1, mockItems);
  const lb = document.getElementById('galleryLightbox');
  assert.strictEqual(lb.dataset.idx, '2'); // wraps to last
});

test('navigate: forward to end wraps to 0', () => {
  cleanup();
  gallery.open(2, mockItems);
  gallery.navigate(1, mockItems);
  const lb = document.getElementById('galleryLightbox');
  assert.strictEqual(lb.dataset.idx, '0');
});

// ── updateContent ──
test('updateContent: sets image src for image items', () => {
  cleanup();
  gallery.open(0, mockItems);
  const lb = document.getElementById('galleryLightbox');
  const img = lb.querySelector('#galleryLbImg');
  assert.strictEqual(img.src, 'https://example.com/img1.jpg');
});

test('updateContent: sets caption', () => {
  cleanup();
  gallery.open(0, mockItems);
  const lb = document.getElementById('galleryLightbox');
  const caption = lb.querySelector('#galleryLbCaption');
  assert.strictEqual(caption.textContent, 'Photo 1');
});

test('updateContent: handles video items', () => {
  cleanup();
  gallery.open(2, mockItems);
  const lb = document.getElementById('galleryLightbox');
  const video = lb.querySelector('#galleryLbVideo');
  assert.ok(video, 'video element should exist');
  assert.strictEqual(video.src, 'https://example.com/vid1.mp4');
});

// ── setOnNavigate ──
test('setOnNavigate: callback fires on navigate', () => {
  cleanup();
  let navigatedTo = null;
  gallery.setOnNavigate((idx) => { navigatedTo = idx; });
  gallery.open(0, mockItems);
  gallery.navigate(1, mockItems);
  assert.strictEqual(navigatedTo, 1);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
