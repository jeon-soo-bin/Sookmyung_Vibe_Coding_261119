import { exampleScore, STANDARD_TUNING } from "./transcription";
import { assignGuitarPositions } from "./guitar-fingering";
import type { ChordInterval, Note, Score, TimedColumn } from "./transcription";

export type { Note } from "./transcription";
export type { ChordInterval } from "./transcription";

const simultaneousWindow = 0.04;

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
  columns.sort((a, b) => a.start - b.start);
  const { positions, difficult } = assignGuitarPositions(columns.map(({ notes }) => notes));
  let soundingUntil = 0;
  let unassigned = 0;
  for (const [index, column] of columns.entries()) {
    const frets: (number | null)[] = STANDARD_TUNING.map(() => null);
    const timing: TimedColumn = {
      start: column.start,
      restBefore: column.notes.length ? Math.max(0, column.start - soundingUntil) : 0,
      notes: column.notes.map((note) => ({ ...note, string: null })),
    };
    for (const [noteIndex, position] of positions[index].entries()) {
      if (!position) {
        unassigned++;
        continue;
      }
      timing.notes[noteIndex].string = position.string;
      frets[position.string] = position.fret;
    }
    for (const note of column.notes) soundingUntil = Math.max(soundingUntil, note.start + note.duration);
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
  if (difficult) notices.push("일부 겹치는 음은 프렛 간격이나 필요한 손가락 수 때문에 한 손으로 연주하기 어려울 수 있습니다.");

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
