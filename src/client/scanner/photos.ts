import type { Product } from "../../shared/scan";

// Crop the submitted frame, never the newer frame playing during recognition.
export async function productPhotos(frame: string, products: Product[]) {
  const photos = new Map<string, string>();
  if (!products.length) return photos;
  const image = new Image();
  image.src = frame;
  try {
    await image.decode();
  } catch {
    return photos;
  }
  for (const product of products) {
    const b = product.box,
      margin = 0.025;
    const x = Math.max(0, b.x - margin) * image.naturalWidth;
    const y = Math.max(0, b.y - margin) * image.naturalHeight;
    const width = Math.min(
      image.naturalWidth - x,
      (b.width + 2 * margin) * image.naturalWidth,
    );
    const height = Math.min(
      image.naturalHeight - y,
      (b.height + 2 * margin) * image.naturalHeight,
    );
    if (width <= 0 || height <= 0) continue;
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(
      image,
      x,
      y,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    for (const quality of [0.8, 0.6, 0.4, 0.25]) {
      const photo = canvas.toDataURL("image/jpeg", quality);
      if (
        photo.startsWith("data:image/jpeg;base64,") &&
        photo.length <= 40000
      ) {
        photos.set(product.id, photo);
        break;
      }
    }
  }
  return photos;
}
