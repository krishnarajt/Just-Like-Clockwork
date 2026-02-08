import { saveAs } from 'file-saver';
import { getImages } from '../../utils/imageStore';

function downloadJSON(laps) {
  // Convert the laps array to a JSON string
  let jsonString = JSON.stringify(laps, null, 2);

  // Check if any lap has images
  const allImages = [];
  // Reverse to get chronological order (oldest first) matching lap numbering
  const chronologicalLaps = [...laps].reverse();
  chronologicalLaps.forEach((lap, index) => {
    const images = getImages(lap.id);
    images.forEach((img, imgIdx) => {
      allImages.push({
        lapIndex: index + 1,
        imgIndex: imgIdx + 1,
        data: img,
      });
    });
  });

  if (allImages.length === 0) {
    // No images - export plain JSON
    let blob = new Blob([jsonString], {
      type: 'application/json;charset=utf-8;',
    });
    saveAs(blob, 'laps.json');
  } else {
    // Has images - export as zip containing JSON + images folder
    import('jszip').then(({ default: JSZip }) => {
      const zip = new JSZip();
      zip.file('laps.json', jsonString);

      const imagesFolder = zip.folder('images');
      allImages.forEach(({ lapIndex, imgIndex, data }) => {
        // Extract base64 data and determine extension
        let ext = 'jpg';
        let base64Data = data;
        if (data.includes('data:image/png')) {
          ext = 'png';
        }
        // Strip the data URL prefix
        if (data.includes(',')) {
          base64Data = data.split(',')[1];
        }
        imagesFolder.file(`lap_${lapIndex}_img_${imgIndex}.${ext}`, base64Data, { base64: true });
      });

      zip.generateAsync({ type: 'blob' }).then((blob) => {
        saveAs(blob, 'laps_export.zip');
      });
    });
  }
}

export default downloadJSON;
