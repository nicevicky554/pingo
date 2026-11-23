import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAdmin, RequireAuth } from "@/components/RequireAuth";
import { BrandSplash } from "@/components/BrandSplash";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { AuthProvider } from "@/providers/AuthProvider";
import { BrandingProvider } from "@/providers/BrandingProvider";
import { CallProvider } from "@/providers/CallProvider";
import { NotificationsProvider } from "@/providers/NotificationsProvider";
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

const Home = lazy(() => import("./pages/Home.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const ChatsPage = lazy(() => import("./pages/app/ChatsPage.tsx"));
const UpdatesPage = lazy(() => import("./pages/app/UpdatesPage.tsx"));
const CommunitiesPage = lazy(() => import("./pages/app/CommunitiesPage.tsx"));
const CallsPage = lazy(() => import("./pages/app/CallsPage.tsx"));
const SettingsPage = lazy(() => import("./pages/app/SettingsPage.tsx"));
const SettingsHomePage = lazy(() => import("./pages/app/SettingsHomePage.tsx"));
const NewMessagePage = lazy(() => import("./pages/app/NewMessagePage.tsx"));
const SearchPage = lazy(() => import("./pages/app/SearchPage.tsx"));
const ProfilePage = lazy(() => import("./pages/app/ProfilePage.tsx"));
const CreateGroupPage = lazy(() => import("./pages/app/CreateGroupPage.tsx"));
const GroupInfoPage = lazy(() => import("./pages/app/GroupInfoPage.tsx"));
const CreateChannelPage = lazy(() => import("./pages/app/CreateChannelPage.tsx"));
const ChannelPage = lazy(() => import("./pages/app/ChannelPage.tsx"));
const ChannelComposePage = lazy(
  () => import("./pages/app/ChannelComposePage.tsx"),
);
const CreateCommunityPage = lazy(
  () => import("./pages/app/CreateCommunityPage.tsx"),
);
const StatusComposerPage = lazy(
  () => import("./pages/app/StatusComposerPage.tsx"),
);
const LegalPage = lazy(() =>
  import("./pages/Legal").then((module) => ({ default: module.LegalPage })),
);
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminSetup = lazy(() => import("./pages/admin/AdminSetup.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.tsx"));
const AdminAccess = lazy(() => import("./pages/admin/AdminAccess.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings.tsx"));
const AdminBranding = lazy(() => import("./pages/admin/AdminBranding.tsx"));

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
  return <BrandSplash />;
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
    <NotificationsProvider>
    <PresenceProvider userId={session?.user.id ?? null}>
      <CallProvider>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/terms" element={<LegalPage doc="terms" />} />
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/guidelines" element={<LegalPage doc="guidelines" />} />
          <Route path="/chats" element={<Navigate to="/app/chats" replace />} />
          <Route path="/updates" element={<Navigate to="/app/updates" replace />} />
          <Route
            path="/communities"
            element={<Navigate to="/app/communities" replace />}
          />
          <Route path="/calls" element={<Navigate to="/app/calls" replace />} />
          <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
          <Route
            path="/new/message"
            element={<Navigate to="/app/new/message" replace />}
          />
          <Route path="/search" element={<Navigate to="/app/search" replace />} />
          <Route
            path="/groups/create"
            element={<Navigate to="/app/groups/create" replace />}
          />
          <Route
            path="/channels/create"
            element={<Navigate to="/app/channels/create" replace />}
          />
          <Route
            path="/updates/create"
            element={<Navigate to="/app/updates/create" replace />}
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
            <Route path="new/message" element={<NewMessagePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="profile/:userId" element={<ProfilePage />} />
            <Route path="groups/create" element={<CreateGroupPage />} />
            <Route path="groups/:conversationId" element={<GroupInfoPage />} />
            <Route path="channels/create" element={<CreateChannelPage />} />
            <Route path="channels/:channelId" element={<ChannelPage />} />
            <Route
              path="channels/:channelId/compose"
              element={<ChannelComposePage />}
            />
            <Route path="updates" element={<UpdatesPage />} />
            <Route path="updates/create" element={<StatusComposerPage />} />
            <Route path="communities" element={<CommunitiesPage />} />
            <Route path="communities/create" element={<CreateCommunityPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="settings" element={<SettingsHomePage />} />
            <Route path="settings/:section" element={<SettingsPage />} />
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
            <Route path="branding" element={<AdminBranding />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </CallProvider>
    </PresenceProvider>
    </NotificationsProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <AuthProvider>
        <BrandingProvider>
          <BrowserRouter>
            <RouteSyncer />
            <AppProviders />
          </BrowserRouter>
          <Toaster />
        </BrandingProvider>
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
