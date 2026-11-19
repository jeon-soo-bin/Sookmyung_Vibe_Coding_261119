import { exampleScore, STANDARD_TUNING } from "./transcription";
import type { Score } from "./transcription";

export type Note = { pitch: number; start: number; duration: number };
export type ChordInterval = { start: number; end: number; name: string };

const openPitches = [40, 45, 50, 55, 59, 64];
const groupSeconds = 0.04;

export function createGuitarScore(name: string, notes: Note[], intervals: ChordInterval[], chordNotice?: string): Score | null {
  const columns = new Map<number, { notes: Note[]; chord?: string }>();
  for (const note of notes) {
    const group = Math.floor(note.start / groupSeconds);
    const column = columns.get(group) ?? { notes: [] };
    column.notes.push(note);
    columns.set(group, column);
  }
  for (const chord of intervals) {
    const group = Math.floor(chord.start / groupSeconds);
    const column = columns.get(group) ?? { notes: [] };
    column.chord = chord.name;
    columns.set(group, column);
  }

  const measures: Score["measures"] = [];
  const occupiedUntil = openPitches.map(() => 0);
  let hand = 2;
  let mapped = 0;
  const sortedColumns = [...columns].sort(([a], [b]) => a - b);
  for (const [group, column] of sortedColumns) {
    const frets: (number | null)[] = openPitches.map(() => null);
    const candidates = column.notes.map((note) => ({
      note,
      positions: openPitches.flatMap((pitch, string) => {
        const fret = note.pitch - pitch;
        return fret >= 0 && fret <= 24 ? [{ string, fret }] : [];
      }),
    }));
    candidates.sort((a, b) => a.positions.length - b.positions.length || a.note.pitch - b.note.pitch);
    for (const { note, positions } of candidates) {
      const free = positions.filter(({ string }) => frets[string] === null && occupiedUntil[string] <= note.start);
      const cost = (fret: number) => fret === 0 ? 1 : Math.abs(fret - hand) + fret / 24;
      free.sort((a, b) => cost(a.fret) - cost(b.fret));
      const position = free[0];
      if (!position) continue;
      frets[position.string] = position.fret;
      occupiedUntil[position.string] = note.start + note.duration;
      if (position.fret > 0) hand = position.fret;
      mapped++;
    }
    if (!column.chord && frets.every((fret) => fret === null)) continue;
    let measure = measures.at(-1);
    if (!measure || measure.beats.length === 4) {
      measure = { chord: "", beats: [], chordChanges: [] };
      measures.push(measure);
    }
    if (column.chord) measure.chordChanges?.push({ beat: measure.beats.length, name: column.chord });
    measure.beats.push(frets);
  }
  if (!mapped) return null;

  const names = new Set(intervals.map(({ name }) => name));
  const chords = exampleScore.chords.filter((chord) => names.has(chord.name));
  const notices = [];
  if (chordNotice) notices.push(chordNotice);
  else if (!names.size) notices.push("인식된 코드가 없습니다.");
  if (names.size > chords.length) notices.push("운지 데이터가 있는 코드의 참고 그림만 표시합니다. 나머지 코드는 악보에서 이름을 확인할 수 있습니다.");
  if (mapped < notes.length) notices.push(`기타 줄과 프렛에 배치할 수 없는 음표 ${notes.length - mapped}개를 생략했습니다.`);

  return {
    title: name.replace(/\.[^.]+$/, "").trim() || "기타 연주",
    tuning: STANDARD_TUNING,
    mock: false,
    measures,
    chords,
    notices,
  };
}
