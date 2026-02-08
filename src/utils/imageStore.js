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
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
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
  images.push(base64Image);
  saveImages(lapId, images);
  // Notify any listening components (e.g. ImageAttachment) that images changed
  window.dispatchEvent(new CustomEvent('clockwork-images-changed', { detail: { lapId } }));
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
