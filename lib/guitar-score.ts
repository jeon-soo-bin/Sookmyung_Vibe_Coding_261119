import { exampleScore, STANDARD_TUNING } from "./transcription";
import type { ChordInterval, Note, Score, TimedColumn } from "./transcription";

export type { Note } from "./transcription";
export type { ChordInterval } from "./transcription";

const openPitches = [40, 45, 50, 55, 59, 64];
const simultaneousWindow = 0.04;
const maxFret = 24;

type Position = { string: number; fret: number };
type Assignment = { position: Position; noteIndex: number };
type Placement = { assignments: Assignment[]; cost: number };

function assignStrings(notes: Note[], occupiedUntil: number[], hand: number) {
  // A six-bit mask records which strings a candidate assignment uses.
  let placements = new Map<number, Placement>([[0, { assignments: [], cost: 0 }]]);
  for (const [noteIndex, note] of notes.entries()) {
    const next = new Map(placements);
    for (const [string, openPitch] of openPitches.entries()) {
      const fret = note.pitch - openPitch;
      if (fret < 0 || fret > maxFret || occupiedUntil[string] > note.start + 1e-9) continue;
      const bit = 1 << string;
      const movement = fret === 0 ? 0 : Math.abs(fret - hand) + fret / maxFret;
      for (const [used, placement] of placements) {
        if (used & bit) continue;
        const mask = used | bit;
        const cost = placement.cost + movement;
        if (cost >= (next.get(mask)?.cost ?? Infinity)) continue;
        next.set(mask, { cost, assignments: [...placement.assignments, { position: { string, fret }, noteIndex }] });
      }
    }
    placements = next;
  }
  return [...placements.values()].reduce((best, current) =>
    current.assignments.length > best.assignments.length ||
      (current.assignments.length === best.assignments.length && current.cost < best.cost) ? current : best,
  ).assignments;
}

export function createGuitarScore(name: string, notes: Note[], intervals: ChordInterval[], chordNotice?: string): Score | null {
  if (!notes.length) return null;
  const columns: { start: number; notes: Note[]; chord?: string }[] = [];
  for (const note of [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch)) {
    const previous = columns.at(-1);
    // Compare to the first onset so a run of fast notes cannot chain into one chord.
    if (previous && note.start - previous.start <= simultaneousWindow + 1e-9 &&
        previous.notes.every((held) => held.start + held.duration > note.start)) previous.notes.push(note);
    else columns.push({ start: note.start, notes: [note] });
  }
  const noteColumns = [...columns];
  for (const chord of intervals) {
    const column = noteColumns.find(({ start }) => start <= chord.start && chord.start - start <= simultaneousWindow);
    if (column) column.chord = chord.name;
    else columns.push({ start: chord.start, notes: [], chord: chord.name });
  }

  const measures: Score["measures"] = [];
  const occupiedUntil = openPitches.map(() => 0);
  let hand = 2;
  let soundingUntil = 0;
  let unassigned = 0;
  let wideStretch = false;
  for (const column of columns.sort((a, b) => a.start - b.start)) {
    const frets: (number | null)[] = openPitches.map(() => null);
    const assignments = assignStrings(column.notes, occupiedUntil, hand);
    const timing: TimedColumn = {
      start: column.start,
      restBefore: column.notes.length ? Math.max(0, column.start - soundingUntil) : 0,
      notes: column.notes.map((note) => ({ ...note, string: null })),
    };
    for (const { position: { string, fret }, noteIndex } of assignments) {
      const note = timing.notes[noteIndex];
      note.string = string;
      frets[string] = fret;
      occupiedUntil[string] = note.start + note.duration;
    }
    for (const note of column.notes) soundingUntil = Math.max(soundingUntil, note.start + note.duration);
    unassigned += column.notes.length - assignments.length;
    const pressed = assignments.map(({ position }) => position.fret).filter((fret) => fret > 0);
    if (pressed.length) {
      hand = pressed.reduce((sum, fret) => sum + fret, 0) / pressed.length;
      wideStretch ||= Math.max(...pressed) - Math.min(...pressed) > 4;
    }
    let measure = measures.at(-1);
    if (!measure || measure.beats.length === 4) {
      measure = { chord: "", beats: [], chordChanges: [], timing: [] };
      measures.push(measure);
    }
    if (column.chord) measure.chordChanges?.push({ beat: measure.beats.length, name: column.chord });
    measure.beats.push(frets);
    measure.timing?.push(timing);
  }

  const names = new Set(intervals.map(({ name }) => name));
  const chords = exampleScore.chords.filter((chord) => names.has(chord.name));
  const notices = [];
  if (chordNotice) notices.push(chordNotice);
  else if (!names.size) notices.push("인식된 코드가 없습니다.");
  if (names.size > chords.length) notices.push("운지 데이터가 있는 코드의 참고 그림만 표시합니다. 나머지 코드는 악보에서 이름을 확인할 수 있습니다.");
  if (unassigned) notices.push(`표준 튜닝 6현·24프렛 또는 동시에 사용할 수 있는 줄의 한계로 음표 ${unassigned}개에 운지를 배정하지 못했습니다. 악보의 ! 표시나 복사한 타브에서 해당 음을 확인할 수 있습니다.`);
  if (wideStretch) notices.push("일부 동시음은 프렛 간격이 넓어 한 손으로 연주하기 어려울 수 있습니다.");

  return {
    title: name.replace(/\.[^.]+$/, "").trim() || "기타 연주",
    tuning: STANDARD_TUNING,
    mock: false,
    measures,
    chords,
    chordIntervals: intervals,
    notices,
  };
}
