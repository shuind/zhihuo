const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_EDGE = 12_000;
const DEFAULT_MAX_IMAGE_PIXELS = 40_000_000;

export type ValidatedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number | null;
  height: number | null;
};

function configuredPositiveInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function maxThinkingImageBytes() {
  return configuredPositiveInt("THINKING_MEDIA_MAX_BYTES", DEFAULT_MAX_IMAGE_BYTES);
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.byteLength < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.byteLength) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.byteLength) return null;
    if (sofMarkers.has(marker) && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6]
      };
    }
    offset += length;
  }
  return null;
}

function readLe24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.byteLength < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") {
    return { width: readLe24(bytes, 24) + 1, height: readLe24(bytes, 27) + 1 };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
    };
  }
  return null;
}

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.byteLength < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

export function validateThinkingImage(bytes: Uint8Array): ValidatedImage | null {
  let mimeType: ValidatedImage["mimeType"] | null = null;
  let dimensions: { width: number; height: number } | null = null;
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    mimeType = "image/png";
    dimensions = pngDimensions(bytes);
  } else if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mimeType = "image/jpeg";
    dimensions = jpegDimensions(bytes);
  } else if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP")) {
    mimeType = "image/webp";
    dimensions = webpDimensions(bytes);
  }
  if (!mimeType || !dimensions) return null;

  const maxEdge = configuredPositiveInt("THINKING_MEDIA_MAX_EDGE", DEFAULT_MAX_IMAGE_EDGE);
  const maxPixels = configuredPositiveInt("THINKING_MEDIA_MAX_PIXELS", DEFAULT_MAX_IMAGE_PIXELS);
  const { width, height } = dimensions;
  if (width <= 0 || height <= 0 || width > maxEdge || height > maxEdge || width * height > maxPixels) return null;
  return { mimeType, width, height };
}

