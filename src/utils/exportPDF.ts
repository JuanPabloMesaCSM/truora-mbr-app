import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';

const SLIDE_W = 1280;
const SLIDE_H = 720;

/* ── Shared: collect slide elements from the container ── */

function collectSlides(): HTMLElement[] {
  const container = document.getElementById('canvas-mbr-slides');
  if (!container) return [];
  const slides: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>('.slide-with-insight, .slide-page').forEach(el => {
    if (el.classList.contains('slide-page') && el.closest('.slide-with-insight')) return;
    slides.push(el);
  });
  return slides;
}

function buildFileName(clienteNombre: string, periodoReporte: string, ext: string): string {
  return `MBR_${clienteNombre}_${periodoReporte}.${ext}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
}

/* ── Shared: off-screen clone capture (zero DOM mutation) ── */

function copyCanvasData(from: HTMLElement, to: HTMLElement): void {
  const origCanvases = from.querySelectorAll<HTMLCanvasElement>('canvas');
  const cloneCanvases = to.querySelectorAll<HTMLCanvasElement>('canvas');
  origCanvases.forEach((orig, i) => {
    const dest = cloneCanvases[i];
    if (!dest || orig.width === 0 || orig.height === 0) return;
    dest.width = orig.width;
    dest.height = orig.height;
    const ctx = dest.getContext('2d');
    if (ctx) ctx.drawImage(orig, 0, 0);
  });
}

async function captureNative(slide: HTMLElement): Promise<HTMLCanvasElement> {
  const clone = slide.cloneNode(true) as HTMLElement;
  clone.style.position = 'absolute';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.width = SLIDE_W + 'px';
  clone.style.height = SLIDE_H + 'px';
  clone.style.transform = 'none';
  clone.style.overflow = 'hidden';

  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:0',
    `width:${SLIDE_W}px`, `height:${SLIDE_H}px`,
    'overflow:visible', 'z-index:-9999', 'pointer-events:none',
  ].join(';');
  host.appendChild(clone);
  document.body.appendChild(host);

  clone.querySelectorAll<HTMLElement>('*').forEach(el => {
    const ov = window.getComputedStyle(el).overflow;
    if (ov === 'hidden' || ov === 'clip') el.style.overflow = 'visible';
  });

  copyCanvasData(slide, clone);

  await new Promise<void>(resolve => requestAnimationFrame(resolve));

  try {
    return await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      width: SLIDE_W,
      height: SLIDE_H,
      windowWidth: SLIDE_W,
      windowHeight: SLIDE_H,
    });
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Capture all slides sequentially and return base64 JPEG strings.
 */
async function captureAllSlides(slides: HTMLElement[]): Promise<string[]> {
  const images: string[] = [];
  for (const slide of slides) {
    const canvas = await captureNative(slide);
    images.push(canvas.toDataURL('image/jpeg', 0.95));
  }
  return images;
}

/* ══════════════════════════════════════════════════════════
   PDF Export
══════════════════════════════════════════════════════════ */

export const exportPDF = (
  clienteNombre: string,
  periodoReporte: string,
  onStart?: () => void,
  onEnd?: () => void,
): void => {
  const slides = collectSlides();
  if (!slides.length) return;
  if (onStart) onStart();

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  });

  captureAllSlides(slides)
    .then(images => {
      images.forEach((imgData, i) => {
        if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
        pdf.addImage(imgData, 'JPEG', 0, 0, SLIDE_W, SLIDE_H);
      });
      pdf.save(buildFileName(clienteNombre, periodoReporte, 'pdf'));
    })
    .catch(err => console.error('exportPDF error:', err))
    .finally(() => { if (onEnd) onEnd(); });
};

/* ══════════════════════════════════════════════════════════
   PPTX Export
══════════════════════════════════════════════════════════ */

export const exportPPTX = (
  clienteNombre: string,
  periodoReporte: string,
  onStart?: () => void,
  onEnd?: () => void,
): void => {
  const slides = collectSlides();
  if (!slides.length) return;
  if (onStart) onStart();

  captureAllSlides(slides)
    .then(images => {
      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: 'MBR', width: 13.33, height: 7.5 });
      pptx.layout = 'MBR';

      images.forEach(imgData => {
        const slide = pptx.addSlide();
        slide.addImage({
          data: imgData,
          x: 0,
          y: 0,
          w: '100%',
          h: '100%',
        });
      });

      return pptx.writeFile({ fileName: buildFileName(clienteNombre, periodoReporte, 'pptx') });
    })
    .catch(err => console.error('exportPPTX error:', err))
    .finally(() => { if (onEnd) onEnd(); });
};
