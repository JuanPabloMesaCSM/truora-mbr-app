import { FileText, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";


interface HeaderProps {
  totalSlides: number;
}

export function Header({ totalSlides }: HeaderProps) {
  

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <header className="border-b border-border bg-card px-6 py-4">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Report Builder</h1>
            <p className="text-xs text-muted-foreground">Generador de reportes MBR</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              <span className="text-primary font-bold">{totalSlides}</span> slides
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
