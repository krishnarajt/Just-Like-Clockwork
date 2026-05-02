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
  } catch (e) {
    console.warn('Failed to save images to localStorage (possibly full):', e);
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

export function mergeLapImageSources(lapId, backendImages = []) {
  const localImages = getImages(String(lapId));
  const backendSources = Array.isArray(backendImages) ? backendImages : [];
  const uploadedLocalPrefix = `lap_${lapId}_img_`;

  const filteredBackendImages = backendSources
    .filter((image) => {
      if (localImages.length === 0) return true;
      return !getImageName(image).startsWith(uploadedLocalPrefix);
    })
    .map(getImageUrl)
    .filter(Boolean);

  return dedupeImageSources([...localImages, ...filteredBackendImages]);
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
    return;
  }
  images.push(base64Image);
  saveImages(lapId, images);
  // Notify any listening components (e.g. ImageAttachment) that images changed
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('clockwork-images-changed', { detail: { lapId } }));
  }
}

/**
 * Remove a single image from a lap by index
 * @param {string} lapId - The lap ID
 * @param {number} index - Image index to remove
 */
export function removeImage(lapId, index) {
  const images = getImages(lapId);
  images.splice(index, 1);
  saveImages(lapId, images);
}

/**
 * Clear all images from localStorage (for cleanup)
 */
export function clearAllImages() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(IMAGE_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}
