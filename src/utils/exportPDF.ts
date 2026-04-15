import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const SLIDE_W = 1280;
const SLIDE_H = 720;

/**
 * Copy Chart.js canvas pixel data from the original slide to its clone.
 * cloneNode(true) copies the <canvas> element but NOT its pixel data —
 * Chart.js renders at runtime so we must copy it manually.
 */
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

/**
 * Capture a slide at native 1280×720 WITHOUT touching the original DOM.
 *
 * Strategy:
 *  1. Clone the slide element (no pixel data for canvases yet)
 *  2. Copy Chart.js canvas pixel data from original → clone
 *  3. Place clone in an off-screen fixed container at 1280×720
 *  4. Release overflow clips on all clone descendants
 *  5. Capture with html2canvas
 *  6. Remove the off-screen container
 *
 * The original DOM is never modified, so no layout thrashing,
 * no ResizeObserver re-triggers, and no page-bugging after export.
 */
async function captureNative(slide: HTMLElement): Promise<HTMLCanvasElement> {
  // 1. Clone
  const clone = slide.cloneNode(true) as HTMLElement;

  // 2. Set clone to native 1280×720, no transforms
  clone.style.position = 'absolute';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.width = SLIDE_W + 'px';
  clone.style.height = SLIDE_H + 'px';
  clone.style.transform = 'none';
  clone.style.overflow = 'hidden';

  // 3. Off-screen host
  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'top:-9999px',
    'left:0',
    `width:${SLIDE_W}px`,
    `height:${SLIDE_H}px`,
    'overflow:visible',
    'z-index:-9999',
    'pointer-events:none',
  ].join(';');
  host.appendChild(clone);
  document.body.appendChild(host);

  // 4. Release overflow clips inside clone (now that it's in the document,
  //    computed styles are available)
  clone.querySelectorAll<HTMLElement>('*').forEach(el => {
    const ov = window.getComputedStyle(el).overflow;
    if (ov === 'hidden' || ov === 'clip') el.style.overflow = 'visible';
  });

  // 5. Copy canvas pixel data AFTER the clone is in the document
  copyCanvasData(slide, clone);

  // 6. One rAF so the browser has painted the off-screen clone
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

export const exportPDF = (
  clienteNombre: string,
  periodoReporte: string,
  onStart?: () => void,
  onEnd?: () => void,
): void => {
  const container = document.getElementById('canvas-mbr-slides');
  if (!container) return;

  // Collect slides: .slide-with-insight wrappers + standalone .slide-page elements
  const slides: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>('.slide-with-insight, .slide-page').forEach(el => {
    if (el.classList.contains('slide-page') && el.closest('.slide-with-insight')) return;
    slides.push(el);
  });
  if (!slides.length) return;

  const nombreArchivo = `MBR_${clienteNombre}_${periodoReporte}.pdf`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');

  if (onStart) onStart();

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  });

  const captureNext = (index: number): Promise<void> => {
    if (index >= slides.length) return Promise.resolve();
    return captureNative(slides[index]).then(canvas => {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (index > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
      pdf.addImage(imgData, 'JPEG', 0, 0, SLIDE_W, SLIDE_H);
      return captureNext(index + 1);
    });
  };

  captureNext(0)
    .then(() => pdf.save(nombreArchivo))
    .catch(err => console.error('exportPDF error:', err))
    .finally(() => {
      if (onEnd) onEnd();
    });
};
