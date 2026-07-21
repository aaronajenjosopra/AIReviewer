import React, { useState } from "react";
import { Project, Platform } from "../types";
import { 
  GitPullRequest, Search, RefreshCw, FolderGit, Layout, Cpu, 
  ArrowRight, ShieldAlert, ChevronRight, User, Globe
} from "lucide-react";

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onRefresh: () => void;
  isLoading: boolean;
  onStartReviewForPR: (pr: { id: string; title: string; webUrl: string; sourceBranch: string; targetBranch: string }) => void;
  token: string;
  baseUrl?: string;
  isDemo?: boolean;
}

export default function ProjectList({ 
  projects, 
  onSelectProject, 
  onRefresh, 
  isLoading, 
  onStartReviewForPR,
  token,
  baseUrl,
  isDemo
}: ProjectListProps) {
  const [search, setSearch] = useState("");
  const [selectedPRFetchId, setSelectedPRFetchId] = useState<string | null>(null);
  const [openPRs, setOpenPRs] = useState<{ id: string; title: string; webUrl: string; sourceBranch: string; targetBranch: string; author: string }[]>([]);
  const [isFetchingPRs, setIsFetchingPRs] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleReviewPRClick = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // Avoid triggering project detail navigation
    setSelectedPRFetchId(project.id);
    setIsFetchingPRs(true);
    setPrError(null);
    setOpenPRs([]);

    try {
      const response = await fetch("/api/project-prs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: project.platform,
          token,
          baseUrl,
          projectId: project.id
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch merge requests: ${response.statusText}`);
      }

      const data = await response.json();
      setOpenPRs(data.prs || []);
    } catch (err: any) {
      console.error(err);
      setPrError("No se pudieron cargar las PRs/MRs activas para este proyecto.");
    } finally {
      setIsFetchingPRs(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and control header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FolderGit className="w-5 h-5 text-indigo-500" />
            Tus Proyectos y Repositorios
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Haz clic en un proyecto para ver sus tareas del Sprint actual, o presiona <b>Revisar PR</b> para iniciar un análisis inteligente.
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar proyectos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200/50 dark:border-slate-800 transition-all shrink-0 cursor-pointer disabled:opacity-50"
            title="Refrescar proyectos"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="bg-amber-500/10 border border-amber-500/20 px-5 py-4 rounded-2xl flex items-start gap-3.5">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
            <span className="font-bold">Modo de Demostración Activo:</span> Mostrando un entorno Sandbox enriquecido de alta fidelidad. Puedes ver proyectos simulados, sprints reales simulados, generar subtareas con Inteligencia Artificial e incluso realizar simulaciones completas de revisión de Pull Requests.
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">
          <FolderGit className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No se encontraron proyectos</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            Intenta cambiar el término de búsqueda o refresca la lista.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredProjects.map((project) => {
            const isPRDrawerOpen = selectedPRFetchId === project.id;

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project)}
                className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800/80 p-6 hover:shadow-xl hover:border-slate-200/70 dark:hover:border-slate-700 transition-all duration-300 cursor-pointer flex flex-col justify-between space-y-4"
              >
                {/* Upper Details */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        {project.platform === Platform.GITLAB ? (
                          <Layout className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Cpu className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {project.platform === Platform.GITLAB ? "GitLab" : "Azure DevOps"}
                      </span>
                    </div>

                    {/* Open PRs count Badge */}
                    <div className="flex items-center gap-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-1 rounded-full border border-indigo-100/30">
                      <GitPullRequest className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                        {project.openPRCount} Abiertas
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                      {project.name}
                      <ChevronRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="border-t border-slate-50 dark:border-slate-800/50 pt-4 flex items-center justify-between gap-3">
                  {project.owner && (
                    <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      {project.owner}
                    </span>
                  )}

                  <button
                    onClick={(e) => handleReviewPRClick(e, project)}
                    className="ml-auto py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    Revisar PR
                  </button>
                </div>

                {/* Inline PRs Drawer (collapsible menu) */}
                {isPRDrawerOpen && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl space-y-3 cursor-default"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <GitPullRequest className="w-3.5 h-3.5 text-indigo-500" />
                        Pull Requests Abiertas ({openPRs.length})
                      </h4>
                      <button
                        onClick={() => setSelectedPRFetchId(null)}
                        className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold underline cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>

                    {isFetchingPRs && (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                        <svg className="animate-spin h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Cargando PRs...
                      </div>
                    )}

                    {prError && (
                      <p className="text-xs text-red-500 text-center py-2">{prError}</p>
                    )}

                    {!isFetchingPRs && !prError && openPRs.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">No hay Pull Requests abiertas en este repositorio.</p>
                    )}

                    {!isFetchingPRs && !prError && openPRs.length > 0 && (
                      <div className="space-y-2 overflow-y-auto max-h-48 pr-1">
                        {openPRs.map((pr) => (
                          <div
                            key={pr.id}
                            className="bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-indigo-100 dark:hover:border-indigo-950 transition-all duration-200"
                          >
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug line-clamp-1">
                                {pr.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400 font-mono">
                                <span className="bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px] text-slate-500 font-bold">#{pr.id}</span>
                                <span>Por {pr.author}</span>
                                <span>•</span>
                                <span className="text-indigo-500 font-medium">{pr.sourceBranch} &rarr; {pr.targetBranch}</span>
                              </div>
                            </div>

                            <div className="flex gap-2 self-end md:self-center">
                              <a
                                href={pr.webUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 rounded-lg border border-slate-200/50 dark:border-slate-800 text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center shrink-0"
                                title="Ver en plataforma"
                              >
                                <Globe className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => onStartReviewForPR(pr)}
                                className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                Analizar <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
