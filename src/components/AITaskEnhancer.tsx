import React, { useState, useEffect } from "react";
import { TaskIssue, Platform } from "../types";
import { 
  Sparkles, CheckSquare, FileText, ArrowLeft, RefreshCw, 
  Save, CheckCircle2, ShieldAlert, Cpu, Layout, HelpCircle
} from "lucide-react";

interface AITaskEnhancerProps {
  task: TaskIssue;
  projectId: string;
  projectName: string;
  platform: Platform;
  token: string;
  baseUrl?: string;
  onBack: () => void;
  onUpdateSuccess: (updatedDescription: string) => void;
}

export default function AITaskEnhancer({
  task,
  projectId,
  projectName,
  platform,
  token,
  baseUrl,
  onBack,
  onUpdateSuccess
}: AITaskEnhancerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // AI Generated Results
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [checkedSubtasks, setCheckedSubtasks] = useState<Record<number, boolean>>({});
  const [functionalSpecs, setFunctionalSpecs] = useState<string>("");

  // QA Test Cases State
  const [testCases, setTestCases] = useState<string>("");
  const [isGeneratingTestCases, setIsGeneratingTestCases] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [tcError, setTcError] = useState<string | null>(null);
  const [tcSuccessMsg, setTcSuccessMsg] = useState<string | null>(null);

  // Auto-run AI analysis if not already enriched
  useEffect(() => {
    // Reset state on task change
    setSubtasks([]);
    setCheckedSubtasks({});
    setFunctionalSpecs("");
    setError(null);
    setSuccessMsg(null);

    // Reset QA states
    setTestCases("");
    setIsGeneratingTestCases(false);
    setIsPostingComment(false);
    setTcError(null);
    setTcSuccessMsg(null);
  }, [task]);

  const handleGenerateAI = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/generate-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: task.title,
          taskDescription: task.description
        })
      });

      if (!response.ok) {
        throw new Error(`AI model response failed with status ${response.status}`);
      }

      const data = await response.json();
      setSubtasks(data.subtasks || []);
      setFunctionalSpecs(data.functionalSpecs || "");

      // Initialize checked state to false
      const initialChecked: Record<number, boolean> = {};
      (data.subtasks || []).forEach((_: any, idx: number) => {
        initialChecked[idx] = false;
      });
      setCheckedSubtasks(initialChecked);

    } catch (err: any) {
      console.error(err);
      setError("No se pudieron generar los detalles con Inteligencia Artificial. Por favor intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handler to generate QA test cases based on task requirements and functional specs
  const handleGenerateTestCases = async () => {
    setIsGeneratingTestCases(true);
    setTcError(null);
    setTcSuccessMsg(null);

    try {
      const response = await fetch("/api/generate-test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: task.title,
          taskDescription: task.description,
          functionalSpecs: functionalSpecs || "No se han generado especificaciones funcionales aún."
        })
      });

      if (!response.ok) {
        throw new Error(`QA API response failed with status ${response.status}`);
      }

      const data = await response.json();
      setTestCases(data.testCases || "");
    } catch (err: any) {
      console.error(err);
      setTcError("No se pudieron generar los casos de prueba QA. Intenta de nuevo.");
    } finally {
      setIsGeneratingTestCases(false);
    }
  };

  // Handler to write the generated QA test cases as a real comment in GitLab/Azure DevOps
  const handlePostTestCasesComment = async () => {
    if (!testCases) return;
    setIsPostingComment(true);
    setTcError(null);
    setTcSuccessMsg(null);

    const formattedComment = `
### 🧪 Casos de Prueba QA Sugeridos por IA

A continuación se detallan los escenarios de validación recomendados para verificar la correcta implementación de esta tarea:

${testCases}

*Publicado automáticamente como nota de control de calidad por el Asistente Técnico OpenAI.*
`.trim();

    try {
      const response = await fetch("/api/add-task-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          token,
          baseUrl,
          projectId,
          taskId: task.id,
          comment: formattedComment
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Falló la publicación del comentario.");
      }

      const data = await response.json();
      setTcSuccessMsg(data.message || "¡Casos de prueba publicados con éxito en la plataforma!");
    } catch (err: any) {
      console.error(err);
      setTcError(`Error al publicar comentario: ${err.message || "Conexión rechazada"}`);
    } finally {
      setIsPostingComment(false);
    }
  };

  const toggleSubtask = (index: number) => {
    setCheckedSubtasks(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleSaveToPlatform = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    // Formulate a beautiful unified description
    const subtaskLines = subtasks.map((st, idx) => {
      const isChecked = checkedSubtasks[idx];
      return `- [${isChecked ? "x" : " "}] ${st}`;
    }).join("\n");

    const enrichedContent = `
# Descripción Original
${task.description || "*Sin descripción proporcionada.*"}

---

## 📋 Subtareas de Desarrollo (IA)
A continuación se detallan las tareas accionables identificadas para la implementación:
${subtaskLines || "*No se definieron subtareas.*"}

---

## ⚙️ Especificación Funcional y Técnica (IA)
${functionalSpecs || "*No se generaron especificaciones adicionales.*"}

*Enriquecido automáticamente por el Asistente de IA de PR Reviewer.*
`.trim();

    try {
      const response = await fetch("/api/update-task-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          token,
          baseUrl,
          projectId,
          taskId: task.id,
          newDescription: enrichedContent
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Falló la actualización de la tarea.");
      }

      const data = await response.json();
      setSuccessMsg(data.message || "¡La tarea original ha sido actualizada con éxito!");
      onUpdateSuccess(enrichedContent);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar en la plataforma: ${err.message || "Conexión rechazada"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to render simple markdown on the fly
  const renderMarkdownText = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("### ")) {
        return <h4 key={idx} className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-4 mb-2">{line.replace("### ", "")}</h4>;
      }
      if (line.startsWith("## ")) {
        return <h3 key={idx} className="text-sm font-bold text-slate-900 dark:text-white mt-5 mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">{line.replace("## ", "")}</h3>;
      }
      if (line.startsWith("# ")) {
        return <h2 key={idx} className="text-base font-bold text-slate-900 dark:text-white mt-6 mb-3">{line.replace("# ", "")}</h2>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={idx} className="ml-4 list-disc text-xs text-slate-600 dark:text-slate-300 mb-1">{line.substring(2)}</li>;
      }
      if (line.startsWith("```")) {
        return null; // Skip raw code blocks markers for simplicity
      }
      return <p key={idx} className="text-xs text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Proyecto
        </button>

        <div className="flex items-center gap-2">
          {platform === Platform.GITLAB ? (
            <Layout className="w-4 h-4 text-orange-500" />
          ) : (
            <Cpu className="w-4 h-4 text-blue-500" />
          )}
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {projectName} • Tarea #{task.id}
          </span>
        </div>
      </div>

      {/* Task core card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">
                {task.id}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                task.type === "Bug" 
                  ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100/30"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100/30"
              }`}>
                {task.type}
              </span>
              <span className="text-[9px] font-semibold text-slate-400 uppercase">
                Estado: <span className="font-bold text-slate-600 dark:text-slate-300">{task.state}</span>
              </span>
            </div>
            <h1 className="text-base font-bold text-slate-950 dark:text-white tracking-tight">
              {task.title}
            </h1>
          </div>

          {task.assignee && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
              {task.assigneeAvatar ? (
                <img src={task.assigneeAvatar} alt={task.assignee} className="w-5 h-5 rounded-full referrerPolicy='no-referrer'" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-indigo-500 text-white font-bold text-[9px] flex items-center justify-center">
                  {task.assignee.charAt(0)}
                </div>
              )}
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{task.assignee}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-900/60 space-y-1.5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descripción Original</h4>
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
            {task.description || <span className="italic text-slate-400">Sin descripción proporcionada.</span>}
          </div>
        </div>

        {/* Generate triggers */}
        {subtasks.length === 0 && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleGenerateAI}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              Generar Subtareas y Análisis Funcional con IA
            </button>
          </div>
        )}
      </div>

      {/* AI loading / error indicators */}
      {isLoading && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-12 text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
            <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-indigo-500 animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white">Analizando requerimientos de la tarea...</p>
            <p className="text-[10px] text-slate-400">OpenAI está fragmentando la tarea en subtareas accionables y redactando especificaciones técnicas.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/40 p-5 rounded-2xl flex items-start gap-3.5">
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800 dark:text-red-400 leading-normal">
            <p className="font-bold">Error del Asistente:</p>
            <p className="mt-1 font-mono">{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-3xl flex items-start gap-3.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-800 dark:text-emerald-400 leading-normal">
            <p className="font-bold">¡Actualización Exitosa!</p>
            <p className="mt-1">{successMsg}</p>
          </div>
        </div>
      )}

      {/* AI Results */}
      {subtasks.length > 0 && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          
          {/* Subtasks Left Column */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-indigo-500" />
                Subtareas Sugeridas ({subtasks.length})
              </h3>
              <button
                onClick={handleGenerateAI}
                className="p-1 text-slate-400 hover:text-indigo-500 cursor-pointer transition-colors"
                title="Volver a generar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Marca las subtareas prioritarias que deseas incluir en la especificación. Se guardarán marcadas/desmarcadas como un checklist real en tu plataforma.
            </p>

            <div className="space-y-2.5">
              {subtasks.map((st, idx) => {
                const isChecked = checkedSubtasks[idx];
                return (
                  <label
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                      isChecked
                        ? "border-indigo-100 bg-indigo-50/20 dark:border-indigo-950 dark:bg-indigo-950/10 text-indigo-950 dark:text-indigo-300"
                        : "border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/20 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSubtask(idx)}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <span className="text-xs font-medium leading-relaxed select-none">
                      {st}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Specs & Save Right Column */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Especificación Funcional y Arquitectura
                </h3>
              </div>

              <div className="prose prose-sm dark:prose-invert max-w-none bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-900 p-5 rounded-2xl max-h-[450px] overflow-y-auto pr-2">
                {renderMarkdownText(functionalSpecs)}
              </div>
            </div>

            <div className="border-t border-slate-50 dark:border-slate-800 pt-5 flex items-center justify-between gap-4">
              <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                Actualizará la descripción de la tarea #{task.id}
              </span>

              <button
                onClick={handleSaveToPlatform}
                disabled={isSaving}
                className="py-3 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-bold text-xs shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Actualizando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar en la Tarea Original
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* QA Test Cases Section */}
      {subtasks.length > 0 && !isLoading && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                🧪 Casos de Prueba QA y Criterios de Aceptación (IA OpenAI)
              </h3>
            </div>
            
            {testCases && !isGeneratingTestCases && (
              <button
                onClick={handleGenerateTestCases}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-[10px] font-bold text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerar Escenarios QA
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
            Genera automáticamente los escenarios de pruebas funcionales (Happy Path, casos límite, condiciones de error y criterios de aceptación) basados en la especificación funcional anterior. Podrás publicarlos directamente como un comentario documentado en el hilo de la tarea #{task.id}.
          </p>

          {tcError && (
            <div className="p-4 bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/40 rounded-xl text-xs text-red-800 dark:text-red-400 font-mono">
              {tcError}
            </div>
          )}

          {tcSuccessMsg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-800 dark:text-emerald-400">
              {tcSuccessMsg}
            </div>
          )}

          {isGeneratingTestCases && (
            <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-indigo-950/60 space-y-4 animate-pulse">
              <div className="relative w-10 h-10 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                <Sparkles className="absolute inset-0 m-auto w-4 h-4 text-indigo-500" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Diseñando casos de prueba funcionales...</p>
                <p className="text-[10px] text-slate-400">OpenAI está estructurando escenarios Gherkin, caminos felices y excepciones.</p>
              </div>
            </div>
          )}

          {!testCases && !isGeneratingTestCases && (
            <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3.5">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                ¿Listo para estructurar la estrategia de QA? Diseña los casos de prueba listos para implementar o verificar.
              </p>
              <button
                onClick={handleGenerateTestCases}
                className="mx-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Generar Casos de Prueba con OpenAI
              </button>
            </div>
          )}

          {testCases && !isGeneratingTestCases && (
            <div className="space-y-4">
              <div className="bg-slate-50/30 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-800/80 p-6 rounded-2xl max-h-96 overflow-y-auto pr-3">
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300">
                  {renderMarkdownText(testCases)}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 flex-wrap border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-[10px] text-slate-400 font-semibold">
                  Escribirá un comentario con este contenido en la tarea original #{task.id}
                </span>

                <button
                  onClick={handlePostTestCasesComment}
                  disabled={isPostingComment}
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isPostingComment ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Publicando Comentario...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Publicar Casos de Prueba como Comentario
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
