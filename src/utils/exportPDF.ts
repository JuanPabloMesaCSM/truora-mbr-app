import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const SLIDE_W = 1280;
const SLIDE_H = 720;

export const exportPDF = (
  clienteNombre: string,
  periodoReporte: string,
  onStart?: () => void,
  onEnd?: () => void,
): void => {
  const slides = Array.from(
    document.querySelectorAll<HTMLElement>('#canvas-mbr-slides .slide-page'),
  );
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

  const captureSlide = (slide: HTMLElement): Promise<HTMLCanvasElement> => {
    // Scroll the slide into view so html2canvas can measure it correctly
    slide.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });

    return new Promise(resolve => {
      // Wait two animation frames for the browser to settle scroll position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          html2canvas(slide, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            // Capture the slide's own coordinate space, ignoring page scroll
            scrollX: 0,
            scrollY: 0,
            width: SLIDE_W,
            height: SLIDE_H,
            windowWidth: SLIDE_W,
            windowHeight: SLIDE_H,
            onclone: (_doc, clonedEl) => {
              // Release overflow: hidden on every child so nothing gets clipped
              // during the off-screen render; the outer slide boundary (SLIDE_W×SLIDE_H)
              // already limits what ends up in the canvas image.
              clonedEl.querySelectorAll<HTMLElement>('*').forEach(el => {
                const s = el.style;
                if (s.overflow === 'hidden' || s.overflow === 'clip') {
                  s.overflow = 'visible';
                }
              });
              // Also release the root clone itself
              clonedEl.style.overflow = 'visible';
            },
          }).then(resolve);
        });
      });
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

  captureNext(0)
    .then(() => pdf.save(nombreArchivo))
    .catch(err => console.error('exportPDF error:', err))
    .finally(() => { if (onEnd) onEnd(); });
};
