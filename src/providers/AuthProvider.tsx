import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Profile, UserSettings } from "@/lib/types";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  settings: UserSettings | null;
  adminRole: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null);
      setSettings(null);
      setAdminRole(null);
      return;
    }
    const uid = activeSession.user.id;

    const { data: ownProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle<Profile>();

    if (!ownProfile) {
      // Safety net if the auth trigger was not installed: create the row.
      const { data: created } = await supabase
        .from("profiles")
        .insert({ id: uid, display_name: "" })
        .select("*")
        .maybeSingle<Profile>();
      await supabase
        .from("user_settings")
        .insert({ user_id: uid })
        .select("user_id")
        .maybeSingle();
      setProfile(created ?? null);
    } else {
      setProfile(ownProfile);
      const verifiedPhone = activeSession.user.phone ?? null;
      if (verifiedPhone && ownProfile.phone !== verifiedPhone) {
        // Auth owns proof of the number; mirror it into the app profile.
        const { data: synced } = await supabase
          .from("profiles")
          .update({ phone: verifiedPhone })
          .eq("id", uid)
          .select("*")
          .maybeSingle<Profile>();
        if (synced) setProfile(synced);
      }
    }

    const { data: ownSettings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle<UserSettings>();
    setSettings(ownSettings ?? null);

    const { data: roles } = await supabase
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", uid)
      .limit(1);
    setAdminRole(roles?.[0]?.role ?? null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const active = data.session;
    setSession(active);
    await loadProfile(active);
  }, [loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (!cancelled) setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        void loadProfile(nextSession).finally(() => setIsLoading(false));
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Apply theme preference (light / dark / system) and font size.
  useEffect(() => {
    const root = document.documentElement;
    const mode = settings?.theme ?? "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && media.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();

    if (mode === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [settings?.theme]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = settings?.font_size ?? "md";
  }, [settings?.font_size]);

  useEffect(() => {
    document.documentElement.dataset.wallpaper = settings?.wallpaper ?? "dots";
  }, [settings?.wallpaper]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSettings(null);
    setAdminRole(null);
    // Clear only local app state; messages and the account stay in Supabase.
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith("pingo:") || key.startsWith("sb-")) {
          storage.removeItem(key);
        }
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      settings,
      adminRole,
      isLoading,
      isAuthenticated: Boolean(session?.user),
      needsOnboarding: Boolean(session?.user) && Boolean(profile) && !profile?.username,
      refresh,
      signOut,
    }),
    [session, profile, settings, adminRole, isLoading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
