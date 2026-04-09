import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isValidGoogleSheetsUrl } from "./types";
import { CSM_PROFILES, type CsmProfile } from "./csmData";

const PERIODOS = [
  "Marzo 2026", "Febrero 2026", "Enero 2026",
  "Diciembre 2025", "Noviembre 2025", "Octubre 2025", "Septiembre 2025",
];

interface ConfigSidebarProps {
  cliente: string;
  setCliente: (v: string) => void;
  periodo: string;
  setPeriodo: (v: string) => void;
  selectedCsm: CsmProfile | null;
  setSelectedCsm: (v: CsmProfile | null) => void;
  sheetsUrl: string;
  setSheetsUrl: (v: string) => void;
}

export function ConfigSidebar({
  cliente, setCliente,
  periodo, setPeriodo,
  selectedCsm, setSelectedCsm,
  sheetsUrl, setSheetsUrl,
}: ConfigSidebarProps) {
  const urlTouched = sheetsUrl.length > 0;
  const urlValid = isValidGoogleSheetsUrl(sheetsUrl);

  const handleCsmChange = (email: string) => {
    const csm = CSM_PROFILES.find((c) => c.email === email) || null;
    setSelectedCsm(csm);
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Configuración base</h2>

        <div className="space-y-2">
          <Label htmlFor="cliente" className="text-xs text-muted-foreground">Cliente *</Label>
          <Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="periodo" className="text-xs text-muted-foreground">Periodo *</Label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar periodo" />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="csm" className="text-xs text-muted-foreground">CSM *</Label>
          <Select value={selectedCsm?.email || ""} onValueChange={handleCsmChange}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar CSM" />
            </SelectTrigger>
            <SelectContent>
              {CSM_PROFILES.map((csm) => (
                <SelectItem key={csm.email} value={csm.email}>
                  {csm.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCsm && (
            <div className="text-[11px] text-muted-foreground space-y-0.5 pl-1">
              <p>{selectedCsm.email}</p>
              <p>{selectedCsm.tel}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sheets" className="text-xs text-muted-foreground">URL Google Sheets *</Label>
          <Input
            id="sheets"
            value={sheetsUrl}
            onChange={(e) => setSheetsUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className={`text-xs ${urlTouched && !urlValid ? "border-destructive focus-visible:ring-destructive" : ""}`}
          />
          {urlTouched && !urlValid && (
            <p className="text-[11px] text-destructive">Debe ser una URL válida de Google Sheets</p>
          )}
        </div>
      </div>
    </div>
  );
}
