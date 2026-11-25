import type { DashboardSettings } from '../types/nexasua';

export interface DashboardThemePreset {
  id: string;
  label: string;
  primaryColor: string;
  accentColor: string;
  sidebarBgClass: string;
  accentBgClass: string;
  accentHoverClass: string;
  accentTextClass: string;
  accentBorderClass: string;
}

export const DASHBOARD_THEME_PRESETS: DashboardThemePreset[] = [
  {
    id: 'navy-teal',
    label: 'NexaSua Navy & Teal',
    primaryColor: '#102846',
    accentColor: '#148D82',
    sidebarBgClass: 'bg-[#102846]',
    accentBgClass: 'bg-[#148D82]',
    accentHoverClass: 'hover:bg-[#10766c]',
    accentTextClass: 'text-[#148D82]',
    accentBorderClass: 'border-[#148D82]',
  },
  {
    id: 'forest-gold',
    label: 'Ashanti Forest & Gold',
    primaryColor: '#0F3D2E',
    accentColor: '#B45309',
    sidebarBgClass: 'bg-[#0F3D2E]',
    accentBgClass: 'bg-[#B45309]',
    accentHoverClass: 'hover:bg-[#92400E]',
    accentTextClass: 'text-[#B45309]',
    accentBorderClass: 'border-[#B45309]',
  },
  {
    id: 'royal-emerald',
    label: 'Accra Royal & Emerald',
    primaryColor: '#172554',
    accentColor: '#0D9488',
    sidebarBgClass: 'bg-[#172554]',
    accentBgClass: 'bg-[#0D9488]',
    accentHoverClass: 'hover:bg-[#0F766E]',
    accentTextClass: 'text-[#0D9488]',
    accentBorderClass: 'border-[#0D9488]',
  },
  {
    id: 'burgundy-gold',
    label: 'Heritage Burgundy & Gold',
    primaryColor: '#4C1D24',
    accentColor: '#B45309',
    sidebarBgClass: 'bg-[#4C1D24]',
    accentBgClass: 'bg-[#B45309]',
    accentHoverClass: 'hover:bg-[#92400E]',
    accentTextClass: 'text-[#B45309]',
    accentBorderClass: 'border-[#B45309]',
  },
  {
    id: 'plum-green',
    label: 'Scholar Plum & Green',
    primaryColor: '#3B1C4A',
    accentColor: '#15803D',
    sidebarBgClass: 'bg-[#3B1C4A]',
    accentBgClass: 'bg-[#15803D]',
    accentHoverClass: 'hover:bg-[#166534]',
    accentTextClass: 'text-[#15803D]',
    accentBorderClass: 'border-[#15803D]',
  },
  {
    id: 'charcoal-amber',
    label: 'Academic Charcoal & Amber',
    primaryColor: '#1F2937',
    accentColor: '#D97706',
    sidebarBgClass: 'bg-[#1F2937]',
    accentBgClass: 'bg-[#D97706]',
    accentHoverClass: 'hover:bg-[#B45309]',
    accentTextClass: 'text-[#D97706]',
    accentBorderClass: 'border-[#D97706]',
  },
];

export const DEFAULT_DASHBOARD_SETTINGS: Required<DashboardSettings> = {
  customTitle: '',
  welcomeMessage: '',
  primaryColor: '#102846',
  accentColor: '#148D82',
  defaultLandingTab: 'overview',
  showSubscriptionBanner: true,
  showMetricsCards: true,
  showOnboardingChecklist: true,
  showNotificationsWidget: true,
  showSchoolLogoInSidebar: true,
};

export function resolveDashboardSettings(
  raw?: DashboardSettings | null
): Required<DashboardSettings> {
  return {
    customTitle: raw?.customTitle?.trim() || '',
    welcomeMessage: raw?.welcomeMessage?.trim() || '',
    primaryColor: raw?.primaryColor || DEFAULT_DASHBOARD_SETTINGS.primaryColor,
    accentColor: raw?.accentColor || DEFAULT_DASHBOARD_SETTINGS.accentColor,
    defaultLandingTab: raw?.defaultLandingTab || DEFAULT_DASHBOARD_SETTINGS.defaultLandingTab,
    showSubscriptionBanner: raw?.showSubscriptionBanner !== false,
    showMetricsCards: raw?.showMetricsCards !== false,
    showOnboardingChecklist: raw?.showOnboardingChecklist !== false,
    showNotificationsWidget: raw?.showNotificationsWidget !== false,
    showSchoolLogoInSidebar: raw?.showSchoolLogoInSidebar !== false,
  };
}

export function resolveDashboardTheme(
  primaryColor?: string,
  accentColor?: string
): DashboardThemePreset {
  const cleanPrimary = (primaryColor || '').toUpperCase();
  const cleanAccent = (accentColor || '').toUpperCase();
  const exact = DASHBOARD_THEME_PRESETS.find(
    (p) =>
      p.primaryColor.toUpperCase() === cleanPrimary &&
      p.accentColor.toUpperCase() === cleanAccent
  );
  if (exact) return exact;
  const byPrimary = DASHBOARD_THEME_PRESETS.find(
    (p) => p.primaryColor.toUpperCase() === cleanPrimary
  );
  return byPrimary || DASHBOARD_THEME_PRESETS[0];
}
