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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
