import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const SLIDE_W = 1280;
const SLIDE_H = 720;

interface Saved {
  el: HTMLElement;
  props: Partial<CSSStyleDeclaration>;
}

function saveAndSet(el: HTMLElement, overrides: Partial<CSSStyleDeclaration>): Saved {
  const props: Partial<CSSStyleDeclaration> = {};
  for (const key of Object.keys(overrides) as (keyof CSSStyleDeclaration)[]) {
    props[key] = el.style[key] as string;
  }
  Object.assign(el.style, overrides);
  return { el, props };
}

function restoreAll(saved: Saved[]): void {
  for (const { el, props } of saved) {
    Object.assign(el.style, props);
  }
}

/**
 * Batch-prepare the container for PDF export:
 *  - Remove transform:scale from all [data-pdf-inner] elements (ScaledSlide inner)
 *  - Expand [data-pdf-outer] containers to 1280×720 and clear overflow
 *  - Clear overflow clips on the main container
 *
 * Returns a restore function. Call once BEFORE capturing any slide,
 * call restore once AFTER all slides are captured.
 */
function prepareForExport(container: HTMLElement): () => void {
  const saved: Saved[] = [];

  // 1. All ScaledSlide inner divs — remove the scale transform
  container.querySelectorAll<HTMLElement>('[data-pdf-inner]').forEach(inner => {
    saved.push(saveAndSet(inner, {
      transform: 'none',
      width: SLIDE_W + 'px',
      height: SLIDE_H + 'px',
    }));
  });

  // 2. All ScaledSlide outer divs — expand to full slide size
  container.querySelectorAll<HTMLElement>('[data-pdf-outer]').forEach(outer => {
    saved.push(saveAndSet(outer, {
      width: SLIDE_W + 'px',
      height: SLIDE_H + 'px',
      minHeight: SLIDE_H + 'px',
      overflow: 'visible',
    }));
  });

  // 3. Release overflow clip on the scroll container itself
  saved.push(saveAndSet(container, { overflow: 'visible' }));

  return () => restoreAll(saved);
}

/**
 * Wait until every <img> inside `el` is fully decoded.
 */
function waitForImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img'));
  const promises = imgs
    .filter(img => !img.complete)
    .map(img => img.decode().catch(() => undefined));
  return Promise.all(promises).then(() => undefined);
}

export const exportPDF = (
  clienteNombre: string,
  periodoReporte: string,
  onStart?: () => void,
  onEnd?: () => void,
): void => {
  const container = document.getElementById('canvas-mbr-slides');
  if (!container) return;

  // Collect slides: .slide-with-insight wrappers + standalone .slide-page
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

  // ── PHASE 1: Prepare the entire DOM in one pass ────────────────
  // Suppress ScaledSlide ResizeObservers so React doesn't re-render charts
  (window as any).__pdfExporting = true;

  // Expand all ScaledSlide containers at once (one layout reflow, not 30)
  const restore = prepareForExport(container);

  // Wait for all images in the whole container + 500ms for layout/paint to settle
  // (one-time wait, not per-slide)
  const ready = waitForImages(container).then(
    () => new Promise<void>(resolve => setTimeout(resolve, 500)),
  );

  // ── PHASE 2: Capture slides sequentially (no delays between them) ──
  const captureSlide = (slide: HTMLElement): Promise<HTMLCanvasElement> => {
    slide.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });

    return html2canvas(slide, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      width: SLIDE_W,
      height: SLIDE_H,
      windowWidth: SLIDE_W,
      windowHeight: SLIDE_H,
      onclone: (_doc, clonedEl) => {
        // Safety net on the clone itself
        clonedEl.style.width = SLIDE_W + 'px';
        clonedEl.style.height = SLIDE_H + 'px';
        clonedEl.style.transform = 'none';
        clonedEl.style.position = 'relative';
        clonedEl.style.overflow = 'hidden';

        // Clear any remaining transforms / tight constraints in clone ancestors
        let parent = clonedEl.parentElement;
        while (parent) {
          parent.style.transform = 'none';
          parent.style.overflow = 'visible';
          parent.style.maxWidth = 'none';
          if (parseInt(parent.style.width || '0', 10) > 0 && parseInt(parent.style.width, 10) < SLIDE_W) {
            parent.style.width = SLIDE_W + 'px';
            parent.style.height = SLIDE_H + 'px';
          }
          parent = parent.parentElement;
        }

        // Release overflow clips inside the slide
        clonedEl.querySelectorAll<HTMLElement>('*').forEach(child => {
          const ov = window.getComputedStyle(child).overflow;
          if (ov === 'hidden' || ov === 'clip') {
            child.style.overflow = 'visible';
          }
        });
      },
    });
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

  ready
    .then(() => captureNext(0))
    .then(() => pdf.save(nombreArchivo))
    .catch(err => console.error('exportPDF error:', err))
    .finally(() => {
      restore();
      (window as any).__pdfExporting = false;
      if (onEnd) onEnd();
    });
};
