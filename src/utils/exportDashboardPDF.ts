import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Exporta a PDF el bloque del drill-down del dashboard de cartera.
 *
 * Estrategia: una sola página con dimensiones custom = exacto al alto del
 * elemento renderizado a scale: 2. El PDF queda largo (un solo "scroll")
 * pero sin cortes de gráficos a mitad ni padding desperdiciado. Como los
 * charts del dashboard son Recharts (SVG), html2canvas los captura nítidos
 * sin necesidad del off-screen clone que sí usamos en el Report Builder
 * para Chart.js.
 */
export async function exportDashboardPDF({
  rootElement,
  filename,
}: {
  rootElement: HTMLElement;
  filename: string;
}): Promise<void> {
  // Espera 1 frame para asegurar que cualquier animación / resize observer
  // de framer-motion / Recharts haya completado antes de capturar.
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const canvas = await html2canvas(rootElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#08111E", // S.bg del dashboard (matchea el page background)
    logging: false,
    // Asegura que motion.div con opacity=0/y=8 NO arruine la captura: si el
    // usuario llamó al export justo después de cargar, el rootElement ya
    // está con animate=1/0 al tiempo que rendereamos.
    onclone: (clonedDoc) => {
      // En el clon, eliminamos pseudo-elementos / sticky positioning del
      // top bar si por alguna razón cae adentro del root. No debería pero
      // por las dudas.
      const stickies = clonedDoc.querySelectorAll<HTMLElement>(
        '[style*="position: fixed"], [style*="position:fixed"]'
      );
      stickies.forEach((el) => {
        el.style.position = "static";
      });
    },
  });

  const widthPt = 842; // A4 landscape width en pt — escala "razonable" del PDF
  const heightPt = (canvas.height / canvas.width) * widthPt;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [widthPt, heightPt],
  });

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, widthPt, heightPt);
  pdf.save(filename);
}
