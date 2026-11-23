import { supabase } from "@/lib/supabase";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BrandingAssets = {
  app_icon_url?: string;
  light_logo_url?: string;
  dark_logo_url?: string;
  splash_icon_url?: string;
  splash_background_url?: string;
  loading_url?: string;
  default_avatar_url?: string;
  default_group_url?: string;
  default_channel_url?: string;
  default_community_url?: string;
};

type BrandingContextValue = {
  assets: BrandingAssets;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue>({
  assets: {},
  loading: true,
  refresh: async () => undefined,
});

function isDarkTheme() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<BrandingAssets>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_public_branding");
    if (!error && data && typeof data === "object") {
      setAssets(data as BrandingAssets);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const icon = assets.app_icon_url || assets.splash_icon_url;
    if (!icon) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = icon;
  }, [assets.app_icon_url, assets.splash_icon_url]);

  const value = useMemo(
    () => ({ assets, loading, refresh }),
    [assets, loading, refresh],
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

export function useBrandAsset(
  kind: "icon" | "logo" | "splash" = "icon",
): string | undefined {
  const { assets } = useBranding();
  const dark = isDarkTheme();
  if (kind === "splash") {
    return assets.splash_icon_url || assets.app_icon_url;
  }
  if (kind === "logo") {
    return dark
      ? assets.dark_logo_url || assets.light_logo_url
      : assets.light_logo_url || assets.dark_logo_url;
  }
  return assets.app_icon_url || assets.light_logo_url;
}
