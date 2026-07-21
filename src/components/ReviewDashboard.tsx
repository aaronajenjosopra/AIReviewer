import React, { useState } from "react";
import { PRDetails, ReviewReport, IssueCategory, FileAnnotation, Platform } from "../types";
import { 
  GitPullRequest, GitBranch, Shield, AlertTriangle, Bug, Eye, 
  Cpu, Sparkles, Check, CloudLightning, Download, Play, Info, 
  RefreshCw, CheckCircle2, ChevronRight, FileCode, AlertOctagon,
  Activity, User
} from "lucide-react";

interface ReviewDashboardProps {
  prDetails: PRDetails;
  report: ReviewReport;
  totalFiles: number;
  onPublishComments: (token: string) => Promise<{ success: boolean; results: any[] }>;
  onReset: () => void;
  tokenUsed: string;
}

export default function ReviewDashboard({ 
  prDetails, 
  report, 
  totalFiles, 
  onPublishComments, 
  onReset,
  tokenUsed
}: ReviewDashboardProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{
    published: boolean;
    successCount: number;
    errorCount: number;
    message?: string;
  } | null>(null);

  // Group annotations by category
  const bugCount = report.annotations.filter(a => a.category === IssueCategory.BUG).length;
  const securityCount = report.annotations.filter(a => a.category === IssueCategory.SECURITY).length;
  const perfCount = report.annotations.filter(a => a.category === IssueCategory.PERFORMANCE).length;
  const styleCount = report.annotations.filter(a => a.category === IssueCategory.STYLE).length;
  const refactorCount = report.annotations.filter(a => a.category === IssueCategory.REFACTOR).length;

  const criticalCount = report.annotations.filter(a => a.severity === "critical").length;
  const warningCount = report.annotations.filter(a => a.severity === "warning").length;
  const suggestionCount = report.annotations.filter(a => a.severity === "suggestion").length;

  // Code quality score styling
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-500 stroke-emerald-500 bg-emerald-50 dark:bg-emerald-950/20";
    if (score >= 60) return "text-amber-500 stroke-amber-500 bg-amber-50 dark:bg-amber-950/20";
    return "text-red-500 stroke-red-500 bg-red-50 dark:bg-red-950/20";
  };

  const getScoreDescription = (score: number) => {
    if (score >= 85) return "Excelente calidad";
    if (score >= 70) return "Buena calidad";
    if (score >= 50) return "Calidad regular";
    return "Requiere mejoras críticas";
  };

  const handlePublish = async () => {
    if (!tokenUsed && prDetails.platform !== Platform.MANUAL) {
      alert("Por favor, proporciona el access token para publicar comentarios.");
      return;
    }
    
    setIsPublishing(true);
    setPublishStatus(null);
    try {
      const res = await onPublishComments(tokenUsed);
      if (res.success) {
        const successes = res.results.filter(r => r.success).length;
        const errors = res.results.filter(r => !r.success).length;
        setPublishStatus({
          published: true,
          successCount: successes,
          errorCount: errors,
          message: `Publicación finalizada. ${successes} comentarios creados en la plataforma.`
        });
      } else {
        setPublishStatus({
          published: true,
          successCount: 0,
          errorCount: report.annotations.length,
          message: "Error de autenticación o comunicación al publicar comentarios."
        });
      }
    } catch (err: any) {
      setPublishStatus({
        published: true,
        successCount: 0,
        errorCount: report.annotations.length,
        message: err.message || "Error al conectar con la API de publicación."
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const downloadMarkdownReport = () => {
    let md = `# Reporte de Revisión de Código IA\n\n`;
    md += `## Pull Request: ${prDetails.title}\n`;
    md += `- **Plataforma:** ${prDetails.platform.toUpperCase()}\n`;
    md += `- **Score de Calidad:** ${report.score}/100\n`;
    md += `- **Nivel de Riesgo:** ${report.riskLevel.toUpperCase()}\n`;
    md += `- **Archivos Analizados:** ${totalFiles}\n\n`;
    md += `### Resumen General\n${report.summary}\n\n`;
    md += `### Recomendaciones Generales\n`;
    report.generalRecommendations.forEach((r, i) => {
      md += `${i + 1}. ${r}\n`;
    });
    md += `\n### Anotaciones en el Código (${report.annotations.length})\n\n`;
    
    report.annotations.forEach((ann, idx) => {
      md += `#### [${idx + 1}] ${ann.filePath} - Línea ${ann.line} (${ann.severity.toUpperCase()})\n`;
      md += `- **Categoría:** ${ann.category.toUpperCase()}\n`;
      md += `- **Asunto:** ${ann.title}\n`;
      md += `- **Comentario:** ${ann.comment}\n`;
      if (ann.suggestedCode) {
        md += `\n**Solución Sugerida:**\n\`\`\`\n${ann.suggestedCode}\n\`\`\`\n`;
      }
      md += `\n---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `reporte_pr_${prDetails.id || "review"}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-xl">
            <GitPullRequest className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                prDetails.platform === Platform.GITLAB ? "bg-orange-600/30 text-orange-400 border border-orange-500/30" :
                prDetails.platform === Platform.AZURE_DEVOPS ? "bg-blue-600/30 text-blue-400 border border-blue-500/30" :
                "bg-emerald-600/30 text-emerald-400 border border-emerald-500/30"
              }`}>
                {prDetails.platform}
              </span>
              <span className="text-xs text-slate-400">ID #{prDetails.id}</span>
            </div>
            <h1 className="text-lg md:text-xl font-bold font-sans tracking-tight mt-1 truncate max-w-md md:max-w-xl">
              {prDetails.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <User className="w-3.5 h-3.5" />
              <span>{prDetails.authorName}</span>
              <span>•</span>
              <GitBranch className="w-3.5 h-3.5" />
              <span className="font-mono text-indigo-300">{prDetails.sourceBranch}</span>
              <span>→</span>
              <span className="font-mono text-slate-300">{prDetails.targetBranch}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto shrink-0">
          <button
            onClick={downloadMarkdownReport}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-all"
          >
            <Download className="w-4 h-4" />
            Exportar Markdown
          </button>
          <button
            onClick={onReset}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Nueva revisión
          </button>
        </div>
      </div>

      {/* Main Stats Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Score Ring Widget */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
            Código de Salud (Health Score)
          </h3>
          
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* SVG circle stroke representation */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="64"
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r="64"
                className={`transition-all duration-1000 ${getScoreColor(report.score)}`}
                strokeWidth="10"
                fill="transparent"
                strokeDasharray="402"
                strokeDashoffset={402 - (402 * report.score) / 100}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                {report.score}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">
                de 100
              </span>
            </div>
          </div>

          <div className="mt-4">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
              {getScoreDescription(report.score)}
            </span>
            <div className="flex items-center gap-1.5 mt-2 justify-center">
              <span className="text-xs text-slate-400">Riesgo de Fusión:</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                report.riskLevel === "low" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" :
                report.riskLevel === "medium" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400" :
                "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400"
              }`}>
                {report.riskLevel}
              </span>
            </div>
          </div>
        </div>

        {/* Categories Breakdown Dashboard */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm lg:col-span-2">
          <div>
            <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Hallazgos por Categoría ({report.annotations.length})
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                <Bug className="w-5 h-5 text-red-500 mb-2" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Errores</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">{bugCount}</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                <Shield className="w-5 h-5 text-amber-500 mb-2" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Seguridad</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">{securityCount}</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                <Cpu className="w-5 h-5 text-indigo-500 mb-2" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Rendimiento</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">{perfCount}</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                <Sparkles className="w-5 h-5 text-purple-500 mb-2" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Diseño / Estilo</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">{styleCount}</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center col-span-2 md:col-span-1">
                <FileCode className="w-5 h-5 text-emerald-500 mb-2" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Refactor</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">{refactorCount}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap justify-between items-center">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 block" /> Críticos: <b>{criticalCount}</b>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block" /> Advertencias: <b>{warningCount}</b>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 block" /> Sugerencias: <b>{suggestionCount}</b>
              </span>
            </div>
            <div>
              <span>Archivos analizados: <b>{totalFiles}</b></span>
            </div>
          </div>
        </div>
      </div>

      {/* General Recommendations & Action card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recommendations column */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
            Recomendaciones Principales
          </h3>
          
          <div className="space-y-3">
            {report.generalRecommendations.map((rec, idx) => (
              <div key={idx} className="flex gap-3 items-start bg-slate-50/50 dark:bg-slate-800/20 p-3 rounded-xl border border-slate-100/50 dark:border-slate-800/30">
                <div className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs font-bold w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {rec}
                </p>
              </div>
            ))}
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Resumen General</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
              {report.summary}
            </p>
          </div>
        </div>

        {/* Integration Auto comments poster card */}
        <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-100 dark:border-indigo-950 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 p-2.5 rounded-lg w-fit mb-4">
              <CloudLightning className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans tracking-tight">
              Comentarios Automáticos
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-2 leading-relaxed">
              Publica de forma instantánea las {report.annotations.length} sugerencias directamente en tu Merge Request / Pull Request como hilos de discusión activos. Los desarrolladores podrán ver las sugerencias de la IA inline en su interfaz de GitLab o Azure DevOps.
            </p>

            {prDetails.platform === Platform.MANUAL && (
              <div className="mt-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-700 dark:text-amber-400">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Esta revisión se cargó como <b>Diff Manual</b>. La publicación de comentarios automáticos solo está disponible para conexiones activas vía API de GitLab o Azure DevOps.</span>
              </div>
            )}

            {publishStatus && (
              <div className={`mt-4 p-3.5 rounded-xl border text-xs space-y-1.5 leading-relaxed ${
                publishStatus.errorCount === 0 
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-400"
                  : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-400"
              }`}>
                <div className="flex items-center gap-1.5 font-semibold">
                  {publishStatus.errorCount === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{publishStatus.message}</span>
                </div>
                {publishStatus.errorCount > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Ocurrieron algunos errores. Asegúrate de que el Token de Acceso posea los permisos de escritura requeridos.
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handlePublish}
            disabled={isPublishing || prDetails.platform === Platform.MANUAL || report.annotations.length === 0}
            className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-sm cursor-pointer"
          >
            {isPublishing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Publicando comentarios...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Publicar en {prDetails.platform === Platform.GITLAB ? "GitLab" : "Azure DevOps"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
