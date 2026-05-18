const palette = [
  { color: "#2563eb", background: "color-mix(in srgb, #2563eb 16%, var(--surface))", border: "color-mix(in srgb, #2563eb 42%, var(--border))" },
  { color: "#059669", background: "color-mix(in srgb, #059669 16%, var(--surface))", border: "color-mix(in srgb, #059669 42%, var(--border))" },
  { color: "#d97706", background: "color-mix(in srgb, #d97706 18%, var(--surface))", border: "color-mix(in srgb, #d97706 44%, var(--border))" },
  { color: "#7c3aed", background: "color-mix(in srgb, #7c3aed 16%, var(--surface))", border: "color-mix(in srgb, #7c3aed 42%, var(--border))" },
  { color: "#dc2626", background: "color-mix(in srgb, #dc2626 14%, var(--surface))", border: "color-mix(in srgb, #dc2626 42%, var(--border))" },
  { color: "#0891b2", background: "color-mix(in srgb, #0891b2 16%, var(--surface))", border: "color-mix(in srgb, #0891b2 42%, var(--border))" },
  { color: "#4f46e5", background: "color-mix(in srgb, #4f46e5 16%, var(--surface))", border: "color-mix(in srgb, #4f46e5 42%, var(--border))" },
  { color: "#be123c", background: "color-mix(in srgb, #be123c 14%, var(--surface))", border: "color-mix(in srgb, #be123c 42%, var(--border))" }
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "A";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function agentVisual(seed: string, label: string) {
  const normalizedSeed = seed.trim() || label.trim() || "agent";
  const paletteItem = palette[hashString(normalizedSeed) % palette.length];
  return {
    initials: initialsFor(label),
    color: paletteItem.color,
    background: paletteItem.background,
    border: paletteItem.border
  };
}
