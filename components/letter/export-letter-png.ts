"use client";

const LETTER_EXPORT_PIXEL_RATIO = 2;

export async function exportLetterPng(node: HTMLElement, filename: string) {
  await prepareLetterForExport(node);

  const htmlToImage = await import("html-to-image");
  const { width, height } = getExportSize(node);
  const fontEmbedCSS = await getFontEmbedCss(htmlToImage, node);
  const blob = await htmlToImage.toBlob(node, {
    pixelRatio: LETTER_EXPORT_PIXEL_RATIO,
    cacheBust: true,
    backgroundColor: "transparent",
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`
    },
    preferredFontFormat: "woff2",
    fontEmbedCSS
  });

  if (!blob) throw new Error("信笺图片生成失败");
  downloadBlob(blob, filename);
}

async function prepareLetterForExport(node: HTMLElement) {
  await waitForFonts(node);
  await waitForImages(node);
  await nextFrame();
  await nextFrame();
}

async function waitForFonts(node: HTMLElement) {
  if (typeof document === "undefined" || !("fonts" in document)) return;

  const fonts = document.fonts;
  const families = collectFontFamilies(node);
  await Promise.all(
    Array.from(families).map((family) =>
      fonts.load(`16px ${family}`).catch(() => undefined)
    )
  );
  await fonts.ready.catch(() => undefined);
}

function collectFontFamilies(node: HTMLElement) {
  const families = new Set<string>();
  for (const element of [node, ...Array.from(node.querySelectorAll<HTMLElement>("*"))]) {
    const family = window.getComputedStyle(element).fontFamily;
    if (family) families.add(family);
  }
  return families;
}

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          const done = () => {
            if (typeof image.decode === "function") {
              void image.decode().catch(() => undefined).finally(resolve);
              return;
            }
            resolve();
          };

          if (image.complete) {
            done();
            return;
          }

          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

function getExportSize(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  return {
    width: Math.ceil(Math.max(rect.width, node.scrollWidth)),
    height: Math.ceil(Math.max(rect.height, node.scrollHeight))
  };
}

async function getFontEmbedCss(
  htmlToImage: typeof import("html-to-image"),
  node: HTMLElement
) {
  try {
    return await htmlToImage.getFontEmbedCSS(node, {
      cacheBust: true,
      preferredFontFormat: "woff2"
    });
  } catch {
    return undefined;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = objectUrl;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
