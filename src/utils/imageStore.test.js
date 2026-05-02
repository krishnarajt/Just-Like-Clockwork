import test from 'node:test';
import assert from 'node:assert/strict';

import { addImage, getImages, mergeLapImageSources, saveImages } from './imageStore.js';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

test('addImage does not store duplicate local images', () => {
  installLocalStorage();
  addImage('lap-1', 'data:image/jpeg;base64,abc');
  addImage('lap-1', 'data:image/jpeg;base64,abc');

  assert.deepEqual(getImages('lap-1'), ['data:image/jpeg;base64,abc']);
});

test('mergeLapImageSources hides cloud copies uploaded from the same local lap', () => {
  installLocalStorage();
  saveImages('lap-1', ['data:image/jpeg;base64,local']);

  const merged = mergeLapImageSources('lap-1', [
    {
      imageName: 'lap_lap-1_img_0.jpg',
      url: 'https://cdn.example.test/uploaded-local.jpg?signature=abc',
    },
    {
      imageName: 'phone-photo.jpg',
      url: 'https://cdn.example.test/phone-photo.jpg?signature=def',
    },
  ]);

  assert.deepEqual(merged, [
    'data:image/jpeg;base64,local',
    'https://cdn.example.test/phone-photo.jpg?signature=def',
  ]);
});

test('mergeLapImageSources keeps cloud images when no local copy exists', () => {
  installLocalStorage();

  const merged = mergeLapImageSources('lap-1', [
    {
      imageName: 'lap_lap-1_img_0.jpg',
      url: 'https://cdn.example.test/uploaded-local.jpg?signature=abc',
    },
  ]);

  assert.deepEqual(merged, ['https://cdn.example.test/uploaded-local.jpg?signature=abc']);
});
