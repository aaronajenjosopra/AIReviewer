import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Platform, PRAnalysisResult, AnalysisStep, Project, TaskIssue, SprintInfo } from "./types";
import PRInputForm from "./components/PRInputForm";
import AnalysisProgress from "./components/AnalysisProgress";
import ReviewDashboard from "./components/ReviewDashboard";
import FileAnalysisViewer from "./components/FileAnalysisViewer";
import CredentialsForm from "./components/CredentialsForm";
import ProjectList from "./components/ProjectList";
import ProjectDetail from "./components/ProjectDetail";
import AITaskEnhancer from "./components/AITaskEnhancer";
import { 
  GitPullRequest, ShieldAlert, CheckCircle2, Terminal, RefreshCw, 
  Layers, FolderGit, Key, LogOut, Code, Sparkles, Sun, Moon
} from "lucide-react";

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PRAnalysisResult | null>(null);
  const [tokenUsed, setTokenUsed] = useState("");
  
  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("app_theme");
    if (saved === "light" || saved === "dark") return saved;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });

  // Apply theme to document
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  // Connection and Workspace States
  const [connection, setConnection] = useState<{ platform: Platform; token: string; baseUrl?: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Navigation tabs
  const [activeMenuTab, setActiveMenuTab] = useState<"workspace" | "manual_review">("workspace");

  // Selected details
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDetails, setProjectDetails] = useState<{ description: string; tasks: TaskIssue[]; sprint?: SprintInfo } | null>(null);
  const [isLoadingProjectDetails, setIsLoadingProjectDetails] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskIssue | null>(null);

  // Progress Steps
  const [steps, setSteps] = useState<AnalysisStep[]>([
    { id: "url", label: "Procesando URL", description: "Analizando URL del Pull Request e identificando plataforma.", status: "idle" },
    { id: "meta", label: "Consultando API del repositorio", description: "Verificando conexión y extrayendo metadatos de la rama.", status: "idle" },
    { id: "diff", label: "Extrayendo diffs de archivos", description: "Obteniendo los archivos modificados y sus diffs unificados.", status: "idle" },
    { id: "gemini", label: "Análisis inteligente con OpenAI IA", description: "Buscando fallos lógicos, problemas de seguridad y optimizaciones de rendimiento.", status: "idle" },
    { id: "report", label: "Generando reporte de calidad", description: "Creando score de salud del código y compilando anotaciones.", status: "idle" }
  ]);

  // Attempt automatic login from sessionStorage if available
  useEffect(() => {
    const savedPlatform = sessionStorage.getItem("pr_platform") as Platform;
    const savedToken = sessionStorage.getItem("pr_token");
    const savedBaseUrl = sessionStorage.getItem("pr_baseUrl");

    if (savedPlatform && savedToken) {
      handleConnect(savedPlatform, savedToken, savedBaseUrl || undefined);
    }
  }, []);

  const handleConnect = async (platform: Platform, token: string, baseUrl?: string) => {
    setIsConnecting(true);
    setConnectError(undefined);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, token, baseUrl })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fallo al conectar con el servidor de la plataforma.");
      }

      const data = await res.json();
      setProjects(data.projects || []);
      setIsDemoMode(!!data.isDemo);
      setConnection({ platform, token, baseUrl });
      
      // Keep legacy token state updated for original manual flow compatibility
      setTokenUsed(token);
    } catch (err: any) {
      console.error("Connect error:", err);
      setConnectError(err.message || "No se pudo conectar a la plataforma. Verifica tu token y URL.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem("pr_platform");
    sessionStorage.removeItem("pr_token");
    sessionStorage.removeItem("pr_baseUrl");
    setConnection(null);
    setProjects([]);
    setSelectedProject(null);
    setProjectDetails(null);
    setSelectedTask(null);
    setAnalysisResult(null);
  };

  const handleSelectProject = async (project: Project) => {
    if (!connection) return;
    setSelectedProject(project);
    setSelectedTask(null);
    setProjectDetails(null);
    setIsLoadingProjectDetails(true);

    try {
      const res = await fetch("/api/project-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: project.platform,
          token: connection.token,
          baseUrl: connection.baseUrl,
          projectId: project.id
        })
      });

      if (!res.ok) {
        throw new Error("No se pudieron cargar los detalles del proyecto.");
      }

      const data = await res.json();
      setProjectDetails({
        description: data.description,
        tasks: data.tasks || [],
        sprint: data.sprint
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingProjectDetails(false);
    }
  };

  const handleStartReviewForPR = (pr: { id: string; title: string; webUrl: string; sourceBranch: string; targetBranch: string }) => {
    // Fill URL and launch review pipeline
    if (!connection) return;
    
    // Switch to manual tab and run review
    setActiveMenuTab("manual_review");
    handleStartReview({
      platform: connection.platform,
      url: pr.webUrl,
      token: connection.token
    });
  };

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
    setTokenUsed(formData.token || connection?.token || "");

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
        : { url: formData.url, token: formData.token || connection?.token, platform: formData.platform };

      // Transition Step 3 to success before starting GPT-4o
      updateStepStatus("diff", "success");
      
      // Step 4: Loading AI Reviewer
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
      
      // Mark current active step as error
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
              <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base flex items-center gap-1.5">
                PR Reviewer IA
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-normal px-1.5 py-0.5 rounded-full">
                  v2.0
                </span>
              </span>
              <p className="text-[10px] text-slate-400 font-medium">Workspace Inteligente de Devs</p>
            </div>
          </div>

          {/* Navigation and Connection controls */}
          <div className="flex items-center gap-3">
            {connection && (
              <div className="flex items-center gap-1 bg-slate-100/60 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
                <button
                  onClick={() => {
                    setActiveMenuTab("workspace");
                    setSelectedProject(null);
                    setSelectedTask(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeMenuTab === "workspace" && !analysisResult
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <FolderGit className="w-3.5 h-3.5 text-indigo-500" />
                  Mis Proyectos
                </button>
                
                <button
                  onClick={() => {
                    setActiveMenuTab("manual_review");
                    setAnalysisResult(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeMenuTab === "manual_review" || analysisResult
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Code className="w-3.5 h-3.5 text-indigo-500" />
                  Revisión de PR
                </button>

                <button
                  onClick={handleDisconnect}
                  className="px-2.5 py-1.5 text-red-500 hover:bg-red-500/5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  title="Desconectar Workspace"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            )}

            {/* Light/Dark Mode Switch */}
            <button
              onClick={() => setTheme(prev => prev === "light" ? "dark" : "light")}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 transition-all border border-slate-200/40 dark:border-slate-800 cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Toggle Theme"
              title={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
            >
              {theme === "light" ? (
                <Moon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>

            <div className="hidden lg:flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 border-l border-slate-200/40 dark:border-slate-800 pl-3">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                OpenAI GPT-4o Activo
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          
          {/* 1. Request connection form if not authenticated */}
          {!connection && (
            <motion.div
              key="auth-form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="py-8"
            >
              <div className="text-center max-w-3xl mx-auto mb-8 space-y-3">
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                  Tu Asistente IA de Desarrollo Avanzado
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
                  Conecta tu repositorio de <b>GitLab</b> o <b>Azure DevOps / TFS</b>. Explora sprints actuales, analiza subtareas de backlog con IA, redacta especificaciones técnicas, y realiza auditorías de código inteligentes de forma instantánea.
                </p>
              </div>

              <CredentialsForm 
                onConnect={handleConnect} 
                isLoading={isConnecting} 
                error={connectError} 
              />
            </motion.div>
          )}

          {/* 2. Connected Workspace */}
          {connection && (
            <div className="space-y-6">
              
              {/* Tab Content A: Projects Workspace */}
              {activeMenuTab === "workspace" && !analysisResult && (
                <motion.div
                  key="workspace-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Task Enhancer View */}
                  {selectedProject && selectedTask && projectDetails && (
                    <AITaskEnhancer
                      task={selectedTask}
                      projectId={selectedProject.id}
                      projectName={selectedProject.name}
                      platform={connection.platform}
                      token={connection.token}
                      baseUrl={connection.baseUrl}
                      onBack={() => setSelectedTask(null)}
                      onUpdateSuccess={(newDesc) => {
                        // Dynamically update description in active local task detail list
                        setProjectDetails(prev => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            tasks: prev.tasks.map(t => t.id === selectedTask.id ? { ...t, description: newDesc } : t)
                          };
                        });
                        setSelectedTask(prev => prev ? { ...prev, description: newDesc } : null);
                      }}
                    />
                  )}

                  {/* Project Detail view */}
                  {selectedProject && !selectedTask && (
                    <ProjectDetail
                      project={selectedProject}
                      description={projectDetails?.description || ""}
                      tasks={projectDetails?.tasks || []}
                      sprint={projectDetails?.sprint}
                      isLoading={isLoadingProjectDetails}
                      onBack={() => setSelectedProject(null)}
                      onSelectTask={(task) => setSelectedTask(task)}
                      token={connection.token}
                      baseUrl={connection.baseUrl}
                    />
                  )}

                  {/* Root project list */}
                  {!selectedProject && !selectedTask && (
                    <ProjectList
                      projects={projects}
                      onSelectProject={handleSelectProject}
                      onRefresh={() => handleConnect(connection.platform, connection.token, connection.baseUrl)}
                      isLoading={isConnecting}
                      onStartReviewForPR={handleStartReviewForPR}
                      token={connection.token}
                      baseUrl={connection.baseUrl}
                      isDemo={isDemoMode}
                    />
                  )}
                </motion.div>
              )}

              {/* Tab Content B: Manual Review or Active Analysis */}
              {(activeMenuTab === "manual_review" || analysisResult) && (
                <motion.div
                  key="manual-review-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Form screen */}
                  {!isLoading && !analysisResult && (
                    <div className="space-y-6">
                      <div className="text-center max-w-3xl mx-auto my-4 space-y-2">
                        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                          Revisión Directa de Código y Pull Requests
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xl mx-auto leading-relaxed">
                          Ingresa cualquier enlace URL de Merge Request / PR directamente o pega un diff unificado para ejecutar una auditoría de calidad integral.
                        </p>
                      </div>

                      <PRInputForm onSubmit={handleStartReview} isLoading={isLoading} />
                    </div>
                  )}

                  {/* Progress screen */}
                  {isLoading && (
                    <div className="py-12">
                      <AnalysisProgress steps={steps} />
                      
                      <div className="text-center mt-6">
                        <button
                          type="button"
                          onClick={() => setIsLoading(false)}
                          className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
                        >
                          Cancelar análisis y volver
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dashboard and review panel screen */}
                  {!isLoading && analysisResult && (
                    <div className="space-y-8">
                      {/* Back to form link */}
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setAnalysisResult(null)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 transition-all cursor-pointer"
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
                          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight font-sans">
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
                    </div>
                  )}
                </motion.div>
              )}

            </div>
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
