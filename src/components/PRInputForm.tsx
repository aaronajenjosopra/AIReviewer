import React, { useState } from "react";
import { Platform } from "../types";
import { Link2, Key, Code, HelpCircle, ArrowRight, ShieldAlert, AlertCircle, Info } from "lucide-react";

interface PRInputFormProps {
  onSubmit: (data: {
    platform: Platform;
    url?: string;
    token?: string;
    title?: string;
    description?: string;
    diffText?: string;
  }) => void;
  isLoading: boolean;
}

export default function PRInputForm({ onSubmit, isLoading }: PRInputFormProps) {
  const [platform, setPlatform] = useState<Platform>(Platform.GITLAB);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  
  // Manual Paste fields
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualDiff, setManualDiff] = useState("");

  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (platform === Platform.MANUAL) {
      if (!manualDiff.trim()) {
        setError("Por favor, introduce el código del diff unificado.");
        return;
      }
      onSubmit({
        platform,
        title: manualTitle || "Manual Code Review",
        description: manualDescription,
        diffText: manualDiff,
      });
    } else {
      if (!url.trim()) {
        setError("Por favor, introduce la URL del Pull Request o Merge Request.");
        return;
      }
      if (!token.trim()) {
        setError("Se requiere un token de acceso personal (PAT) para acceder de forma automática.");
        return;
      }
      
      // Auto-detect platform from URL if possible
      let finalPlatform = platform;
      if (url.includes("gitlab")) {
        finalPlatform = Platform.GITLAB;
      } else if (url.includes("azure") || url.includes("visualstudio.com")) {
        finalPlatform = Platform.AZURE_DEVOPS;
      }

      onSubmit({
        platform: finalPlatform,
        url: url.trim(),
        token: token.trim(),
      });
    }
  };

  const handleDemoPaste = (type: "gitlab" | "azure" | "manual") => {
    setError(null);
    if (type === "gitlab") {
      setPlatform(Platform.GITLAB);
      setUrl("https://gitlab.com/gitlab-org/gitlab-foss/-/merge_requests/28322");
      setToken("glpat-demo_token_placeholder_example_1234");
    } else if (type === "azure") {
      setPlatform(Platform.AZURE_DEVOPS);
      setUrl("https://dev.azure.com/microsoft/vscode/_git/vscode/pullrequest/10250");
      setToken("devops_pat_example_abcdefghijklmnopqrstuvwx");
    } else {
      setPlatform(Platform.MANUAL);
      setManualTitle("Refactorización de Autenticación de Firebase");
      setManualDescription("Mejora el manejo de errores en auth.ts y actualiza variables de entorno.");
      setManualDiff(`diff --git a/src/auth.ts b/src/auth.ts
index e69de29..bc18b4e 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,15 +1,28 @@
 import { initializeApp } from 'firebase/app';
-import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
+import { getAuth, signInWithEmailAndPassword, Auth } from 'firebase/auth';
 
-const firebaseConfig = {
-  apiKey: "AIzaSyDummyKey_12345",
-  authDomain: "app.firebaseapp.com",
-};
+let authInstance: Auth | null = null;
 
-const app = initializeApp(firebaseConfig);
-export const auth = getAuth(app);
+export function getFirebaseAuth(): Auth {
+  if (!authInstance) {
+    const apiKey = process.env.FIREBASE_API_KEY;
+    if (!apiKey) {
+      // CRITICAL: Alerta de seguridad si falta la API Key
+      throw new Error("La variable de entorno FIREBASE_API_KEY es requerida.");
+    }
+    const firebaseConfig = {
+      apiKey: apiKey,
+      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "app.firebaseapp.com",
+    };
+    const app = initializeApp(firebaseConfig);
+    authInstance = getAuth(app);
+  }
+  return authInstance;
+}
 
-export async function loginUser(email: string, pass: string) {
-  // Sin manejo de errores
-  return signInWithEmailAndPassword(auth, email, pass);
+export async function loginUser(email: string, pass: string) {
+  try {
+    return await signInWithEmailAndPassword(getFirebaseAuth(), email, pass);
+  } catch (error: any) {
+    console.error("Error al iniciar sesión:", error.message);
+    throw new Error(\`Error de autenticación: \${error.message}\`);
+  }
 }`);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 transition-all">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
            Iniciar Revisión de Código
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Soporta GitLab, Azure DevOps (TFS) e importación de diffs manuales.
          </p>
        </div>

        {/* Platform selection tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start">
          <button
            type="button"
            onClick={() => { setPlatform(Platform.GITLAB); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              platform === Platform.GITLAB
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            GitLab MR
          </button>
          <button
            type="button"
            onClick={() => { setPlatform(Platform.AZURE_DEVOPS); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              platform === Platform.AZURE_DEVOPS
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Azure DevOps / TFS
          </button>
          <button
            type="button"
            onClick={() => { setPlatform(Platform.MANUAL); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              platform === Platform.MANUAL
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Diff Manual (Local)
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {platform !== Platform.MANUAL ? (
          <>
            {/* Automatic URL Mode */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                URL del Merge Request / Pull Request
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Link2 className="w-5 h-5" />
                </div>
                <input
                  type="url"
                  required
                  placeholder={
                    platform === Platform.GITLAB
                      ? "https://gitlab.com/grupo/proyecto/-/merge_requests/42"
                      : "https://dev.azure.com/organizacion/proyecto/_git/repo/pullrequest/123"
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  className="block w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm text-slate-950 dark:text-white transition-all placeholder:text-slate-400"
                />
              </div>
              <p className="text-xs text-slate-400">
                Soporta tanto servidores en la nube como instancias auto-hospedadas accesibles por internet.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Token de Acceso Personal (PAT)
                </label>
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 transition-all"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  ¿Cómo generar el Token?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  required
                  placeholder={
                    platform === Platform.GITLAB
                      ? "glpat-..."
                      : "Token de acceso de Azure DevOps..."
                  }
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={isLoading}
                  className="block w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm text-slate-950 dark:text-white transition-all placeholder:text-slate-400 font-mono"
                />
              </div>
            </div>

            {/* Help instructions block */}
            {showHelp && (
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-xs space-y-3 animate-fadeIn">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-500" />
                  Instrucciones de configuración de tokens
                </h4>
                {platform === Platform.GITLAB ? (
                  <ul className="list-disc pl-4 space-y-1.5 text-slate-600 dark:text-slate-400">
                    <li>Ve a tu cuenta de GitLab: <b>Preferences (Preferencias) &gt; Access Tokens (Tokens de acceso)</b>.</li>
                    <li>Crea un token con los permisos (scopes) <b>api</b> o <b>read_api</b> y <b>read_repository</b>.</li>
                    <li>Copia el token resultante y pégalo aquí de forma segura.</li>
                  </ul>
                ) : (
                  <ul className="list-disc pl-4 space-y-1.5 text-slate-600 dark:text-slate-400">
                    <li>Ve a tu cuenta de Azure DevOps: <b>User Settings (Configuración de usuario) &gt; Personal Access Tokens</b> en la esquina superior derecha.</li>
                    <li>Crea un token con permisos para <b>Code (Read & Write)</b> para poder ver el repositorio y añadir los hilos de comentarios.</li>
                    <li>Copia el token generado y pégalo aquí.</li>
                  </ul>
                )}
                <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-950/40">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span><b>Nota de Seguridad:</b> Tu token nunca se guarda en el servidor. Solo se utiliza en tiempo real para autorizar las peticiones a la API oficial de tu plataforma.</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Manual Paste Mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Título de la revisión / Rama
                </label>
                <input
                  type="text"
                  placeholder="Ej. Refactorización de Autenticación de Firebase"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  disabled={isLoading}
                  className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm text-slate-950 dark:text-white transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Descripción o contexto del PR
                </label>
                <input
                  type="text"
                  placeholder="Ej. Añade validaciones y protege claves en cliente"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  disabled={isLoading}
                  className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm text-slate-950 dark:text-white transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Pega el Diff Unificado (Unified Git Diff)
              </label>
              <div className="relative">
                <textarea
                  required
                  rows={8}
                  placeholder={`diff --git a/src/App.tsx b/src/App.tsx\n---\n+++\n@@ -1,4 +1,5 @@\n-const old = true;\n+const refined = true;`}
                  value={manualDiff}
                  onChange={(e) => setManualDiff(e.target.value)}
                  disabled={isLoading}
                  className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm text-slate-950 dark:text-white transition-all placeholder:text-slate-400 font-mono text-xs whitespace-pre leading-relaxed"
                />
              </div>
              <p className="text-xs text-slate-400">
                Puedes generar este formato ejecutando <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">git diff origin/main</code> en tu terminal.
              </p>
            </div>
          </>
        )}

        {/* Buttons and Demo links */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">¿Quieres probar sin configurar nada?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDemoPaste(platform === Platform.MANUAL ? "manual" : platform === Platform.GITLAB ? "gitlab" : "azure")}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline transition-all"
              >
                Cargar ejemplo de prueba
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer text-sm shrink-0"
          >
            {isLoading ? "Analizando..." : "Iniciar Análisis con IA"}
            {!isLoading && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
