import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { ConfigContext, useConfigLoader } from "@/hooks/useConfig";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusToastProvider } from "@/hooks/useStatusToast";
import NarrowViewportGate from "@/components/layout/NarrowViewportGate";
import HomePage from "@/pages/HomePage";

// Admin + Wizard are power-user surfaces; a typical session never
// visits them, so pay for their code only when the user actually
// navigates there. Each becomes its own async chunk that loads on
// first visit.
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const WizardPage = lazy(() => import("@/pages/WizardPage"));

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
      Loading…
    </div>
  );
}

export default function App() {
  const configState = useConfigLoader();

  return (
    <ConfigContext.Provider value={configState}>
      <StatusToastProvider>
      <TooltipProvider>
        <NarrowViewportGate>
          <BrowserRouter>
            <div className="min-h-screen bg-background text-foreground">
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:p-4 focus:text-foreground focus:shadow-lg"
              >
                Skip to content
              </a>
              {/* Each page renders its own header (or none, for the full-viewport
                  crop editor). Keeps layout concerns per-page. */}
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/wizard" element={<WizardPage />} />
                </Routes>
              </Suspense>
            </div>
          </BrowserRouter>
        </NarrowViewportGate>
      </TooltipProvider>
      </StatusToastProvider>
    </ConfigContext.Provider>
  );
}
