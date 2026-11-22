// Image types OneShot opens. Shared by main.js and the tests.
// package.json → build.fileAssociations must list the same extensions (test/image-types.test.mjs checks it).
// Don't read package.json's `build` section at runtime: electron-builder strips it from packaged apps.
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'avif'];

module.exports = { IMAGE_EXTS };
