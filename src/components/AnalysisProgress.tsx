import React from "react";
import { AnalysisStep } from "../types";
import { CheckCircle2, Loader2, XCircle, Circle } from "lucide-react";

interface AnalysisProgressProps {
  steps: AnalysisStep[];
}

export default function AnalysisProgress({ steps }: AnalysisProgressProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 max-w-2xl mx-auto transition-all">
      <div className="text-center mb-8">
        <Loader2 className="w-12 h-12 text-slate-800 dark:text-white animate-spin mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
          Analizando Pull Request
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Por favor, no cierres esta pestaña. La IA de OpenAI está revisando tu código en busca de posibles fallos y mejoras.
        </p>
      </div>

      <div className="relative space-y-6">
        {/* Timeline indicator line */}
        <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100 dark:bg-slate-800 pointer-events-none" />

        {steps.map((step, idx) => {
          const isRunning = step.status === "running";
          const isSuccess = step.status === "success";
          const isError = step.status === "error";
          const isIdle = step.status === "idle";

          return (
            <div key={step.id} className="relative flex gap-4 items-start transition-all duration-300">
              {/* Icon status circle */}
              <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-slate-900 shadow-sm shrink-0">
                {isSuccess && (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                )}
                {isRunning && (
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
                )}
                {isError && (
                  <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                )}
                {isIdle && (
                  <Circle className="w-5 h-5 text-slate-300 dark:text-slate-700 shrink-0" />
                )}
              </div>

              <div className="flex-1 pt-1.5">
                <h4 className={`text-sm font-semibold transition-colors ${
                  isRunning ? "text-indigo-600 dark:text-indigo-400 font-bold" : 
                  isSuccess ? "text-slate-900 dark:text-slate-100 font-medium" : 
                  isError ? "text-red-600 dark:text-red-400 font-bold" : 
                  "text-slate-400 dark:text-slate-600"
                }`}>
                  {step.label}
                </h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {step.description}
                </p>

                {isError && step.errorMsg && (
                  <div className="mt-2 text-xs bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-2.5 rounded-lg border border-red-200/50 dark:border-red-950/40 font-mono whitespace-pre-wrap">
                    {step.errorMsg}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
