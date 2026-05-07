import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas";

/**
 * Exporta a PPTX un reporte ad-hoc tipo dashboard, una slide por
 * sección marcada con `data-pptx-section="..."`.
 *
 * Estrategia:
 *   1. Encuentra todos los descendientes de `rootElement` con el atributo
 *      `data-pptx-section`. (orden DOM = orden de slides).
 *   2. Captura cada uno con html2canvas (scale 2, mismo background dark
 *      del dashboard).
 *   3. Crea slides 13.33"×7.5" widescreen (Google Slides default) y mete
 *      cada captura como imagen centrada con margen — preserva aspect
 *      ratio y deja espacio en blanco si la sección no es 16:9.
 *
 * El resultado son IMÁGENES adentro del PPTX (no shapes nativos
 * editables) — el cliente puede arrastrar las slides, agregar portada y
 * cierre, pero no editar números individuales del chart. Esto es
 * intencional: replicar 1:1 el dashboard sin recrear cada chart en la
 * API de PptxGenJS.
 */
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
  const slideW = 13.33;
  const slideH = 7.5;
  pptx.defineLayout({ name: "MBR_DASH", width: slideW, height: slideH });
  pptx.layout = "MBR_DASH";

  for (const el of sections) {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: bgHex,
      logging: false,
    });
    const dataUrl = canvas.toDataURL("image/png");

    const slide = pptx.addSlide();
    slide.background = { color: bgHex.replace("#", "") };

    const margin = 0.3;
    const maxW = slideW - 2 * margin;
    const maxH = slideH - 2 * margin;
    const imgRatio = canvas.width / canvas.height;
    const boxRatio = maxW / maxH;

    let w: number;
    let h: number;
    if (imgRatio > boxRatio) {
      w = maxW;
      h = w / imgRatio;
    } else {
      h = maxH;
      w = h * imgRatio;
    }
    const x = (slideW - w) / 2;
    const y = (slideH - h) / 2;

    slide.addImage({ data: dataUrl, x, y, w, h });
  }

  await pptx.writeFile({ fileName: filename });
}
