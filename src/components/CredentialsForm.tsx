import React, { useState, useEffect } from "react";
import { Platform } from "../types";
import { Key, Globe, Layout, Sparkles, ShieldCheck, Cpu } from "lucide-react";

interface CredentialsFormProps {
  onConnect: (platform: Platform, token: string, baseUrl?: string) => void;
  isLoading: boolean;
  error?: string;
}

export default function CredentialsForm({ onConnect, isLoading, error }: CredentialsFormProps) {
  const [platform, setPlatform] = useState<Platform>(Platform.GITLAB);
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  // Load existing credentials from session storage for frictionless reload/development
  useEffect(() => {
    const savedPlatform = sessionStorage.getItem("pr_platform") as Platform;
    const savedToken = sessionStorage.getItem("pr_token");
    const savedBaseUrl = sessionStorage.getItem("pr_baseUrl");

    if (savedPlatform) setPlatform(savedPlatform);
    if (savedToken) setToken(savedToken);
    if (savedBaseUrl) setBaseUrl(savedBaseUrl);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    // Cache to session storage
    sessionStorage.setItem("pr_platform", platform);
    sessionStorage.setItem("pr_token", token);
    sessionStorage.setItem("pr_baseUrl", baseUrl);

    onConnect(platform, token, baseUrl || undefined);
  };

  const handleUseDemo = () => {
    // Fill in a mock token and base URL so the user can see high-fidelity sandbox details immediately
    const demoPlatform = Platform.GITLAB;
    const demoToken = "glpat-demo-token-12345";
    const demoUrl = "https://gitlab.com";

    setPlatform(demoPlatform);
    setToken(demoToken);
    setBaseUrl(demoUrl);

    onConnect(demoPlatform, demoToken, demoUrl);
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-8 transition-all space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100/30">
          <Key className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
          Conecta tu Workspace
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
          Ingresa tu token de acceso personal para cargar tus proyectos de GitLab, Azure DevOps o TFS y habilitar el asistente de IA.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 p-4 rounded-2xl text-xs text-red-800 dark:text-red-400 space-y-1">
          <p className="font-bold">Error de conexión:</p>
          <p className="font-mono">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Platform selection buttons */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Plataforma DevOps
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setPlatform(Platform.GITLAB);
                if (!baseUrl) setBaseUrl("https://gitlab.com");
              }}
              className={`py-3 px-4 rounded-2xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                platform === Platform.GITLAB
                  ? "border-indigo-600 bg-indigo-50/30 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/20 dark:text-indigo-400 font-bold shadow-sm"
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-600 dark:text-slate-400"
              }`}
            >
              <Layout className="w-4 h-4 shrink-0 text-orange-500" />
              GitLab
            </button>
            <button
              type="button"
              onClick={() => {
                setPlatform(Platform.AZURE_DEVOPS);
                if (!baseUrl || baseUrl === "https://gitlab.com") setBaseUrl("https://dev.azure.com/mi-organizacion");
              }}
              className={`py-3 px-4 rounded-2xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                platform === Platform.AZURE_DEVOPS
                  ? "border-indigo-600 bg-indigo-50/30 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/20 dark:text-indigo-400 font-bold shadow-sm"
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-600 dark:text-slate-400"
              }`}
            >
              <Cpu className="w-4 h-4 shrink-0 text-blue-500" />
              Azure / TFS
            </button>
          </div>
        </div>

        {/* Base URL input */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label htmlFor="baseUrl" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              URL del Servidor / Organización
            </label>
            <span className="text-[10px] text-slate-400 font-medium">Opcional</span>
          </div>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="baseUrl"
              type="url"
              placeholder={platform === Platform.GITLAB ? "https://gitlab.com" : "https://dev.azure.com/tu-organizacion"}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
            />
          </div>
          <p className="text-[10px] text-slate-400 leading-normal">
            {platform === Platform.GITLAB
              ? "Por defecto: https://gitlab.com. Cambia si usas GitLab Self-Hosted."
              : "Para Azure DevOps ingresa: https://dev.azure.com/nombre-organizacion"}
          </p>
        </div>

        {/* Token input */}
        <div className="space-y-1.5">
          <label htmlFor="token" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Personal Access Token (PAT)
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="token"
              type="password"
              required
              placeholder={platform === Platform.GITLAB ? "glpat-..." : "Token de Azure DevOps"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
            />
          </div>
          <p className="text-[10px] text-slate-400 leading-normal">
            {platform === Platform.GITLAB
              ? "Requiere permisos de API (api, read_api o read_repository)."
              : "Requiere permisos de lectura/escritura en Work Items y Código."}
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading || !token.trim()}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-2xl font-bold text-xs shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Conectando y validando...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Conectar Workspace
            </>
          )}
        </button>
      </form>

      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
        <span className="flex-shrink mx-4 text-slate-400 text-[10px] font-bold uppercase tracking-wider">o</span>
        <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
      </div>

      <button
        type="button"
        onClick={handleUseDemo}
        className="w-full py-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/30 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold text-xs border border-slate-200/50 dark:border-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
        Entrar en Modo Demo Sandbox (Sin Token)
      </button>
    </div>
  );
}
