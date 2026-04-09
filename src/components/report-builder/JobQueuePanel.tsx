import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MbrJob {
  id: string;
  cliente: string;
  periodo: string;
  status: string;
  report_url: string | null;
  created_at: string;
}

export function JobQueuePanel() {
  const [jobs, setJobs] = useState<MbrJob[]>([]);

  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await supabase
        .from("mbr_jobs")
        .select("id, cliente, periodo, status, report_url, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setJobs(data as MbrJob[]);
    };
    fetchJobs();

    const channel = supabase
      .channel("mbr-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mbr_jobs" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newJob = payload.new as MbrJob;
            setJobs((prev) => [newJob, ...prev].slice(0, 20));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as MbrJob;
            setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Cola de reportes</h2>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 border border-border/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{job.cliente}</p>
                <p className="text-[10px] text-muted-foreground">{job.periodo}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={job.status} />
                {job.status === "finalizado" && job.report_url && (
                  <a
                    href={job.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" /> Ver
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "en_proceso":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
          <Loader2 className="h-3 w-3 animate-spin" /> En proceso
        </span>
      );
    case "finalizado":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">
          <CheckCircle className="h-3 w-3" /> Finalizado
        </span>
      );
    case "fallido":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded">
          <XCircle className="h-3 w-3" /> Fallido
        </span>
      );
    default:
      return (
        <span className="text-[10px] text-muted-foreground px-2 py-0.5">{status}</span>
      );
  }
}
