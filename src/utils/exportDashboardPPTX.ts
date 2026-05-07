import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas";

/**
 * Exporta a PPTX un reporte ad-hoc tipo dashboard, una slide por
 * sección marcada con `data-pptx-section="..."`.
 *
 * Estrategia (v2 — fill-slide-perfect):
 *   1. Encuentra todos los descendientes de `rootElement` con el atributo
 *      `data-pptx-section` (orden DOM = orden de slides).
 *   2. Para cada sección:
 *      a. Calcula el tamaño "stage" 16:9 que envuelva la sección a su
 *         tamaño natural (paddea el lado corto con dark bg).
 *      b. Clona la sección dentro de un staging div off-screen 16:9 y
 *         centra el contenido. El staging tiene el mismo bg que la
 *         slide → los bordes de padding son invisibles.
 *      c. Captura el staging con html2canvas a scale 3 (alta resolución
 *         para que no se vea borroso ni estirado).
 *   3. La imagen resultante ya es 16:9 y se inserta full-bleed en la
 *      slide widescreen 13.33"×7.5" — fill 100%, sin márgenes ni
 *      bordes vacíos.
 *
 * El resultado son IMÁGENES adentro del PPTX (no shapes nativos
 * editables) — el cliente puede arrastrar las slides, agregar portada y
 * cierre, pero no editar números individuales del chart. Esto es
 * intencional: replicar 1:1 el dashboard sin recrear cada chart en la
 * API de PptxGenJS.
 */

const SLIDE_W_IN = 13.33;
const SLIDE_H_IN = 7.5;
const SLIDE_RATIO = SLIDE_W_IN / SLIDE_H_IN; // ≈ 1.7773

export async function exportDashboardPPTX({
  rootElement,
  filename,
  bgHex = "#08111E",
}: {
  rootElement: HTMLElement;
  filename: string;
  bgHex?: string;
}): Promise<void> {
  const sections = Array.from(
    rootElement.querySelectorAll<HTMLElement>("[data-pptx-section]"),
  );
  if (sections.length === 0) {
    console.warn("[exportDashboardPPTX] no sections found");
    return;
  }

  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "MBR_DASH", width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = "MBR_DASH";

  for (const el of sections) {
    const dataUrl = await captureSectionAs16x9(el, bgHex);

    const slide = pptx.addSlide();
    slide.background = { color: bgHex.replace("#", "") };
    slide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: SLIDE_W_IN,
      h: SLIDE_H_IN,
    });
  }

  await pptx.writeFile({ fileName: filename });
}

/**
 * Clona `el` y lo monta en un stage off-screen con dimensiones forzadas
 * a 16:9. Captura con html2canvas a scale 3 y devuelve la dataURL.
 *
 * El stage tiene `bgHex` de fondo, así que el padding (lado corto que
 * extendemos para llegar a 16:9) queda invisible cuando la slide se
 * pinta — visualmente la sección queda centrada en la slide.
 */
async function captureSectionAs16x9(
  el: HTMLElement,
  bgHex: string,
): Promise<string> {
  // Forzamos un layout antes de medir
  void el.offsetHeight;
  const rect = el.getBoundingClientRect();
  const elW = Math.max(1, rect.width);
  const elH = Math.max(1, rect.height);
  const elRatio = elW / elH;

  // Stage 16:9: extendemos el lado corto del elemento
  let stageW: number;
  let stageH: number;
  if (elRatio > SLIDE_RATIO) {
    // sección más ancha que 16:9 → mantenemos width, aumentamos height
    stageW = elW;
    stageH = elW / SLIDE_RATIO;
  } else {
    // sección más alta o cuadrada → mantenemos height, aumentamos width
    stageH = elH;
    stageW = elH * SLIDE_RATIO;
  }

  // Clone offscreen — eliminamos el data-attribute para no confundir si
  // alguien hace querySelectorAll de nuevo, y limpiamos transforms que
  // framer-motion pudo dejar puestos.
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-pptx-section");
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.style.flex = "0 0 auto";

  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = `
    position: fixed;
    top: -100000px;
    left: 0;
    width: ${stageW}px;
    height: ${stageH}px;
    background: ${bgHex};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
    font-family: Inter, system-ui, sans-serif;
    color: #EEF0FF;
    z-index: -1;
  `;
  // Wrapper que mantiene el ancho original del elemento (para que
  // grids responsivos no se reflowen al ponerse en un stage más ancho).
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    width: ${elW}px;
    flex: 0 0 ${elW}px;
  `;
  wrap.appendChild(clone);
  stage.appendChild(wrap);
  document.body.appendChild(stage);

  // 2 frames para que el navegador termine layout + cualquier resize
  // observer de Recharts. La SVG ya está en el clone con sus atributos
  // de tamaño, así que no necesitamos esperar re-render.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  try {
    const canvas = await html2canvas(stage, {
      scale: 3,
      useCORS: true,
      backgroundColor: bgHex,
      logging: false,
      width: stageW,
      height: stageH,
      windowWidth: stageW,
      windowHeight: stageH,
    });
    return canvas.toDataURL("image/png");
  } finally {
    document.body.removeChild(stage);
  }
}
