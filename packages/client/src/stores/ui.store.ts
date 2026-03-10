// ──────────────────────────────────────────────
// Zustand Store: UI Slice
// ──────────────────────────────────────────────
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Panel = "chat" | "characters" | "lorebooks" | "presets" | "connections" | "agents" | "personas" | "settings";
type FontSize = 12 | 14 | 16 | 17;
export type VisualTheme = "default" | "sillytavern";
export type HudPosition = "top" | "left" | "right";
export type EchoChamberSide = "left" | "right";

/** A user-installed custom theme */
export interface CustomTheme {
  id: string;
  name: string;
  /** Raw CSS that gets injected as a <style> tag */
  css: string;
  /** When this theme was installed */
  installedAt: string;
}

/** A user-installed extension (JS/CSS) */
export interface InstalledExtension {
  id: string;
  name: string;
  description: string;
  /** CSS to inject */
  css?: string;
  /** Whether the extension is enabled */
  enabled: boolean;
  installedAt: string;
}

interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanel: Panel;
  settingsTab: string;
  modal: { type: string; props?: Record<string, unknown> } | null;
  theme: "dark" | "light";
  chatBackground: string | null;
  /** When set, the main area shows the full-page character editor instead of chat */
  characterDetailId: string | null;
  /** When set, the main area shows the full-page lorebook editor instead of chat */
  lorebookDetailId: string | null;
  /** When set, the main area shows the full-page preset editor instead of chat */
  presetDetailId: string | null;
  /** When set, the main area shows the full-page connection editor instead of chat */
  connectionDetailId: string | null;
  /** When set, the main area shows the full-page agent editor. Value is the agent *type* id (e.g. "world-state") */
  agentDetailId: string | null;
  /** When set, the main area shows the full-page tool editor */
  toolDetailId: string | null;
  /** When set, the main area shows the full-page persona editor */
  personaDetailId: string | null;
  /** When set, the main area shows the full-page regex script editor */
  regexDetailId: string | null;

  // ── Settings (persisted) ──
  fontSize: FontSize;
  /** Font size for chat messages (px) */
  chatFontSize: number;
  /** Custom font family name (empty = default Inter) */
  fontFamily: string;
  enableStreaming: boolean;
  /** Streaming render rate: 30 or 60 FPS */
  streamingFps: 30 | 60;
  debugMode: boolean;
  messageGrouping: boolean;
  showTimestamps: boolean;
  showModelName: boolean;
  confirmBeforeDelete: boolean;
  /** Number of messages to load per page (0 = load all) */
  messagesPerPage: number;

  // ── Visual Theme ──
  visualTheme: VisualTheme;

  // ── Input ──
  enterToSend: boolean;

  // ── Roleplay Effects ──
  weatherEffects: boolean;

  // ── HUD Layout ──
  hudPosition: HudPosition;

  // ── Custom Themes & Extensions ──
  /** Currently active custom theme id (null = built-in default) */
  activeCustomTheme: string | null;
  customThemes: CustomTheme[];
  installedExtensions: InstalledExtension[];

  // ── Onboarding ──
  hasCompletedOnboarding: boolean;

  // ── Dismissals ──
  linkApiBannerDismissed: boolean;

  // ── EchoChamber ──
  echoChamberOpen: boolean;
  echoChamberSide: EchoChamberSide;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  openRightPanel: (panel: Panel) => void;
  closeRightPanel: () => void;
  toggleRightPanel: (panel: Panel) => void;
  setSettingsTab: (tab: string) => void;
  openModal: (type: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setChatBackground: (url: string | null) => void;
  openCharacterDetail: (id: string) => void;
  closeCharacterDetail: () => void;
  openLorebookDetail: (id: string) => void;
  closeLorebookDetail: () => void;
  openPresetDetail: (id: string) => void;
  closePresetDetail: () => void;
  openConnectionDetail: (id: string) => void;
  closeConnectionDetail: () => void;
  openAgentDetail: (agentType: string) => void;
  closeAgentDetail: () => void;
  openToolDetail: (id: string) => void;
  closeToolDetail: () => void;
  openPersonaDetail: (id: string) => void;
  closePersonaDetail: () => void;
  openRegexDetail: (id: string) => void;
  closeRegexDetail: () => void;

  /** Returns true if any full-page detail editor is currently open */
  hasAnyDetailOpen: () => boolean;
  /** Close all detail editors at once */
  closeAllDetails: () => void;

  // Settings actions
  setFontSize: (size: FontSize) => void;
  setChatFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setEnableStreaming: (v: boolean) => void;
  setStreamingFps: (v: 30 | 60) => void;
  setDebugMode: (v: boolean) => void;
  setMessageGrouping: (v: boolean) => void;
  setShowTimestamps: (v: boolean) => void;
  setShowModelName: (v: boolean) => void;
  setConfirmBeforeDelete: (v: boolean) => void;
  setMessagesPerPage: (n: number) => void;
  setVisualTheme: (v: VisualTheme) => void;
  setEnterToSend: (v: boolean) => void;
  setWeatherEffects: (v: boolean) => void;
  setHudPosition: (v: HudPosition) => void;
  setActiveCustomTheme: (id: string | null) => void;
  addCustomTheme: (theme: CustomTheme) => void;
  updateCustomTheme: (id: string, patch: Partial<Pick<CustomTheme, "name" | "css">>) => void;
  removeCustomTheme: (id: string) => void;
  addExtension: (ext: InstalledExtension) => void;
  removeExtension: (id: string) => void;
  toggleExtension: (id: string) => void;
  setHasCompletedOnboarding: (v: boolean) => void;
  dismissLinkApiBanner: () => void;
  toggleEchoChamber: () => void;
  setEchoChamberSide: (side: EchoChamberSide) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      sidebarWidth: 280,
      rightPanelOpen: false,
      rightPanel: "chat" as Panel,
      settingsTab: "general",
      modal: null,
      theme: "dark" as const,
      chatBackground: null,
      characterDetailId: null,
      lorebookDetailId: null,
      presetDetailId: null,
      connectionDetailId: null,
      agentDetailId: null,
      toolDetailId: null,
      personaDetailId: null,
      regexDetailId: null,

      // Settings defaults
      fontSize: 14 as FontSize,
      chatFontSize: 16,
      fontFamily: "",
      enableStreaming: true,
      streamingFps: 60 as 30 | 60,
      debugMode: false,
      messageGrouping: true,
      showTimestamps: false,
      showModelName: false,
      confirmBeforeDelete: true,
      messagesPerPage: 20,
      visualTheme: "default" as VisualTheme,
      enterToSend: true,
      weatherEffects: true,
      hudPosition: "top" as HudPosition,
      activeCustomTheme: null,
      customThemes: [],
      installedExtensions: [],
      hasCompletedOnboarding: false,
      linkApiBannerDismissed: false,
      echoChamberOpen: false,
      echoChamberSide: "right" as EchoChamberSide,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),

      openRightPanel: (panel) => set({ rightPanelOpen: true, rightPanel: panel }),
      closeRightPanel: () => set({ rightPanelOpen: false }),
      toggleRightPanel: (panel) =>
        set((s) =>
          s.rightPanelOpen && s.rightPanel === panel
            ? { rightPanelOpen: false }
            : { rightPanelOpen: true, rightPanel: panel },
        ),

      setSettingsTab: (tab) => set({ settingsTab: tab }),
      openModal: (type, props) => set({ modal: { type, props } }),
      closeModal: () => set({ modal: null }),
      setTheme: (theme) => set({ theme }),
      setChatBackground: (url) => set({ chatBackground: url }),
      openCharacterDetail: (id) =>
        set({
          characterDetailId: id,
          lorebookDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          agentDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closeCharacterDetail: () => set({ characterDetailId: null }),
      openLorebookDetail: (id) =>
        set({
          lorebookDetailId: id,
          characterDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          agentDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closeLorebookDetail: () => set({ lorebookDetailId: null }),
      openPresetDetail: (id) =>
        set({
          presetDetailId: id,
          characterDetailId: null,
          lorebookDetailId: null,
          connectionDetailId: null,
          agentDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closePresetDetail: () => set({ presetDetailId: null }),
      openConnectionDetail: (id) =>
        set({
          connectionDetailId: id,
          characterDetailId: null,
          lorebookDetailId: null,
          presetDetailId: null,
          agentDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closeConnectionDetail: () => set({ connectionDetailId: null }),
      openAgentDetail: (agentType) =>
        set({
          agentDetailId: agentType,
          characterDetailId: null,
          lorebookDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          toolDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closeAgentDetail: () => set({ agentDetailId: null }),
      openToolDetail: (id) =>
        set({
          toolDetailId: id,
          agentDetailId: null,
          characterDetailId: null,
          lorebookDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closeToolDetail: () => set({ toolDetailId: null }),
      openPersonaDetail: (id) =>
        set({
          personaDetailId: id,
          characterDetailId: null,
          lorebookDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          agentDetailId: null,
          toolDetailId: null,
          regexDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closePersonaDetail: () => set({ personaDetailId: null }),
      openRegexDetail: (id) =>
        set({
          regexDetailId: id,
          personaDetailId: null,
          characterDetailId: null,
          lorebookDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          agentDetailId: null,
          toolDetailId: null,
          ...(window.innerWidth < 768 && { rightPanelOpen: false }),
        }),
      closeRegexDetail: () => set({ regexDetailId: null }),

      hasAnyDetailOpen: () => {
        const s = get();
        return !!(
          s.characterDetailId ||
          s.lorebookDetailId ||
          s.presetDetailId ||
          s.connectionDetailId ||
          s.agentDetailId ||
          s.toolDetailId ||
          s.personaDetailId ||
          s.regexDetailId
        );
      },
      closeAllDetails: () =>
        set({
          characterDetailId: null,
          lorebookDetailId: null,
          presetDetailId: null,
          connectionDetailId: null,
          agentDetailId: null,
          toolDetailId: null,
          personaDetailId: null,
          regexDetailId: null,
        }),

      // Settings actions
      setFontSize: (size) => set({ fontSize: size }),
      setChatFontSize: (size) => set({ chatFontSize: size }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setEnableStreaming: (v) => set({ enableStreaming: v }),
      setStreamingFps: (v) => set({ streamingFps: v }),
      setDebugMode: (v) => set({ debugMode: v }),
      setMessageGrouping: (v) => set({ messageGrouping: v }),
      setShowTimestamps: (v) => set({ showTimestamps: v }),
      setShowModelName: (v) => set({ showModelName: v }),
      setConfirmBeforeDelete: (v) => set({ confirmBeforeDelete: v }),
      setMessagesPerPage: (n) => set({ messagesPerPage: n }),
      setVisualTheme: (v) => set({ visualTheme: v }),
      setEnterToSend: (v) => set({ enterToSend: v }),
      setWeatherEffects: (v) => set({ weatherEffects: v }),
      setHudPosition: (v) => set({ hudPosition: v }),
      setActiveCustomTheme: (id) => set({ activeCustomTheme: id }),
      addCustomTheme: (theme) => set((s) => ({ customThemes: [...s.customThemes, theme] })),
      updateCustomTheme: (id, patch) =>
        set((s) => ({
          customThemes: s.customThemes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removeCustomTheme: (id) =>
        set((s) => ({
          customThemes: s.customThemes.filter((t) => t.id !== id),
          activeCustomTheme: s.activeCustomTheme === id ? null : s.activeCustomTheme,
        })),
      addExtension: (ext) => set((s) => ({ installedExtensions: [...s.installedExtensions, ext] })),
      removeExtension: (id) =>
        set((s) => ({
          installedExtensions: s.installedExtensions.filter((e) => e.id !== id),
        })),
      toggleExtension: (id) =>
        set((s) => ({
          installedExtensions: s.installedExtensions.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)),
        })),
      setHasCompletedOnboarding: (v) => set({ hasCompletedOnboarding: v }),
      dismissLinkApiBanner: () => set({ linkApiBannerDismissed: true }),
      toggleEchoChamber: () => set((s) => ({ echoChamberOpen: !s.echoChamberOpen })),
      setEchoChamberSide: (side) => set({ echoChamberSide: side }),
    }),
    {
      name: "marinara-engine-ui",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        theme: state.theme,
        chatBackground: state.chatBackground,
        fontSize: state.fontSize,
        chatFontSize: state.chatFontSize,
        fontFamily: state.fontFamily,
        enableStreaming: state.enableStreaming,
        streamingFps: state.streamingFps,
        debugMode: state.debugMode,
        messageGrouping: state.messageGrouping,
        showTimestamps: state.showTimestamps,
        showModelName: state.showModelName,
        confirmBeforeDelete: state.confirmBeforeDelete,
        messagesPerPage: state.messagesPerPage,
        visualTheme: state.visualTheme,
        enterToSend: state.enterToSend,
        weatherEffects: state.weatherEffects,
        hudPosition: state.hudPosition,
        activeCustomTheme: state.activeCustomTheme,
        customThemes: state.customThemes,
        installedExtensions: state.installedExtensions,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        linkApiBannerDismissed: state.linkApiBannerDismissed,
        echoChamberSide: state.echoChamberSide,
      }),
    },
  ),
);
