import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { type Product } from "./moduleDefinitions";

const CLIENT_ID_FIELDS = {
  DI: "client_id_di",
  BGC: "client_id_bgc",
  CE: "client_id_ce",
} as const;

type ClientIdField = (typeof CLIENT_ID_FIELDS)[keyof typeof CLIENT_ID_FIELDS];

interface ClientIdModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  clientId: string;
  clientName: string;
  onSuccess: (clienteId: string, campo: ClientIdField, nuevoId: string) => void;
}

export function ClientIdModal({
  open,
  onClose,
  product,
  clientId,
  clientName,
  onSuccess,
}: ClientIdModalProps) {
  const [nuevoClientId, setNuevoClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSave = async () => {
    const nuevoId = nuevoClientId.trim();
    if (!nuevoId) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("Sin sesión");

      const campo = CLIENT_ID_FIELDS[product];

      const response = await fetch(
        `https://cjrhxmfnmajxiwiiuwym.supabase.co/rest/v1/clientes?id=eq.${clientId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcmh4bWZubWFqeGl3aWl1d3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTI2OTIsImV4cCI6MjA4ODk2ODY5Mn0.6q8_uL8wOmgX1jDyQ8qbENRrC7vJRCcD0CBtQAVPoHw",
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({ [campo]: nuevoId }),
        }
      );

      console.log('Status:', response.status);
      const result = await response.json();
      console.log('Result:', result);

      if (!response.ok) {
        throw new Error(JSON.stringify(result));
      }

      onSuccess(clientId, campo, nuevoId);
      setNuevoClientId("");
      onClose();
      toast.success(`CLIENT_ID de ${product} guardado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado al guardar.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Configurar CLIENT_ID de {product}</DialogTitle>
          <DialogDescription className="text-xs">
            El cliente <strong>{clientName}</strong> no tiene un CLIENT_ID configurado para {product}.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder={`CLIENT_ID de ${product}`}
          value={nuevoClientId}
          onChange={(e) => {
            setNuevoClientId(e.target.value);
            if (errorMessage) setErrorMessage("");
          }}
          className="text-sm"
        />
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!nuevoClientId.trim() || saving}>
            {saving ? "Guardando..." : errorMessage ? "Reintentar" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
