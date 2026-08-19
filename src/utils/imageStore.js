// Image storage utility
// Stores images in localStorage keyed by lap ID
// This will be replaced with API calls to a backend later

const IMAGE_PREFIX = 'clockwork_img_';

/**
 * Save images for a specific lap
 * @param {string} lapId - The lap ID
 * @param {string[]} images - Array of base64 image strings
 */
export function saveImages(lapId, images) {
  try {
    localStorage.setItem(IMAGE_PREFIX + lapId, JSON.stringify(images));
    return true;
  } catch (e) {
    // Returns false rather than only warning: base64 images are large enough to
    // fill the ~5MB quota, and callers need to tell the user the attachment did
    // not save instead of showing a thumbnail that vanishes on reload.
    console.warn('Failed to save images to localStorage (possibly full):', e);
    return false;
  }
}

/**
 * Get images for a specific lap
 * @param {string} lapId - The lap ID
 * @returns {string[]} Array of base64 image strings
 */
export function getImages(lapId) {
  try {
    const data = localStorage.getItem(IMAGE_PREFIX + lapId);
    const images = data ? JSON.parse(data) : [];
    return dedupeImageSources(Array.isArray(images) ? images : []);
  } catch {
    return [];
  }
}

export function getImageUrl(image) {
  if (!image) return '';
  if (typeof image === 'string') return image;
  return image.url || image.presignedUrl || image.presigned_url || '';
}

export function getImageName(image) {
  if (!image || typeof image === 'string') return '';
  return image.imageName || image.image_name || image.name || image.filename || '';
}

export function getImageFingerprint(image) {
  const url = getImageUrl(image);
  if (!url) return '';

  if (url.startsWith('data:')) {
    return `${url.length}:${url.slice(0, 96)}:${url.slice(-96)}`;
  }

  try {
    const parsedUrl = new URL(url);
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch {
    return url.split('?')[0];
  }
}

export function dedupeImageSources(images = []) {
  const seen = new Set();
  return images.filter((image) => {
    const url = getImageUrl(image);
    if (!url) return false;

    const fingerprint = getImageFingerprint(url);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

/**
 * A short, filename-safe id derived from an image's own bytes.
 * Uploaded objects are named with it, which is what lets a cloud image be
 * matched back to the local copy it came from. The previous naming used the
 * image's position in the array (`_img_0`), and those positions shift whenever
 * one is deleted, so a cloud copy could no longer be identified.
 */
export function localImageId(image) {
  const fingerprint = getImageFingerprint(image);
  if (!fingerprint) return '';
  let hash = 5381;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = ((hash << 5) + hash + fingerprint.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function uploadedImageName(lapId, image) {
  return `lap_${lapId}_${localImageId(image)}.jpg`;
}

/** True when this backend image is the cloud copy of one of `localImages`. */
function isCloudCopyOfLocal(backendImage, lapId, localIds) {
  const name = getImageName(backendImage);
  if (!name) return false;
  if ([...localIds].some((id) => id && name === `lap_${lapId}_${id}.jpg`)) return true;
  // Legacy positional names from before content-addressed uploads. These cannot
  // be matched to a specific local image, so treat any of them as a duplicate
  // while local copies remain.
  return localIds.size > 0 && name.startsWith(`lap_${lapId}_img_`);
}

export function mergeLapImageSources(lapId, backendImages = []) {
  const localImages = getImages(String(lapId));
  const backendSources = Array.isArray(backendImages) ? backendImages : [];
  const localIds = new Set(localImages.map(localImageId).filter(Boolean));

  const filteredBackendImages = backendSources
    .filter((image) => !isCloudCopyOfLocal(image, lapId, localIds))
    .map(getImageUrl)
    .filter(Boolean);

  return dedupeImageSources([...localImages, ...filteredBackendImages]);
}

/**
 * Find the backend image that is the cloud copy of a given local image, so the
 * caller can delete both. Without this, deleting a thumbnail removed only the
 * local copy and the cloud one reappeared on the next render.
 */
export function findCloudCopy(lapId, localImage, backendImages = []) {
  const id = localImageId(localImage);
  if (!id) return null;
  const expected = `lap_${lapId}_${id}.jpg`;
  return (Array.isArray(backendImages) ? backendImages : []).find(
    (image) => getImageName(image) === expected,
  ) || null;
}

/** Move a lap's attachments to a new lap id, used when splitting or merging. */
export function moveImages(fromLapId, toLapId) {
  if (String(fromLapId) === String(toLapId)) return;
  const images = getImages(String(fromLapId));
  if (images.length === 0) return;
  const existing = getImages(String(toLapId));
  saveImages(String(toLapId), dedupeImageSources([...existing, ...images]));
  deleteImages(String(fromLapId));
}

/**
 * Delete images for a specific lap
 * @param {string} lapId - The lap ID
 */
export function deleteImages(lapId) {
  localStorage.removeItem(IMAGE_PREFIX + lapId);
}

/**
 * Add a single image to a lap
 * @param {string} lapId - The lap ID
 * @param {string} base64Image - Base64 encoded image string
 */
export function addImage(lapId, base64Image) {
  const images = getImages(lapId);
  const fingerprint = getImageFingerprint(base64Image);
  if (fingerprint && images.some((image) => getImageFingerprint(image) === fingerprint)) {
    return true;
  }
  images.push(base64Image);
  const saved = saveImages(lapId, images);
  // Notify any listening components (e.g. ImageAttachment) that images changed
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('clockwork-images-changed', { detail: { lapId } }));
  }
  return saved;
}

/**
 * Remove a single image from a lap by index
 * @param {string} lapId - The lap ID
 * @param {number} index - Image index to remove
 */
export function removeImage(lapId, index) {
  const images = getImages(lapId);
  const [removed] = images.splice(index, 1);
  saveImages(lapId, images);
  // Returned so the caller can delete the cloud copy too.
  return removed ?? null;
}

/**
 * Clear all images from localStorage (for cleanup)
 */
export function clearAllImages() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(IMAGE_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}
