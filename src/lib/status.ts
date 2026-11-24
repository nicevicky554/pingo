export const STATUS_FONTS = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  rounded: "'Trebuchet MS', 'Segoe UI', sans-serif",
} as const;

export type StatusFont = keyof typeof STATUS_FONTS;
