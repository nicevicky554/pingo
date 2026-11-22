import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAdmin, RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { AuthProvider } from "@/providers/AuthProvider";
import { CallProvider } from "@/providers/CallProvider";
import { PresenceProvider } from "@/providers/PresenceProvider";
import { useAuth } from "@/hooks/use-auth";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import "./index.css";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const ChatsPage = lazy(() => import("./pages/app/ChatsPage.tsx"));
const UpdatesPage = lazy(() => import("./pages/app/UpdatesPage.tsx"));
const CommunitiesPage = lazy(() => import("./pages/app/CommunitiesPage.tsx"));
const CallsPage = lazy(() => import("./pages/app/CallsPage.tsx"));
const SettingsPage = lazy(() => import("./pages/app/SettingsPage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminSetup = lazy(() => import("./pages/admin/AdminSetup.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.tsx"));
const AdminAccess = lazy(() => import("./pages/admin/AdminAccess.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings.tsx"));

const AppShell = lazy(() =>
  import("@/components/app/AppShell").then((module) => ({
    default: module.AppShell,
  })),
);
const AppGate = lazy(() =>
  import("@/components/app/AppGate").then((module) => ({
    default: module.AppGate,
  })),
);
const AdminShell = lazy(() =>
  import("@/components/admin/AdminShell").then((module) => ({
    default: module.AdminShell,
  })),
);

function RouteLoading() {
  return (
    <div className="dot-grid flex min-h-screen items-center justify-center bg-background">
      <div className="animate-pulse text-sm font-semibold text-muted-foreground">
        Opening PINGO…
      </div>
    </div>
  );
}

class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Unknown runtime error" };
  }
  componentDidCatch(err: Error) {
    console.error("[PINGO] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md text-center">
            <p className="text-sm font-semibold">PINGO hit a runtime error</p>
            <p className="mt-2 text-xs break-words text-muted-foreground">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

function AppProviders() {
  const { session } = useAuth();
  return (
    <PresenceProvider userId={session?.user.id ?? null}>
      <CallProvider>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/auth"
            element={<AuthPage />}
          />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppGate>
                  <AppShell>
                    <Outlet />
                  </AppShell>
                </AppGate>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/app/chats" replace />} />
            <Route path="chats" element={<ChatsPage />} />
            <Route path="updates" element={<UpdatesPage />} />
            <Route path="communities" element={<CommunitiesPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route
            path="/admin/setup"
            element={
              <RequireAuth>
                <AdminSetup />
              </RequireAuth>
            }
          />

          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminShell>
                  <Outlet />
                </AdminShell>
              </RequireAdmin>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="access" element={<AdminAccess />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </CallProvider>
    </PresenceProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <RouteSyncer />
          <AppProviders />
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
