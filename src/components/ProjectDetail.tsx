import React, { useState } from "react";
import { Project, TaskIssue, SprintInfo, Platform } from "../types";
import { 
  ArrowLeft, Cpu, Layout, HelpCircle, AlertCircle, Search, 
  ChevronRight, CheckSquare, ListTodo, User, Calendar, ExternalLink,
  Download, Sparkles, BookOpen, FileText, RefreshCw, Activity, Layers
} from "lucide-react";

interface ProjectDetailProps {
  project: Project;
  description: string;
  tasks: TaskIssue[];
  sprint?: SprintInfo;
  isLoading: boolean;
  onBack: () => void;
  onSelectTask: (task: TaskIssue) => void;
  token?: string;
  baseUrl?: string;
}

export default function ProjectDetail({
  project,
  description,
  tasks,
  sprint,
  isLoading,
  onBack,
  onSelectTask,
  token,
  baseUrl
}: ProjectDetailProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("purpose");
  
  // Architecture and project functioning analysis state (Gemini powered)
  const [architecture, setArchitecture] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Closed states list to filter out closed/completed items for the active sprint UI
  const closedStates = ["closed", "done", "completed", "resolved", "inactive"];
  
  // Only tasks of the active sprint (excluding historical/closed tasks) are displayed in the main dashboard
  const sprintTasks = tasks.filter(t => {
    const state = t.state?.toLowerCase() || "";
    return !closedStates.includes(state);
  });

  const filteredTasks = sprintTasks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.assignee && t.assignee.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper to trigger generation of project design & flow overview using Gemini
  const handleGenerateArchitecture = async () => {
    setIsGenerating(true);
    setGenError(null);
    try {
      const response = await fetch("/api/generate-project-architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: project.platform,
          token: token || "",
          baseUrl: baseUrl || "",
          projectId: project.id,
          projectName: project.name,
          description: description,
          // We send the full history and backlog of all tasks to Gemini for comprehensive architecture analysis
          tasks: tasks
        })
      });

      if (!response.ok) {
        throw new Error("No se pudo obtener una respuesta válida de la IA.");
      }

      const data = await response.json();
      setArchitecture(data.architecture || "");
    } catch (err: any) {
      console.error(err);
      setGenError("Error al generar la arquitectura: " + (err.message || "Inténtalo de nuevo."));
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to export project details + backlog + active sprint + architecture (if available) to a Markdown document
  const handleExportProject = () => {
    const mdContent = `
# Reporte Técnico del Proyecto: ${project.name}
**Plataforma**: ${project.platform === Platform.GITLAB ? "GitLab Workspace" : "Azure DevOps Workspace"}
**URL del Repositorio**: ${project.webUrl || "N/A"}

---

## 📝 Descripción del Proyecto (Repositorio)
${description || "Sin descripción disponible en el repositorio."}

---

## 📅 Sprint / Iteración Activa
- **Nombre del Sprint**: ${sprint?.name || "Sin Sprint Activo"}
- **Periodo**: ${sprint?.startDate && sprint?.endDate ? `${sprint.startDate} — ${sprint.endDate}` : "Fechas no especificadas"}
- **Estado**: ${sprint?.state === "active" ? "Activo" : "Inactivo"}
- **Backlog Total**: ${sprintTasks.length} tareas abiertas en esta iteración

---

${architecture ? `## 🏛️ Arquitectura y Funcionamiento Técnico (IA OpenAI)
${architecture}

---
` : ""}

## 📋 Backlog Detallado de Tareas (${sprintTasks.length} Ítems)
${sprintTasks.map((t, idx) => `
### [${idx + 1}] #${t.id}: ${t.title}
- **Tipo de Tarea**: ${t.type}
- **Estado Actual**: ${t.state}
- **Responsable Asignado**: ${t.assignee || "Sin asignar"}
- **Descripción de Requerimientos**:
${t.description || "*No se ha redactado una descripción para esta tarea.*"}
`).join("\n---\n")}

---
*Documento exportado por el Asistente Técnico Automatizado de PR Reviewer el ${new Date().toLocaleDateString("es-ES")} a las ${new Date().toLocaleTimeString("es-ES")}*
`.trim();

    // Trigger download of markdown file
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_reporte_tecnico.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to segment markdown text into rich sections for professional tab navigation
  const getParsedSections = (markdownText: string) => {
    if (!markdownText) return [];
    
    // Initialize standard sections to maintain predictable display order
    const sectionsMap: Record<string, { id: string; title: string; content: string; icon: string }> = {
      purpose: { id: "purpose", title: "Propósito y Visión", content: "", icon: "purpose" },
      architecture: { id: "architecture", title: "Arquitectura y Código", content: "", icon: "architecture" },
      flow: { id: "flow", title: "Flujos y Procesos", content: "", icon: "flow" },
      evolution: { id: "evolution", title: "Evolución y Sprints", content: "", icon: "evolution" }
    };
    
    const lines = markdownText.split("\n");
    let activeSectionId = "purpose";
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      let matchedId = "";
      
      if (trimmed.includes("Propósito") || trimmed.includes("Visión de Negocio") || /1\.\s/.test(trimmed)) {
        if (trimmed.startsWith("#") || trimmed.includes("🎯")) {
          matchedId = "purpose";
        }
      }
      if (trimmed.includes("Arquitectura Técnica") || trimmed.includes("Estructura") || /2\.\s/.test(trimmed)) {
        if (trimmed.startsWith("#") || trimmed.includes("🏗️")) {
          matchedId = "architecture";
        }
      }
      if (trimmed.includes("Flujo de Funcionamiento") || trimmed.includes("Procesos") || /3\.\s/.test(trimmed)) {
        if (trimmed.startsWith("#") || trimmed.includes("🔄")) {
          matchedId = "flow";
        }
      }
      if (trimmed.includes("Evolución del Proyecto") || trimmed.includes("Sprints") || /4\.\s/.test(trimmed)) {
        if (trimmed.startsWith("#") || trimmed.includes("📊")) {
          matchedId = "evolution";
        }
      }
      
      if (matchedId) {
        activeSectionId = matchedId;
        sectionsMap[activeSectionId].content += (sectionsMap[activeSectionId].content ? "\n\n" : "") + line;
      } else {
        sectionsMap[activeSectionId].content += (sectionsMap[activeSectionId].content ? "\n" : "") + line;
      }
    }
    
    // Return sections that contain meaningful parsed text
    return Object.values(sectionsMap).filter(sec => sec.content.trim().length > 0);
  };

  // Helper to apply inline styles (bold, italic, code)
  const parseInlineStyles = (text: string) => {
    // Escape simple HTML characters first to prevent breaking markup
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold formatting: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong class='font-bold text-slate-950 dark:text-white font-sans'>$1</strong>");

    // Italic formatting: *text*
    html = html.replace(/\*(.*?)\*/g, "<em class='italic text-slate-700 dark:text-slate-300'>$1</em>");

    // Inline code formatting: `code`
    html = html.replace(/`(.*?)`/g, "<code class='px-1.5 py-0.5 bg-slate-100/80 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono text-[11px] font-semibold rounded border border-slate-200/40 dark:border-slate-700/30'>$1</code>");

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  // Helper to render high-fidelity styled markdown on the fly
  const renderMarkdownText = (text: string) => {
    if (!text) return null;

    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeLanguage = "";
    
    let inList = false;
    let listItems: React.ReactNode[] = [];

    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const flushList = (key: string) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={key} className="space-y-1.5 my-3 list-none pl-1">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    const flushTable = (key: string) => {
      if (tableHeaders.length > 0 || tableRows.length > 0) {
        elements.push(
          <div key={key} className="overflow-x-auto my-4 rounded-xl border border-slate-200/50 dark:border-slate-800 shadow-sm max-w-full">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50/75 dark:bg-slate-950/40">
                <tr>
                  {tableHeaders.map((h, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/40 dark:bg-slate-900/10">
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/20 transition-colors">
                    {row.map((val, cIdx) => (
                      <td key={cIdx} className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                        {parseInlineStyles(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableHeaders = [];
        tableRows = [];
        inTable = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code Block Handling
      if (trimmed.startsWith("```")) {
        if (inCodeBlock) {
          // Close code block
          inCodeBlock = false;
          elements.push(
            <div key={`code-${i}`} className="my-4 rounded-xl overflow-hidden border border-slate-200/60 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between bg-slate-100/80 dark:bg-slate-950 px-4 py-2 border-b border-slate-200/60 dark:border-slate-800/80">
                <span className="text-[10px] font-bold font-mono text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  {codeLanguage || "código"}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">vista de solo lectura</span>
              </div>
              <pre className="p-4 bg-slate-900/95 dark:bg-slate-950/90 text-slate-200 overflow-x-auto text-[11px] font-mono leading-relaxed select-text">
                <code>{codeBlockContent.join("\n")}</code>
              </pre>
            </div>
          );
          codeBlockContent = [];
          codeLanguage = "";
        } else {
          // Flush lists or tables first
          flushList(`list-before-code-${i}`);
          flushTable(`table-before-code-${i}`);
          inCodeBlock = true;
          codeLanguage = trimmed.substring(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Table Handling
      if (trimmed.startsWith("|")) {
        flushList(`list-before-table-${i}`);
        
        // Split columns, remove first and last empty items if empty
        let parts = line.split("|").map(p => p.trim());
        if (parts[0] === "") parts.shift();
        if (parts[parts.length - 1] === "") parts.pop();

        if (trimmed.includes("---")) {
          // Separator line, ignore
          inTable = true;
          continue;
        }

        if (!inTable) {
          // This is a header
          tableHeaders = parts;
          inTable = true;
        } else {
          // This is a row
          tableRows.push(parts);
        }
        continue;
      } else {
        if (inTable && !trimmed.startsWith("|")) {
          flushTable(`table-end-${i}`);
        }
      }

      // Headers
      if (trimmed.startsWith("# ")) {
        flushList(`list-before-h1-${i}`);
        elements.push(
          <h2 key={`h1-${i}`} className="text-sm font-extrabold text-slate-900 dark:text-white mt-6 mb-3 border-l-4 border-indigo-500 pl-3 tracking-tight flex items-center gap-2">
            {parseInlineStyles(trimmed.substring(2))}
          </h2>
        );
        continue;
      }

      if (trimmed.startsWith("## ")) {
        flushList(`list-before-h2-${i}`);
        elements.push(
          <h3 key={`h2-${i}`} className="text-xs font-bold text-slate-900 dark:text-white mt-5 mb-2.5 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-1.5 tracking-tight">
            <span className="w-1.5 h-3.5 bg-indigo-500 rounded-sm shrink-0"></span>
            {parseInlineStyles(trimmed.substring(3))}
          </h3>
        );
        continue;
      }

      if (trimmed.startsWith("### ")) {
        flushList(`list-before-h3-${i}`);
        elements.push(
          <h4 key={`h3-${i}`} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mt-4 mb-2 uppercase tracking-wider">
            {parseInlineStyles(trimmed.substring(4))}
          </h4>
        );
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith(">")) {
        flushList(`list-before-quote-${i}`);
        elements.push(
          <div key={`quote-${i}`} className="pl-4 py-1.5 border-l-3 border-indigo-200 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-r-lg my-3 text-[11px] text-slate-600 dark:text-slate-400 italic leading-relaxed">
            {parseInlineStyles(trimmed.substring(1).trim())}
          </div>
        );
        continue;
      }

      // Bullet Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        inList = true;
        listItems.push(
          <li key={`li-${i}`} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 mb-1 leading-relaxed">
            <span className="text-indigo-500 font-bold mt-0.5 select-none shrink-0">•</span>
            <span>{parseInlineStyles(trimmed.substring(2))}</span>
          </li>
        );
        continue;
      }

      // Numbered Lists
      if (/^\d+\.\s/.test(trimmed)) {
        inList = true;
        const indexMatch = trimmed.match(/^(\d+)\.\s(.*)/);
        const num = indexMatch ? indexMatch[1] : "1";
        const content = indexMatch ? indexMatch[2] : trimmed;
        listItems.push(
          <li key={`li-${i}`} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 mb-1 leading-relaxed">
            <span className="text-indigo-500 font-bold mt-0.5 select-none shrink-0 font-mono text-[10px]">{num}.</span>
            <span>{parseInlineStyles(content)}</span>
          </li>
        );
        continue;
      }

      // Empty Lines
      if (!trimmed) {
        flushList(`list-empty-${i}`);
        continue;
      }

      // General Paragraph
      flushList(`list-before-p-${i}`);
      elements.push(
        <p key={`p-${i}`} className="text-xs text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
          {parseInlineStyles(trimmed)}
        </p>
      );
    }

    // Flush any leftover open lists or tables
    flushList("list-final");
    flushTable("table-final");

    return <div className="space-y-1.5">{elements}</div>;
  };

  return (
    <div className="space-y-6">
      {/* Back button and Meta Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Proyectos
          </button>

          {!isLoading && (
            <button
              onClick={handleExportProject}
              className="flex items-center gap-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/80 dark:text-indigo-300 px-3.5 py-1.5 rounded-xl border border-indigo-100/30 cursor-pointer transition-all"
              title="Exportar información completa del proyecto"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Proyecto
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
            {project.platform === Platform.GITLAB ? (
              <Layout className="w-3.5 h-3.5 text-orange-500" />
            ) : (
              <Cpu className="w-3.5 h-3.5 text-blue-500" />
            )}
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {project.platform === Platform.GITLAB ? "GitLab Workspace" : "Azure DevOps Workspace"}
            </span>
          </div>

          <a
            href={project.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            Ver Repositorio <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-16 text-center space-y-4">
          <div className="relative w-10 h-10 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
          </div>
          <p className="text-xs text-slate-500">Cargando detalles del proyecto, sprint y tareas...</p>
        </div>
      ) : (
        <>
          {/* Main info panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Project description card */}
            <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block">Proyecto</span>
                  <h1 className="text-xl font-bold text-slate-950 dark:text-white tracking-tight">{project.name}</h1>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descripción del Repositorio</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {description || "Sin descripción proporcionada en el servidor."}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Sprint information Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    Sprint / Iteración Activa
                  </h3>
                  <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                    sprint?.state === "active" 
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100/30"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {sprint?.state === "active" ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-950 dark:text-white">{sprint?.name || "Sin Sprint Activo"}</h4>
                  {sprint?.startDate && sprint?.endDate && (
                    <p className="text-[10px] text-slate-400 font-medium">
                      {sprint.startDate} &mdash; {sprint.endDate}
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-50 dark:border-slate-800 pt-3 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-semibold">Total Tareas Abiertas:</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{sprintTasks.length} ítems</span>
              </div>
            </div>

          </div>

          {/* New Section: Architecture & Technical Setup Explanation with Gemini */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  Arquitectura y Funcionamiento del Proyecto (IA OpenAI)
                </h2>
              </div>

              {architecture && !isGenerating && (
                <button
                  onClick={handleGenerateArchitecture}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                  title="Volver a generar plano arquitectónico"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerar Plano
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
              Este análisis inteligente examina la información del repositorio junto con todos los requerimientos y tipos de tareas de tu backlog para explicar con precisión técnica cómo está montado el proyecto y cómo funciona la lógica operativa global.
            </p>

            {isGenerating && (
              <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-900/60 space-y-4">
                <div className="relative w-10 h-10 mx-auto">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                  <Sparkles className="absolute inset-0 m-auto w-4 h-4 text-indigo-500 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Ploteando plano arquitectónico...</p>
                  <p className="text-[10px] text-slate-400">OpenAI está analizando la correlación del backlog de {tasks.length} tareas y la descripción del código.</p>
                </div>
              </div>
            )}

            {genError && (
              <div className="p-4 bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/40 rounded-xl text-xs text-red-800 dark:text-red-400">
                {genError}
              </div>
            )}

            {!architecture && !isGenerating && (
              <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3.5">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  ¿Quieres descubrir la arquitectura implícita y el flujo de funcionamiento técnico sugerido para este backlog?
                </p>
                <button
                  onClick={handleGenerateArchitecture}
                  className="mx-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Descubrir Estructura y Funcionamiento con OpenAI
                </button>
              </div>
            )}

            {architecture && !isGenerating && (() => {
              const parsedSections = getParsedSections(architecture);
              
              if (parsedSections.length >= 2) {
                const currentSec = parsedSections.find(s => s.id === activeTab) || parsedSections[0];
                
                const getIcon = (id: string) => {
                  switch(id) {
                    case "purpose": return <BookOpen className="w-3.5 h-3.5" />;
                    case "architecture": return <Layers className="w-3.5 h-3.5" />;
                    case "flow": return <RefreshCw className="w-3.5 h-3.5" />;
                    case "evolution": return <Activity className="w-3.5 h-3.5" />;
                    default: return <FileText className="w-3.5 h-3.5" />;
                  }
                };
                
                return (
                  <div className="space-y-4">
                    {/* Visual Section Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                      {parsedSections.map((sec) => (
                        <button
                          key={sec.id}
                          onClick={() => setActiveTab(sec.id)}
                          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            activeTab === sec.id
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/15"
                              : "bg-slate-50 border-slate-200/50 text-slate-600 dark:bg-slate-800/60 dark:border-slate-700/60 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-750"
                          }`}
                        >
                          <span className={activeTab === sec.id ? "text-white animate-pulse" : "text-slate-400 dark:text-slate-500"}>
                            {getIcon(sec.id)}
                          </span>
                          {sec.title}
                        </button>
                      ))}
                    </div>

                    {/* Section Content Display */}
                    <div className="bg-slate-50/40 dark:bg-slate-950/15 border border-slate-150/80 dark:border-slate-800/80 p-6 rounded-2xl max-h-[500px] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-slate-200">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300">
                        {renderMarkdownText(currentSec.content)}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-slate-50/30 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-800/80 p-6 rounded-2xl max-h-96 overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-slate-200">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300">
                    {renderMarkdownText(architecture)}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Tasks/Backlog section */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div className="flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  Backlog del Sprint ({filteredTasks.length})
                </h2>
              </div>

              {/* Task search bar */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por ID, título o responsable..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No hay tareas pendientes en este listado</p>
                <p className="text-[10px] text-slate-400 mt-1">Busca con otros términos o agrega nuevas tareas en GitLab/Azure DevOps.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="group bg-slate-50/50 dark:bg-slate-950/10 p-4 rounded-2xl border border-slate-100/50 dark:border-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-100 dark:hover:border-indigo-950/80 hover:bg-white dark:hover:bg-slate-900 transition-all duration-200 cursor-pointer"
                  >
                    <div className="space-y-2 flex-grow">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400">
                          #{task.id}
                        </span>
                        
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          task.type === "Bug" 
                            ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400"
                        }`}>
                          {task.type}
                        </span>

                        <span className="text-[9px] text-slate-400 font-bold uppercase">
                          {task.state}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {task.title}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60 pt-3 sm:pt-0">
                      {task.assignee && (
                        <div className="flex items-center gap-1.5">
                          {task.assigneeAvatar ? (
                            <img src={task.assigneeAvatar} alt={task.assignee} className="w-4 h-4 rounded-full referrerPolicy='no-referrer'" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 font-bold text-[9px] flex items-center justify-center">
                              {task.assignee.charAt(0)}
                            </div>
                          )}
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{task.assignee}</span>
                        </div>
                      )}

                      <button className="py-1.5 px-3 bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-700 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0">
                        Enriquecer con IA
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
