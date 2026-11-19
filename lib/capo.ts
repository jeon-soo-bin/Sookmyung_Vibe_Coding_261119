export const MAX_CAPO = 12;

export function isCapo(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CAPO;
}

const chromaticRoots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const naturalRoots: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function chordShape(name: string, capo: number) {
  if (capo === 0) return name;
  const match = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (!match) return undefined;
  const [, root, accidental, quality] = match;
  const pitch = naturalRoots[root] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  return chromaticRoots[((pitch - capo) % 12 + 12) % 12] + quality;
}
