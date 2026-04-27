import { useState, useEffect, useCallback, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { WelcomeStep } from "@/components/report-builder/WelcomeStep";
import { ConfigStep } from "@/components/report-builder/ConfigStep";
import { LeftPanel } from "@/components/report-builder/LeftPanel";
import { ReportCarrete } from "@/components/report-builder/ReportCarrete";
import { CenterCanvas } from "@/components/report-builder/CenterCanvas";
import { ClientIdModal } from "@/components/report-builder/ClientIdModal";
import { WabaNamesProvider } from "@/components/report-builder/WabaNamesProvider";
import {
  MODULES, PRODUCT_WEBHOOKS, PRODUCT_CLIENT_FIELD, ADMIN_EMAIL,
  parsePeriod, type Product, type CsmRow, type ClienteRow, type ModuleInsight,
} from "@/components/report-builder/moduleDefinitions";
import type { Theme, ReportData, CeFlowData } from "@/components/report-builder/SlideCanvas";

type AppStep = 'welcome' | 'config' | 'builder' | 'canvas';
type ClientSource = 'regular' | 'oncall';

/* Módulos CE que tienen selector de flujos. Cada uno mantiene su propio
 * subconjunto en `selectedCeFlowsByModule`. Si agregas un nuevo módulo con
 * `hasFlowSelector: true` en moduleDefinitions, agregalo también acá. */
const CE_FLOW_SELECTOR_MODULES = [
  '4_funnel_generico',
  '4b_funnel_steps',
  '4c_vrf',
  '4d_vrf_arbol',
  '5_flujo_inbound',
] as const;

interface IndexProps {
  source?: ClientSource;
}

const Index = ({ source = 'regular' }: IndexProps) => {
  const navigate = useNavigate();
  const clientsTable = source === 'oncall' ? 'clientes_oncall' : 'clientes';

  /* ─── Step state ─── */
  const [step, setStep] = useState<AppStep>('welcome');

  /* ─── Auth state ─── */
  const [userEmail, setUserEmail] = useState('');
  const [csmProfile, setCsmProfile] = useState<CsmRow | null>(null);
  const [clients, setClients] = useState<ClienteRow[]>([]);

  /* ─── UI state ─── */
  const [product, setProduct] = useState<Product>('DI');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [periodValue, setPeriodValue] = useState('');
  const [activeModuleIds, setActiveModuleIds] = useState<string[]>([]);
  const [insightsMode, setInsightsMode] = useState<'ai' | 'manual' | null>('ai');
  const [insightsActivos, setInsightsActivos] = useState<Record<string, boolean>>({});
  const [sheetUrl, setSheetUrl] = useState('');
  const [moduleInsights, setModuleInsights] = useState<Record<string, ModuleInsight>>({});
  const setModuleInsight = (id: string, mode: 'ai' | 'manual' | null, text?: string) => {
    setModuleInsights(prev => ({ ...prev, [id]: { mode, text: text !== undefined ? text : (prev[id]?.text ?? '') } }));
  };
  const [generalInsightText, setGeneralInsightText] = useState('');
  const [ceFlows, setCeFlows] = useState<{ flow_id: string; flow_name: string; total_procesos: number; tiene_vrf: boolean; tiene_outbound: boolean }[]>([]);
  /* Selección de flujos CE por módulo — cada KPI con `hasFlowSelector` tiene su propio
   * subconjunto independiente. Antes era un Set único compartido (bug: deseleccionar en
   * un KPI propagaba al resto). Keys = module IDs como '4_funnel_generico'. */
  const [selectedCeFlowsByModule, setSelectedCeFlowsByModule] = useState<Record<string, Set<string>>>({});
  const [ceFlowsLoading, setCeFlowsLoading] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<'generating' | 'success' | 'error' | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');
  const [showUpdates, setShowUpdates] = useState(true);
  const [clientIdModal, setClientIdModal] = useState<{
    product: Product; clientId: string; clientName: string;
  } | null>(null);

  /* ─── BGC Custom Types state ─── */
  const [customTypes, setCustomTypes] = useState<{ custom_type: string; total_checks: number; pct_total: number }[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [customTypesLoading, setCustomTypesLoading] = useState(false);

  /* ─── DI Flows state ─── */
  const [diFlows, setDiFlows] = useState<{ FLOW_ID: string; FLOW_NAME?: string | null; TOTAL_PROCESOS: number; USUARIOS_UNICOS: number; ULTIMO_USO: string }[]>([]);
  const [selectedDiFlows, setSelectedDiFlows] = useState<Set<string>>(new Set());
  const [diFlowsLoading, setDiFlowsLoading] = useState(false);
  const [diFlowsError, setDiFlowsError] = useState(false);

  /* ─── Derived state ─── */
  const selectedClient = clients.find(c => c.id === selectedClientId) || null;
  const periodData = periodValue ? parsePeriod(periodValue) : null;
  const isAdmin = userEmail === ADMIN_EMAIL;
  const isLoading = diFlowsLoading || customTypesLoading || ceFlowsLoading;

  const canGenerate = !!(
    selectedClient &&
    periodValue &&
    csmProfile &&
    selectedClient[PRODUCT_CLIENT_FIELD[product]]
  );

  const canContinue = !!(
    selectedClientId &&
    periodValue &&
    csmProfile &&
    selectedClient?.[PRODUCT_CLIENT_FIELD[product]]
  );

  /* ─── Data loading ─── */
  const loadSessionData = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    setUserEmail(normalizedEmail);
    console.log('Email del usuario:', normalizedEmail);

    const [csmResult, clientsResult] = await Promise.all([
      supabase
        .from('csm')
        .select('*')
        .ilike('email', normalizedEmail)
        .eq('activo', true)
        .maybeSingle(),
      supabase
        .from(clientsTable as 'clientes')
        .select('*')
        .eq('activo', true)
        .order('nombre'),
    ]);

    if (csmResult.error) console.error('CSM load error:', csmResult.error);
    if (clientsResult.error) console.error('Clients load error:', clientsResult.error);

    console.log('Clientes cargados:', clientsResult.data?.length ?? 0);

    setCsmProfile((csmResult.data as unknown as CsmRow) ?? null);
    setClients((clientsResult.data as unknown as ClienteRow[]) ?? []);
  }, [clientsTable]);

  const syncAuthenticatedUser = useCallback(async (session: Session | null) => {
    if (!session?.user?.email) {
      setUserEmail('');
      setCsmProfile(null);
      setClients([]);
      navigate('/login');
      return;
    }

    const email = session.user.email;
    if (!email.endsWith('@truora.com')) {
      await supabase.auth.signOut();
      toast.error('Acceso denegado');
      navigate('/login');
      return;
    }

    await loadSessionData(email);
  }, [loadSessionData, navigate]);

  /* ─── Auth guard + initial session bootstrap ─── */
  useEffect(() => {
    let isActive = true;

    const initializeSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isActive) return;
      await syncAuthenticatedUser(session);
    };

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) return;
      void syncAuthenticatedUser(session);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [syncAuthenticatedUser]);

  /* ─── Reset modules on product change ─── */
  useEffect(() => {
    setActiveModuleIds([]);
    setCustomTypes([]);
    setSelectedTypes(new Set());
    setDiFlows([]);
    setSelectedDiFlows(new Set());
    setDiFlowsError(false);
    setCeFlows([]);
    setSelectedCeFlowsByModule({});
    setInsightsActivos({});
  }, [product]);

  /* ─── Fetch BGC custom types when client + period ready ─── */
  useEffect(() => {
    if (product !== 'BGC') return;
    const clientField = selectedClient?.[PRODUCT_CLIENT_FIELD.BGC];
    if (!clientField || !periodData) {
      setCustomTypes([]);
      setSelectedTypes(new Set());
      return;
    }
    let cancelled = false;
    setCustomTypesLoading(true);
    fetch('https://n8n.zapsign.com.br/webhook/report-builder-bgc-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CLIENT_ID: clientField,
        fecha_inicio: periodData.fechaInicio,
        fecha_fin: periodData.fechaFin,
      }),
    })
      .then(r => r.json())
      .then((data: { custom_type: string; total_checks: number; pct_total: number }[]) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setCustomTypes(arr);
        setSelectedTypes(new Set(arr.map(t => t.custom_type)));
      })
      .catch(() => {
        if (!cancelled) { setCustomTypes([]); setSelectedTypes(new Set()); }
      })
      .finally(() => { if (!cancelled) setCustomTypesLoading(false); });
    return () => { cancelled = true; };
  }, [product, selectedClient, periodData?.fechaInicio, periodData?.fechaFin]);

  /* ─── Fetch DI flows when client or period changes ─── */
  useEffect(() => {
    if (product !== 'DI') return;
    const clientField = selectedClient?.[PRODUCT_CLIENT_FIELD.DI];
    if (!clientField || !periodData) {
      setDiFlows([]);
      setSelectedDiFlows(new Set());
      setDiFlowsError(false);
      return;
    }
    let cancelled = false;
    setDiFlowsLoading(true);
    setDiFlowsError(false);
    fetch('https://n8n.zapsign.com.br/webhook/report-builder-di-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CLIENT_ID: clientField,
        fecha_inicio: periodData.fechaInicio,
        fecha_fin: periodData.fechaFin,
      }),
    })
      .then(r => r.json())
      .then((data: { FLOW_ID: string; FLOW_NAME?: string | null; TOTAL_PROCESOS: number; USUARIOS_UNICOS: number; ULTIMO_USO: string }[]) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setDiFlows(arr);
        setSelectedDiFlows(new Set(arr.map(f => f.FLOW_ID)));
      })
      .catch(() => {
        if (!cancelled) { setDiFlows([]); setSelectedDiFlows(new Set()); setDiFlowsError(true); }
      })
      .finally(() => { if (!cancelled) setDiFlowsLoading(false); });
    return () => { cancelled = true; };
  }, [product, selectedClient, periodData?.fechaInicio, periodData?.fechaFin]);

  /* ─── Fetch CE flows when client or period changes ─── */
  useEffect(() => {
    if (product !== 'CE') return;
    const clientField = selectedClient?.[PRODUCT_CLIENT_FIELD.CE];
    if (!clientField || !periodData) {
      setCeFlows([]);
      setSelectedCeFlowsByModule({});
      return;
    }
    let cancelled = false;
    setCeFlowsLoading(true);
    fetch('https://n8n.zapsign.com.br/webhook/report-builder-ce-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CLIENT_ID: clientField,
        fecha_inicio: periodData.fechaInicio,
        fecha_fin: periodData.fechaFin,
      }),
    })
      .then(r => r.json())
      .then((data: any) => {
        if (cancelled) return;
        const arr = Array.isArray(data?.flujos) ? data.flujos : Array.isArray(data) ? data : [];
        setCeFlows(arr);
        // Default por módulo: cada KPI con selector arranca con todos los flujos
        const allIds = new Set<string>(arr.map((f: any) => f.flow_id));
        const initial: Record<string, Set<string>> = {};
        for (const modId of CE_FLOW_SELECTOR_MODULES) initial[modId] = new Set(allIds);
        setSelectedCeFlowsByModule(initial);
      })
      .catch(() => {
        if (!cancelled) { setCeFlows([]); setSelectedCeFlowsByModule({}); }
      })
      .finally(() => { if (!cancelled) setCeFlowsLoading(false); });
    return () => { cancelled = true; };
  }, [product, selectedClient, periodData?.fechaInicio, periodData?.fechaFin]);

  /* ─── Module toggle ─── */
  const toggleModule = useCallback((id: string) => {
    setActiveModuleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  /* ─── Step transitions ─── */
  const handleSelectProduct = (p: Product) => {
    setProduct(p);
    setStep('config');
  };

  const handleBackToWelcome = () => {
    setStep('welcome');
  };

  const handleContinueToBuilder = () => {
    setStep('builder');
  };

  const handleBackToConfig = () => {
    setStep('config');
  };

  const handleViewPresentation = () => {
    setStep('canvas');
  };

  const handleBackToBuilder = () => {
    setStep('builder');
  };

  const handleNewReport = () => {
    setReportData(null);
    setOverlayStatus(null);
    setStep('builder');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleConfigureClientId = () => {
    if (!selectedClient) return;
    setClientIdModal({
      product,
      clientId: selectedClient.id,
      clientName: selectedClient.nombre,
    });
  };

  /* ─── Job polling cleanup ─── */
  const jobCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { jobCleanupRef.current?.(); };
  }, []);

  /* ─── Generate report (async via Supabase) ─── */
  const handleGenerate = async () => {
    if (!canGenerate || !selectedClient || !periodData || !csmProfile) return;

    jobCleanupRef.current?.();
    jobCleanupRef.current = null;

    setOverlayStatus('generating');
    setReportData(null);

    const modules = MODULES[product];
    const payload: Record<string, any> = {
      CLIENT_ID: selectedClient[PRODUCT_CLIENT_FIELD[product]],
      fecha_inicio: periodData.fechaInicio,
      fecha_fin: periodData.fechaFin,
      periodo_reporte: periodData.periodoReporte,
      cliente: selectedClient.nombre,
      nombre_csm: csmProfile.nombre,
      csm_email: userEmail,
      con_ia: insightsMode === 'ai',
      insights_activos: insightsActivos,
      ...(sheetUrl.trim() && { sheet_url: sheetUrl.trim() }),
      base_modules: [modules.base.id],
      extra_modules: activeModuleIds.map(id => ({ id })),
      insights_ai: insightsMode === 'ai',
      insights_mode: insightsMode,
      modulos: [
        { id: modules.base.id, activo: true, insight_mode: null, insight_text: null },
        ...activeModuleIds.map(id => ({
          id,
          activo: true,
          insight_mode: moduleInsights[id]?.mode ?? null,
          insight_text: moduleInsights[id]?.mode === 'manual' ? (moduleInsights[id]?.text || null) : null,
        })),
      ],
    };

    if (product === 'CE' && ceFlows.length > 0) {
      // El backend (n8n Q3.1) recibe la UNIÓN de todas las selecciones por módulo —
      // así corre el query per-flow una sola vez por flow_id, y el frontend filtra al
      // renderizar cada slide según su selección específica.
      const union = new Set<string>();
      for (const set of Object.values(selectedCeFlowsByModule)) {
        for (const id of set) union.add(id);
      }
      const selected = ceFlows.filter(f => union.has(f.flow_id));
      payload.flujos_seleccionados = selected.map(f => ({
        flow_id: f.flow_id,
        flow_name: f.flow_name,
        tiene_vrf: f.tiene_vrf,
        tiene_outbound: f.tiene_outbound,
      }));
      // Selección por módulo y total de flujos disponibles. El backend usa esto para
      // filtrar Ce4 (5_flujo_inbound) por flujo si el subset es estricto. Cualquier
      // otro caso (todos seleccionados, frontend viejo) → query global como hoy.
      payload.flujos_seleccionados_por_modulo = Object.fromEntries(
        Object.entries(selectedCeFlowsByModule).map(([mid, set]) => [mid, Array.from(set)])
      );
      payload.flujos_disponibles_total = ceFlows.length;
    }

    if (product === 'BGC' && customTypes.length >= 2) {
      payload.custom_types = selectedTypes.size === customTypes.length
        ? 'ALL'
        : Array.from(selectedTypes);
    }

    if (product === 'DI' && diFlows.length > 0) {
      payload.flow_ids = selectedDiFlows.size === diFlows.length
        ? 'ALL'
        : Array.from(selectedDiFlows);
    }

    const useAsync = product === 'CE';

    if (!useAsync) {
      /* ── Sync path (DI / BGC) ── */
      try {
        console.log('Payload:', payload);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300_000);

        const res = await fetch(PRODUCT_WEBHOOKS[product], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          let raw = await res.json().catch(() => ({}));
          if (Array.isArray(raw)) raw = raw[0] ?? {};
          console.log('Response:', raw);
          if (raw.status === 'success' && raw.data) {
            setReportData(raw);
            setOverlayStatus('success');
          } else {
            setOverlayStatus('error');
          }
        } else {
          console.error('Webhook error:', res.status);
          setOverlayStatus('error');
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setOverlayStatus('error');
      }
      return;
    }

    /* ── Async path (CE) ── */

    /* 1. Create job in Supabase */
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? '';

    const { data: job, error: insertErr } = await supabase
      .from('mbr_jobs')
      .insert({
        cliente: selectedClient.nombre,
        periodo: periodData.periodoReporte,
        producto: product,
        csm_nombre: csmProfile.nombre,
        csm_email: userEmail,
        status: 'en_proceso',
        payload: payload as any,
        sheets_url: sheetUrl || '',
        user_id: userId,
      })
      .select('id')
      .single();

    if (insertErr || !job) {
      console.error('Job insert error:', insertErr);
      setOverlayStatus('error');
      return;
    }

    console.log('Job created:', job.id);

    /* 2. Fire webhook with job_id (fire-and-forget) */
    fetch(PRODUCT_WEBHOOKS[product], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, job_id: job.id }),
    }).catch(() => {});

    /* 3. Listen for completion via realtime + polling fallback */
    let resolved = false;

    const handleJobResult = (row: { status: string; result?: any }) => {
      if (resolved) return;
      if (row.status === 'finalizado' && row.result) {
        resolved = true;
        let data = row.result;
        if (Array.isArray(data)) data = data[0] ?? {};
        console.log('Job result:', data);
        if (data.status === 'success' && data.data) {
          setReportData(data as ReportData);
          setOverlayStatus('success');
        } else {
          setOverlayStatus('error');
        }
        cleanup();
      } else if (row.status === 'fallido') {
        resolved = true;
        setOverlayStatus('error');
        cleanup();
      }
    };

    const channel = supabase
      .channel(`job-${job.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mbr_jobs', filter: `id=eq.${job.id}` },
        (payload) => handleJobResult(payload.new as any),
      )
      .subscribe();

    const pollId = setInterval(async () => {
      if (resolved) return;
      const { data } = await supabase
        .from('mbr_jobs')
        .select('status, result')
        .eq('id', job.id)
        .single();
      if (data) handleJobResult(data);
    }, 15_000);

    const maxTimeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.error('Job timeout after 15 min');
      setOverlayStatus('error');
      cleanup();
    }, 900_000);

    const cleanup = () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
      clearTimeout(maxTimeout);
      jobCleanupRef.current = null;
    };

    jobCleanupRef.current = cleanup;
  };

  /* ─── Dev mock ─── */
  const loadMock = () => {
    setTheme('dark');
    setOverlayStatus(null);
    setStep('builder');
    setReportData({
      status: 'success',
      data: {
        '1_metricas_generales': [{
          bloque: '1_metricas_generales',
          col1: '26603', col2: '20995', col3: '4891', col4: '2318',
          col5: '1876', col6: '697', col7: '523', col8: '78.9',
          col9: '24100', col10: '18800', col11: '78.0', col_extra1: '10.4',
        }],
        '2_usuarios_reintentos': [{
          bloque: '2_usuarios_reintentos',
          col1: '18450', col2: '14600', col3: '79.1',
        }],
      },
      warnings: [],
    });
  };

  /* ─── Unión de selecciones por módulo (lo que efectivamente se renderiza para algún KPI) ─── */
  const ceFlowsSelectedUnion = (() => {
    const union = new Set<string>();
    for (const set of Object.values(selectedCeFlowsByModule)) {
      for (const id of set) union.add(id);
    }
    return union;
  })();

  /* ─── CE flows que cualquier módulo va a usar (cast para CeFlowData shape) ─── */
  const selectedCeFlowsForCarrete = ceFlows
    .filter(f => ceFlowsSelectedUnion.has(f.flow_id)) as unknown as CeFlowData[];

  /* ─── CE: modo "flow-specific" — solo los KPIs que GENERAN slides per-flow (Ce8/9/10/11)
   * cuentan para esto. Si alguno está activo con subset, los slides globales (Ce1/2/3/5/6/7)
   * se omiten para no mezclar análisis per-flow con métricas de cuenta entera.
   * Ce4 (5_flujo_inbound) tiene su propio filtro pero NO genera slides per-flow → no cuenta. */
  const PER_FLOW_GENERATING_MODULES = ['4_funnel_generico', '4b_funnel_steps', '4c_vrf', '4d_vrf_arbol'] as const;
  const isCeFlowSpecific = product === 'CE' && ceFlows.length > 0 &&
    PER_FLOW_GENERATING_MODULES.some(modId => {
      if (!activeModuleIds.includes(modId)) return false;
      const sel = selectedCeFlowsByModule[modId];
      return !!sel && sel.size > 0 && sel.size < ceFlows.length;
    });

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      <MeshBackground />

      {/* ── Paso 1: Welcome ── */}
      {step === 'welcome' && (
        <WelcomeStep
          csmProfile={csmProfile}
          userEmail={userEmail}
          onSelectProduct={handleSelectProduct}
          onLogout={handleLogout}
          source={source}
        />
      )}

      {/* ── Paso 2: Config ── */}
      {step === 'config' && (
        <ConfigStep
          product={product}
          csmProfile={csmProfile}
          userEmail={userEmail}
          clients={clients}
          selectedClientId={selectedClientId}
          setSelectedClientId={setSelectedClientId}
          periodValue={periodValue}
          setPeriodValue={setPeriodValue}
          isLoading={isLoading}
          canContinue={canContinue}
          isAdmin={isAdmin}
          sheetUrl={sheetUrl}
          setSheetUrl={setSheetUrl}
          onBack={handleBackToWelcome}
          onContinue={handleContinueToBuilder}
          onReloadClients={() => loadSessionData(userEmail)}
          onConfigureClientId={handleConfigureClientId}
          source={source}
        />
      )}

      {/* ── Paso 3: Builder (LeftPanel + ReportCarrete) ── */}
      {step === 'builder' && (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          <LeftPanel
            product={product}
            clientName={selectedClient?.nombre || ''}
            periodLabel={periodData?.periodoReporte || ''}
            csmProfile={csmProfile}
            userEmail={userEmail}
            activeModuleIds={activeModuleIds}
            toggleModule={toggleModule}
            moduleInsights={moduleInsights}
            setModuleInsight={setModuleInsight}
            insightsMode={insightsMode}
            setInsightsMode={setInsightsMode}
            insightsActivos={insightsActivos}
            setInsightsActivos={setInsightsActivos}
            theme={theme}
            setTheme={setTheme}
            ceFlows={ceFlows}
            selectedCeFlowsByModule={selectedCeFlowsByModule}
            setModuleFlowSelection={(moduleId, next) =>
              setSelectedCeFlowsByModule(prev => ({ ...prev, [moduleId]: next }))
            }
            ceFlowsLoading={ceFlowsLoading}
            customTypes={customTypes}
            selectedTypes={selectedTypes}
            setSelectedTypes={setSelectedTypes}
            customTypesLoading={customTypesLoading}
            diFlows={diFlows}
            selectedDiFlows={selectedDiFlows}
            setSelectedDiFlows={setSelectedDiFlows}
            diFlowsLoading={diFlowsLoading}
            diFlowsError={diFlowsError}
            showUpdates={showUpdates}
            setShowUpdates={setShowUpdates}
            canGenerate={canGenerate}
            overlayStatus={overlayStatus}
            onGenerate={handleGenerate}
            onBack={handleBackToConfig}
          />
          <WabaNamesProvider clientId={selectedClient?.client_id_ce}>
            <ReportCarrete
              product={product}
              clientName={selectedClient?.nombre || ''}
              periodLabel={periodData?.periodoReporte || ''}
              csmName={csmProfile?.nombre || userEmail}
              activeModuleIds={activeModuleIds}
              insightsMode={insightsMode}
              moduleInsights={moduleInsights}
              ceFlows={selectedCeFlowsForCarrete}
              selectedCeFlowsByModule={selectedCeFlowsByModule}
              theme={theme}
              reportData={reportData}
              overlayStatus={overlayStatus}
              isCeFlowSpecific={isCeFlowSpecific}
              showUpdates={showUpdates}
              onOverlayClose={() => setOverlayStatus(null)}
              onRetry={handleGenerate}
              onViewPresentation={handleViewPresentation}
              onNewReport={handleNewReport}
              onModuleInsightChange={(id, text) => setModuleInsight(id, 'manual', text)}
              generalInsightText={generalInsightText}
              onGeneralInsightChange={setGeneralInsightText}
            />
          </WabaNamesProvider>
        </div>
      )}

      {/* ── Paso 4: Canvas (full-screen presentation) ── */}
      {step === 'canvas' && (
        <div style={{ position: 'relative', zIndex: 1, height: '100vh' }}>
          <WabaNamesProvider clientId={selectedClient?.client_id_ce}>
            <CenterCanvas
              product={product}
              clientName={selectedClient?.nombre || 'Cliente Demo'}
              periodLabel={periodData?.periodoReporte || ''}
              activeModuleIds={activeModuleIds}
              insightsMode={insightsMode}
              moduleInsights={moduleInsights}
              overlayStatus={overlayStatus}
              reportData={reportData}
              theme={theme}
              selectedCeFlowsByModule={selectedCeFlowsByModule}
              isCeFlowSpecific={isCeFlowSpecific}
              showUpdates={showUpdates}
              onOverlayClose={() => setOverlayStatus(null)}
              onNewReport={handleNewReport}
              onRetry={handleGenerate}
              onBack={handleBackToBuilder}
              onModuleInsightChange={(id, text) => setModuleInsight(id, 'manual', text)}
              generalInsightText={generalInsightText}
              onGeneralInsightChange={setGeneralInsightText}
            />
          </WabaNamesProvider>
        </div>
      )}

      {/* ── ClientIdModal (global) ── */}
      {clientIdModal && (
        <ClientIdModal
          key={`${clientIdModal.clientId}-${clientIdModal.product}`}
          open
          onClose={() => setClientIdModal(null)}
          product={clientIdModal.product}
          clientId={clientIdModal.clientId}
          clientName={clientIdModal.clientName}
          onSuccess={(clienteId, campo, nuevoId) => {
            setClients((prev) =>
              prev.map((client) =>
                client.id === clienteId
                  ? ({ ...client, [campo]: nuevoId } as ClienteRow)
                  : client
              )
            );
            setClientIdModal(null);
          }}
        />
      )}

      {/* ── Dev mock button ── */}
      {import.meta.env.DEV && (
        <button
          onClick={loadMock}
          style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, background: '#6B4EFF', color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 18px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: 0.9,
          }}
        >
          🧪 Mock Builder
        </button>
      )}
    </div>
  );
};

export default Index;
