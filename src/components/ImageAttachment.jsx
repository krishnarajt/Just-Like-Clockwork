import { useState, useEffect, useRef, useCallback } from 'react';
import { getImages, addImage, removeImage } from '../utils/imageStore';
import PropTypes from 'prop-types';

export default function ImageAttachment({ lapId }) {
  const [images, setImages] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Load images from storage
  useEffect(() => {
    setImages(getImages(lapId));
  }, [lapId]);

  // Convert file/blob to base64 and store
  const handleImageData = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      // Resize to save localStorage space
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = (h / w) * maxDim;
            w = maxDim;
          } else {
            w = (w / h) * maxDim;
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        addImage(lapId, compressed);
        setImages(getImages(lapId));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [lapId]);

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) handleImageData(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // Handle camera capture
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setShowCamera(true);
      // Wait for video ref to be available
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.warn('Camera access denied:', err);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    addImage(lapId, dataUrl);
    setImages(getImages(lapId));
    stopCamera();
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  // Handle remove
  const handleRemove = (index) => {
    removeImage(lapId, index);
    setImages(getImages(lapId));
    setPreviewImage(null);
  };

  return (
    <div className="mt-2">
      {/* Action buttons */}
      <div className="flex gap-2 items-center flex-wrap">
        <button
          className="btn btn-xs btn-ghost text-base-content/60 gap-1"
          onClick={() => fileInputRef.current?.click()}
          title="Upload image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Upload
        </button>
        <button
          className="btn btn-xs btn-ghost text-base-content/60 gap-1"
          onClick={startCamera}
          title="Take photo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Camera
        </button>
        <span className="text-xs text-base-content/40 italic">or paste image in notes</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Camera view */}
      {showCamera && (
        <div className="mt-2 relative rounded-lg overflow-hidden border border-base-300">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full max-h-48 object-cover"
          />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            <button className="btn btn-sm btn-primary" onClick={capturePhoto}>
              Capture
            </button>
            <button className="btn btn-sm btn-ghost bg-base-100/80" onClick={stopCamera}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {images.map((img, i) => (
            <div
              key={i}
              className="relative group cursor-pointer"
              onClick={() => setPreviewImage(img)}
            >
              <img
                src={img}
                alt={`Attachment ${i + 1}`}
                className="w-14 h-14 object-cover rounded-lg border border-base-300 hover:border-primary transition-colors"
              />
              <button
                className="absolute -top-1.5 -right-1.5 btn btn-circle btn-xs btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(i);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Full preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[80vh] rounded-xl object-contain"
            />
            <button
              className="absolute -top-3 -right-3 btn btn-circle btn-sm btn-error"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

ImageAttachment.propTypes = {
  lapId: PropTypes.string.isRequired,
};
