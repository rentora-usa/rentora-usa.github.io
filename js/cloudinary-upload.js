import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";

// Same 10MB courtesy check as before — Cloudinary's free tier itself
// allows larger files, this is just to keep uploads fast and give a quick
// error instead of a long wait on a huge phone photo.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function uploadsConfigured() {
  return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
}

export async function uploadListingPhoto(file) {
  if (!uploadsConfigured()) {
    throw new Error("Photo uploads aren't configured yet — set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in js/cloudinary-config.js.");
  }
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 10MB — try a smaller photo.`);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Couldn't upload ${file.name}.`);
  return data.secure_url;
}

// Uploads sequentially so onProgress gives an accurate "photo 2 of 4"
// readout rather than several requests finishing out of order.
export async function uploadListingPhotos(files, onProgress) {
  const list = Array.from(files);
  const urls = [];
  for (let i = 0; i < list.length; i++) {
    onProgress?.(i + 1, list.length);
    urls.push(await uploadListingPhoto(list[i]));
  }
  return urls;
}
