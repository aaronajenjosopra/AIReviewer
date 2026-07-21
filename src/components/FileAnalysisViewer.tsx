import React, { useState } from "react";
import { FileDiff, FileAnnotation, IssueCategory, IssueSeverity } from "../types";
import { 
  FileText, Check, Copy, Bug, Shield, Cpu, Sparkles, FileCode,
  AlertTriangle, ArrowRight, MessageSquareCode, CheckCircle, ChevronDown, ChevronRight
} from "lucide-react";

interface FileAnalysisViewerProps {
  files: FileDiff[];
  annotations: FileAnnotation[];
}

export default function FileAnalysisViewer({ files, annotations }: FileAnalysisViewerProps) {
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [copiedAnnotationIdx, setCopiedAnnotationIdx] = useState<number | null>(null);

  const selectedFile = files[selectedFileIdx];
  
  if (!selectedFile) return null;

  // Find annotations belonging to the selected file
  const fileAnnotations = annotations.filter(ann => {
    // Match file paths (fuzzy matching for leading slashes or directories)
    const normAnnPath = ann.filePath.replace(/^\//, "").toLowerCase();
    const normFilePath = selectedFile.newPath.replace(/^\//, "").toLowerCase();
    return normAnnPath === normFilePath || normAnnPath.endsWith(normFilePath) || normFilePath.endsWith(normAnnPath);
  });

  // Calculate annotation counts for all files to show badges
  const getFileBadgeCounts = (filePath: string) => {
    const normFilePath = filePath.replace(/^\//, "").toLowerCase();
    const fileAnns = annotations.filter(ann => {
      const normAnnPath = ann.filePath.replace(/^\//, "").toLowerCase();
      return normAnnPath === normFilePath || normAnnPath.endsWith(normFilePath) || normFilePath.endsWith(normAnnPath);
    });

    const critical = fileAnns.filter(a => a.severity === "critical").length;
    const total = fileAnns.length;
    return { critical, total };
  };

  const getCategoryIcon = (category: IssueCategory) => {
    switch (category) {
      case IssueCategory.BUG:
        return <Bug className="w-4 h-4 text-red-500" />;
      case IssueCategory.SECURITY:
        return <Shield className="w-4 h-4 text-amber-500" />;
      case IssueCategory.PERFORMANCE:
        return <Cpu className="w-4 h-4 text-indigo-500" />;
      case IssueCategory.STYLE:
        return <Sparkles className="w-4 h-4 text-purple-500" />;
      case IssueCategory.REFACTOR:
        return <FileCode className="w-4 h-4 text-emerald-500" />;
    }
  };

  const getSeverityBadge = (severity: IssueSeverity) => {
    switch (severity) {
      case "critical":
        return <span className="bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-red-200 dark:border-red-950/60">Crítico</span>;
      case "warning":
        return <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-amber-200 dark:border-amber-950/60">Advertencia</span>;
      case "suggestion":
        return <span className="bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-blue-200 dark:border-blue-950/60">Sugerencia</span>;
    }
  };

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedAnnotationIdx(idx);
    setTimeout(() => setCopiedAnnotationIdx(null), 2000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 transition-all grid grid-cols-1 md:grid-cols-4 gap-6">
      
      {/* Left Sidebar: Changed Files list */}
      <div className="md:col-span-1 border-r border-slate-100 dark:border-slate-800 pr-0 md:pr-4 flex flex-col space-y-2">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
          Archivos Modificados
        </h3>
        
        <div className="space-y-1 overflow-y-auto max-h-[500px] pr-1">
          {files.map((file, idx) => {
            const isSelected = selectedFileIdx === idx;
            const { critical, total } = getFileBadgeCounts(file.newPath);

            return (
              <button
                key={idx}
                onClick={() => setSelectedFileIdx(idx)}
                className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs transition-all ${
                  isSelected 
                    ? "bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate" title={file.newPath}>
                    {file.newPath.split("/").pop() || file.newPath}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {critical > 0 && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {total > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      critical > 0 
                        ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400" 
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}>
                      {total}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Area: Diff / AI Annotations list */}
      <div className="md:col-span-3 space-y-6">
        
        {/* Selected file information card */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="text-xs text-slate-400 font-mono">{selectedFile.newPath}</div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {selectedFile.newPath.split("/").pop()}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              selectedFile.isNew ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" :
              selectedFile.isDeleted ? "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400" :
              "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400"
            }`}>
              {selectedFile.isNew ? "Nuevo" : selectedFile.isDeleted ? "Eliminado" : "Modificado"}
            </span>
          </div>
        </div>

        {/* Annotations Section */}
        <div className="space-y-6">
          <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquareCode className="w-4 h-4" />
            Sugerencias de la IA ({fileAnnotations.length})
          </h3>

          {fileAnnotations.length === 0 ? (
            <div className="text-center py-12 bg-slate-50/50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                ¡Código Limpio en este Archivo!
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                No se han encontrado errores, vulnerabilidades ni problemas de estilo por la IA en este archivo.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {fileAnnotations.map((ann, idx) => (
                <div 
                  key={idx} 
                  className={`border rounded-2xl shadow-sm p-5 space-y-4 transition-all duration-300 ${
                    ann.severity === "critical" 
                      ? "border-red-200 bg-red-50/10 dark:border-red-950/30 dark:bg-red-950/5" 
                      : ann.severity === "warning"
                      ? "border-amber-200 bg-amber-50/10 dark:border-amber-950/30 dark:bg-amber-950/5"
                      : "border-slate-200 bg-slate-50/10 dark:border-slate-800/50"
                  }`}
                >
                  {/* Annotation Metadata Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                        {getCategoryIcon(ann.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
                            {ann.category}
                          </span>
                          <span>•</span>
                          <span className="text-xs font-mono text-slate-500">
                            Línea {ann.line}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                          {ann.title}
                        </h4>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(ann.severity)}
                    </div>
                  </div>

                  {/* Comment Critique */}
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {ann.comment}
                  </p>

                  {/* Suggestion block (Diff comparison) */}
                  {(ann.originalCode || ann.suggestedCode) && (
                    <div className="space-y-3">
                      {ann.originalCode && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Código Original:</span>
                          <pre className="bg-red-500/5 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-3 rounded-lg text-xs text-red-800 dark:text-red-300 font-mono overflow-x-auto whitespace-pre">
                            {ann.originalCode}
                          </pre>
                        </div>
                      )}

                      {ann.suggestedCode && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" />
                              Solución Recomendada:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(ann.suggestedCode!, idx)}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-all bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded"
                            >
                              {copiedAnnotationIdx === idx ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-emerald-500">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar código</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-3 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 font-mono overflow-x-auto whitespace-pre">
                            {ann.suggestedCode}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
