import type { Chord, Score } from "./transcription";
import { chordShape } from "./capo";

type Change = { name: string; voicing?: Chord };
type Event = { time: number; frets?: (number | null)[]; missing?: number; change?: Change };
export type TabRow = { events: (Event & { x: number })[] };

export const MIN_TAB_WIDTH = 252;

export function layoutTab(score: Score, width: number): TabRow[] {
  const events: Event[] = [];
  const makeChange = (name: string, voicingId?: string): Change => ({
    name,
    voicing: score.chords.find((chord) => chord.name === chordShape(name, score.capo ?? 0) &&
      (voicingId === undefined || chord.voicingId === voicingId)),
  });
  let beatIndex = 0;
  let lastDemoChord = "";
  for (const measure of score.measures) {
    for (const [index, frets] of measure.beats.entries()) {
      const timing = measure.timing?.[index];
      const event: Event = { time: timing?.start ?? beatIndex * 0.25, frets };
      if (timing) {
        event.missing = timing.notes.filter((note) => note.string === null).length;
      } else {
        const label = measure.chordChanges?.find(({ beat }) => beat === index)?.name ??
          (index === 0 ? measure.chord : "");
        if (label && label !== lastDemoChord) {
          event.change = makeChange(label);
          lastDemoChord = label;
        }
      }
      if (frets.some((fret) => fret !== null) || event.missing || event.change) events.push(event);
      beatIndex++;
    }
  }

  let previous: NonNullable<Score["chordIntervals"]>[number] | undefined;
  for (const chord of [...(score.chordIntervals ?? [])].sort((a, b) => a.start - b.start)) {
    if (previous && previous.name === chord.name && previous.voicingId === chord.voicingId &&
        chord.start <= previous.end + 1e-6) {
      previous = { ...previous, end: Math.max(previous.end, chord.end) };
      continue;
    }
    const event = events.find(({ time, change }) => !change && Math.abs(time - chord.start) <= 1e-6);
    const change = makeChange(chord.name, chord.voicingId);
    if (event) event.change = change;
    else events.push({ time: chord.start, change });
    previous = chord;
  }

  const rows: TabRow[] = [];
  let row: TabRow = { events: [] };
  let lastChord = -Infinity;
  for (const event of events.sort((a, b) => a.time - b.time)) {
    const previous = row.events.at(-1);
    const rightSpace = event.change ? 42 : 19;
    const spacing = previous ? Math.min(76, 24 + (event.time - previous.time) * 54) : 0;
    let x = previous ? previous.x + spacing : 60;
    if (event.change) x = Math.max(x, lastChord + 82);
    if (previous && x + rightSpace > width) {
      rows.push(row);
      row = { events: [] };
      x = 60;
      lastChord = -Infinity;
    }
    row.events.push({ ...event, x });
    if (event.change) lastChord = x;
  }
  if (row.events.length) rows.push(row);
  return rows;
}
