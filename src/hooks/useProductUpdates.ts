import { useState, useCallback } from "react";

/**
 * Updates de Producto — consulta al webhook n8n "MBR_Product_Updates".
 * El flujo lee la tabla Supabase `telegram_product_updates` (alimentada por el
 * bot de Telegram + GPT) filtrando por rango de fechas y productos del cliente.
 *
 * Contrato (validado 2026-06-30):
 *   POST { startDate, endDate, products: string[] }
 *   → 200 [{ id, title, message_text, category, created_at, message_id_telegram }]
 * El webhook agrega 'General' al filtro de productos automáticamente.
 */
const WEBHOOK_URL =
  "https://n8n.zapsign.com.br/webhook/5e1161ee-f706-43be-8970-cb165888e6e3";

export type ProductUpdate = {
  id: string;
  title: string;
  message_text: string;
  category: string; // DI | CE | BGC | Zapsign | General
  created_at: string;
  message_id_telegram?: number;
};

export function useProductUpdates() {
  const [updates, setUpdates] = useState<ProductUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchUpdates = useCallback(
    async (startDate: string, endDate: string, products: string[]) => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, products }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setUpdates(Array.isArray(data) ? (data as ProductUpdate[]) : []);
      } catch {
        setError(true);
        setUpdates([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setUpdates([]);
    setError(false);
    setLoading(false);
  }, []);

  return { updates, loading, error, fetchUpdates, reset };
}
