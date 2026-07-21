import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Platform, PRAnalysisResult, AnalysisStep } from "./types";
import PRInputForm from "./components/PRInputForm";
import AnalysisProgress from "./components/AnalysisProgress";
import ReviewDashboard from "./components/ReviewDashboard";
import FileAnalysisViewer from "./components/FileAnalysisViewer";
import { GitPullRequest, ShieldAlert, CheckCircle2, Terminal, RefreshCw, Layers } from "lucide-react";

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PRAnalysisResult | null>(null);
  const [tokenUsed, setTokenUsed] = useState("");
  
  // Progress Steps
  const [steps, setSteps] = useState<AnalysisStep[]>([
    { id: "url", label: "Procesando URL", description: "Analizando URL del Pull Request e identificando plataforma.", status: "idle" },
    { id: "meta", label: "Consultando API del repositorio", description: "Verificando conexión y extrayendo metadatos de la rama.", status: "idle" },
    { id: "diff", label: "Extrayendo diffs de archivos", description: "Obteniendo los archivos modificados y sus diffs unificados.", status: "idle" },
    { id: "gemini", label: "Análisis inteligente con OpenAI GPT-4o", description: "Buscando fallos lógicos, problemas de seguridad y optimizaciones de rendimiento.", status: "idle" },
    { id: "report", label: "Generando reporte de calidad", description: "Creando score de salud del código y compilando anotaciones.", status: "idle" }
  ]);

  const updateStepStatus = (stepId: string, status: "idle" | "running" | "success" | "error", errorMsg?: string) => {
    setSteps(prev => prev.map(step => {
      if (step.id === stepId) {
        return { ...step, status, errorMsg };
      }
      return step;
    }));
  };

  const handleStartReview = async (formData: {
    platform: Platform;
    url?: string;
    token?: string;
    title?: string;
    description?: string;
    diffText?: string;
  }) => {
    setIsLoading(true);
    setAnalysisResult(null);
    setTokenUsed(formData.token || "");

    // Reset Steps to idle
    setSteps(prev => prev.map(s => ({ ...s, status: "idle", errorMsg: undefined })));

    try {
      // Step 1: Processing URL / Input
      updateStepStatus("url", "running");
      await new Promise(resolve => setTimeout(resolve, 800));
      updateStepStatus("url", "success");

      // Step 2: Querying API or setup input
      updateStepStatus("meta", "running");
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateStepStatus("meta", "success");

      // Step 3: Fetching files / diffs
      updateStepStatus("diff", "running");
      
      const endpoint = formData.platform === Platform.MANUAL ? "/api/review-manual" : "/api/review";
      const body = formData.platform === Platform.MANUAL 
        ? { title: formData.title, description: formData.description, diffText: formData.diffText }
        : { url: formData.url, token: formData.token, platform: formData.platform };

      // Transition Step 3 to success before starting Gemini API
      updateStepStatus("diff", "success");
      
      // Step 4: Loading Gemini AI Reviewer
      updateStepStatus("gemini", "running");

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const errMsg = errBody.error || `Error del servidor (${response.status})`;
        throw new Error(errMsg);
      }

      const data: PRAnalysisResult = await response.json();

      updateStepStatus("gemini", "success");

      // Step 5: Structuring quality report
      updateStepStatus("report", "running");
      await new Promise(resolve => setTimeout(resolve, 600));
      updateStepStatus("report", "success");

      // Set Final Result
      setAnalysisResult(data);
      setIsLoading(false);

    } catch (err: any) {
      console.error(err);
      
      // Mark current active step as error or default to url
      setSteps(prev => {
        const runningStep = prev.find(s => s.status === "running") || prev.find(s => s.status === "success");
        if (runningStep) {
          return prev.map(s => s.id === runningStep.id ? { ...s, status: "error", errorMsg: err.message } : s);
        }
        return prev.map((s, idx) => idx === 0 ? { ...s, status: "error", errorMsg: err.message } : s);
      });
      
      setIsLoading(false);
    }
  };

  const handlePublishComments = async (token: string) => {
    if (!analysisResult) return { success: false, results: [] };
    
    try {
      const response = await fetch("/api/publish-comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: analysisResult.prDetails.webUrl,
          token: token,
          platform: analysisResult.prDetails.platform,
          annotations: analysisResult.report.annotations
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Fallo al comunicar con el endpoint de publicación.");
      }

      const data = await response.json();
      return { success: true, results: data.results || [] };
    } catch (err: any) {
      console.error("Error publishing comments:", err);
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans selection:bg-indigo-500 selection:text-white pb-12">
      {/* Top Header navbar */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-sm shadow-indigo-600/30 flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white font-sans tracking-tight text-base flex items-center gap-1.5">
                PR Reviewer IA
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-normal px-1.5 py-0.5 rounded-full">
                  v1.2
                </span>
              </span>
              <p className="text-[10px] text-slate-400 font-medium">Revisión Automatizada de Código</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              OpenAI GPT-4o Activo
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Form screen */}
          {!isLoading && !analysisResult && (
            <motion.div
              key="input-form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Marketing hero line */}
              <div className="text-center max-w-3xl mx-auto my-6 space-y-3">
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                  Lleva la Calidad de tu Código al Siguiente Nivel
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
                  Conecta tu MR/PR de <b>GitLab</b> o <b>Azure DevOps</b> e identifica de forma instantánea vulnerabilidades de seguridad, problemas de rendimiento, fallos de lógica y sugerencias de refactorización.
                </p>
              </div>

              <PRInputForm onSubmit={handleStartReview} isLoading={isLoading} />
            </motion.div>
          )}

          {/* Progress screen */}
          {isLoading && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="py-12"
            >
              <AnalysisProgress steps={steps} />
              
              {/* Cancel analysis helper */}
              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={() => setIsLoading(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
                >
                  Cancelar análisis y volver al inicio
                </button>
              </div>
            </motion.div>
          )}

          {/* Dashboard and review panel screen */}
          {!isLoading && analysisResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              {/* Back to form link */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAnalysisResult(null)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 transition-all"
                >
                  &larr; Volver a ingresar URL
                </button>
                <span className="text-xs text-slate-400 font-mono">
                  Reporte ID: {analysisResult.prDetails.id}
                </span>
              </div>

              {/* Quality score and analysis details */}
              <ReviewDashboard
                prDetails={analysisResult.prDetails}
                report={analysisResult.report}
                totalFiles={analysisResult.files.length}
                onPublishComments={handlePublishComments}
                onReset={() => setAnalysisResult(null)}
                tokenUsed={tokenUsed}
              />

              {/* Code viewer with annotations */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight font-sans">
                    Detalle de Archivos Analizados
                  </h2>
                  <p className="text-xs text-slate-400">
                    Haz clic en los archivos de la barra izquierda para revisar las anotaciones e inline-comentarios sugeridos por la IA.
                  </p>
                </div>
                <FileAnalysisViewer
                  files={analysisResult.files}
                  annotations={analysisResult.report.annotations}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-100 dark:border-slate-900/60 pt-6">
        <p>© 2026 PR Reviewer IA • Desarrollado con tecnología OpenAI GPT-4o</p>
      </footer>
    </div>
  );
}
