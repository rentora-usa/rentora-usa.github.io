// Fill these in after setting up a free Cloudinary account (see README §5).
// Leave blank and photo uploads on the "List an item" page just show a
// clear "not configured yet" error instead of failing silently — pasting
// a photo URL still works either way, this only affects the upload button.
//
// Both of these are safe to expose in frontend code — neither is a secret.
// The upload preset being "unsigned" is what makes browser-only uploads
// possible without a backend holding an API secret.

// Found on your Cloudinary dashboard, top left, right under your name.
export const CLOUDINARY_CLOUD_NAME = "nexi1xov";

// The name of the unsigned upload preset you create under
// Settings -> Upload -> Upload presets. Must have "Signing Mode" set to
// "Unsigned" or uploads will be rejected.
export const CLOUDINARY_UPLOAD_PRESET = "qqtmnay7";
