import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const SLIDE_W = 1280;
const SLIDE_H = 720;

/* ── Style snapshot for restore ── */
interface SavedStyle {
  el: HTMLElement;
  transform: string;
  width: string;
  height: string;
  minHeight: string;
  maxWidth: string;
  overflow: string;
  position: string;
}

/**
 * Walk ancestors from `slide` up to (but excluding) `root` and temporarily
 * remove CSS transforms, overflow clips, and size constraints so html2canvas
 * measures the slide at its native 1280×720.  Returns a restore function.
 */
function unscaleAncestors(slide: HTMLElement, root: HTMLElement): () => void {
  const saved: SavedStyle[] = [];

  let el: HTMLElement | null = slide.parentElement;
  while (el && el !== root) {
    const cs = window.getComputedStyle(el);
    const hasTransform = cs.transform !== 'none';
    const tooNarrow = el.offsetWidth < SLIDE_W;
    const clips = cs.overflow === 'hidden' || cs.overflow === 'clip';
    const hasMaxW = cs.maxWidth !== 'none' && parseInt(cs.maxWidth, 10) < SLIDE_W;

    if (hasTransform || tooNarrow || clips || hasMaxW) {
      saved.push({
        el,
        transform: el.style.transform,
        width: el.style.width,
        height: el.style.height,
        minHeight: el.style.minHeight,
        maxWidth: el.style.maxWidth,
        overflow: el.style.overflow,
        position: el.style.position,
      });

      if (hasTransform) el.style.transform = 'none';
      if (tooNarrow) {
        el.style.width = SLIDE_W + 'px';
        el.style.height = SLIDE_H + 'px';
        el.style.minHeight = SLIDE_H + 'px';
      }
      if (clips) el.style.overflow = 'visible';
      if (hasMaxW) el.style.maxWidth = 'none';
    }
    el = el.parentElement;
  }

  // Also relax the container itself
  saved.push({
    el: root,
    transform: root.style.transform,
    width: root.style.width,
    height: root.style.height,
    minHeight: root.style.minHeight,
    maxWidth: root.style.maxWidth,
    overflow: root.style.overflow,
    position: root.style.position,
  });
  root.style.overflow = 'visible';

  return () => {
    for (const s of saved) {
      s.el.style.transform = s.transform;
      s.el.style.width = s.width;
      s.el.style.height = s.height;
      s.el.style.minHeight = s.minHeight;
      s.el.style.maxWidth = s.maxWidth;
      s.el.style.overflow = s.overflow;
      s.el.style.position = s.position;
    }
  };
}

/**
 * Wait until every <img> inside `el` is fully decoded.
 */
function waitForMedia(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img'));
  const promises = imgs
    .filter(img => !img.complete)
    .map(img => img.decode().catch(() => undefined));
  if (promises.length === 0) return Promise.resolve();
  return Promise.all(promises).then(() => undefined);
}

/**
 * Simple promise-based setTimeout.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const exportPDF = (
  clienteNombre: string,
  periodoReporte: string,
  onStart?: () => void,
  onEnd?: () => void,
): void => {
  const container = document.getElementById('canvas-mbr-slides');
  if (!container) return;

  // Collect slide elements:
  //  - .slide-with-insight wrappers (contain the slide + insight panel)
  //  - .slide-page elements NOT already inside a wrapper
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

  // Signal ScaledSlide ResizeObservers to ignore DOM changes during export.
  // Without this, unscaleAncestors() triggers ResizeObserver → setScale() →
  // React re-render → Chart.js instances destroyed mid-capture (random blank slides).
  (window as any).__pdfExporting = true;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  });

  const captureSlide = (slide: HTMLElement): Promise<HTMLCanvasElement> => {
    // 1. Scroll into view so the element is laid out
    slide.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });

    // 2. Temporarily unscale the original DOM so html2canvas measures 1280×720
    const restore = unscaleAncestors(slide, container);

    // 3. Wait for images + 300ms for layout/paint to settle after DOM changes
    return waitForMedia(slide)
      .then(() => delay(300))
      .then(() =>
        html2canvas(slide, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          scrollX: 0,
          scrollY: 0,
          width: SLIDE_W,
          height: SLIDE_H,
          windowWidth: SLIDE_W,
          windowHeight: SLIDE_H,
          onclone: (_doc, clonedEl) => {
            // Safety net — ensure the clone is at native size with no transforms
            clonedEl.style.width = SLIDE_W + 'px';
            clonedEl.style.height = SLIDE_H + 'px';
            clonedEl.style.transform = 'none';
            clonedEl.style.position = 'relative';
            clonedEl.style.overflow = 'hidden';

            // Clear transforms and clips on clone ancestors
            let parent = clonedEl.parentElement;
            while (parent) {
              parent.style.transform = 'none';
              parent.style.overflow = 'visible';
              if (parent.offsetWidth < SLIDE_W) {
                parent.style.width = SLIDE_W + 'px';
                parent.style.height = SLIDE_H + 'px';
              }
              parent.style.maxWidth = 'none';
              parent = parent.parentElement;
            }

            // Release any inner overflow clips
            clonedEl.querySelectorAll<HTMLElement>('*').forEach(child => {
              if (child.style.overflow === 'hidden' || child.style.overflow === 'clip') {
                child.style.overflow = 'visible';
              }
            });
          },
        })
          .then(canvas => {
            restore();
            return canvas;
          })
          .catch(err => {
            restore();
            throw err;
          }),
      );
  };

  const captureNext = (index: number): Promise<void> => {
    if (index >= slides.length) return Promise.resolve();

    return captureSlide(slides[index]).then(canvas => {
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
      (window as any).__pdfExporting = false;
      if (onEnd) onEnd();
    });
};
