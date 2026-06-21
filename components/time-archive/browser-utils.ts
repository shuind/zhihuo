export async function sha256Hex(input: string) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function sha256HexForBlob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

export async function readImageDimensions(file: Blob): Promise<{ width: number | null; height: number | null }> {
  if (typeof window === "undefined") return { width: null, height: null };
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
}

export async function compressImageForUpload(
  file: File,
  options: { maxEdge?: number; maxBytesBeforeCompress?: number; quality?: number } = {}
) {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  const maxEdge = options.maxEdge ?? 1600;
  const maxBytesBeforeCompress = options.maxBytesBeforeCompress ?? 1_200_000;
  const quality = options.quality ?? 0.86;
  const dimensions = await readImageDimensions(file);
  const width = dimensions.width ?? 0;
  const height = dimensions.height ?? 0;
  if (!width || !height) return file;

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 1 && file.size <= maxBytesBeforeCompress) return file;

  const image = await loadImageElement(file);
  if (!image) return file;

  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return file;

  context.drawImage(image, 0, 0, nextWidth, nextHeight);
  const outputType = file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const blob = await canvasToBlob(canvas, outputType, quality);
  if (!blob) return file;
  if (scale >= 1 && blob.size >= file.size) return file;

  return new File([blob], withImageExtension(file.name || "image", outputType), {
    type: outputType,
    lastModified: file.lastModified
  });
}

function loadImageElement(file: Blob) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function withImageExtension(fileName: string, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
  const baseName = fileName.replace(/\.[a-z0-9]+$/i, "").trim() || "image";
  return `${baseName}.${extension}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
