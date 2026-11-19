import type { Note } from "./transcription";

const openPitches = [40, 45, 50, 55, 59, 64];
const maxFret = 24;
const beamWidth = 96;
const timeTolerance = 1e-9;

type Position = { string: number; fret: number };
type ActiveNote = { fret: number; end: number };
type Placement = { column: number; note: number; position: Position; previous?: Placement };
type State = {
  strings: (ActiveNote | null)[];
  used: number;
  hand: number;
  count: number;
  cost: number;
  difficult: boolean;
  last?: Placement;
};

function grip(strings: State["strings"]) {
  const pressed = strings.flatMap((note) => note && note.fret > 0 ? [note.fret] : []);
  if (!pressed.length) return { center: undefined, cost: 0, difficult: false };
  const low = Math.min(...pressed);
  const high = Math.max(...pressed);
  const span = high - low;
  // An open string or lower fret interrupts a possible barre at this fret.
  let fingers = 0;
  for (const fret of new Set(pressed)) {
    let covered = false;
    for (const note of strings) {
      if (note && note.fret < fret) covered = false;
      if (note?.fret === fret && !covered) {
        fingers++;
        covered = true;
      }
    }
  }
  const extraFingers = Math.max(0, fingers - 4);
  return {
    center: (low + high) / 2,
    cost: span * 0.8 + Math.max(0, span - 4) * 5 + extraFingers * 8,
    difficult: span > 4 || extraFingers > 0,
  };
}

function compare(a: State, b: State) {
  return b.count - a.count || a.cost - b.cost;
}

function keepBest(states: Iterable<State>) {
  const unique = new Map<string, State>();
  for (const state of states) {
    // Equivalent occupied strings and hand position have the same future options.
    const key = `${state.used}:${state.hand}:${state.strings.map((note) => note ? `${note.fret}/${note.end}` : "").join(",")}`;
    const previous = unique.get(key);
    if (!previous || compare(state, previous) < 0) unique.set(key, state);
  }
  return [...unique.values()].sort(compare).slice(0, beamWidth);
}

export function assignGuitarPositions(columns: Note[][]) {
  let states: State[] = [{ strings: openPitches.map(() => null), used: 0, hand: 2, count: 0, cost: 0, difficult: false }];
  for (const [column, notes] of columns.entries()) {
    if (!notes.length) continue;
    for (const [noteIndex, note] of notes.entries()) {
      const options: State[] = [];
      const candidates = openPitches.flatMap((pitch, string) => {
        const fret = note.pitch - pitch;
        return fret >= 0 && fret <= maxFret ? [{ string, fret }] : [];
      });
      for (const state of states) {
        const strings = state.strings.map((active) =>
          active && active.end > note.start + timeTolerance ? active : null);
        options.push({ ...state, strings });
        const before = grip(strings);
        for (const position of candidates) {
          const { string, fret } = position;
          const bit = 1 << string;
          if (strings[string] || (state.used & bit)) continue;
          const nextStrings = [...strings];
          nextStrings[string] = { fret, end: note.start + note.duration };
          const after = grip(nextStrings);
          const fretCost = fret * 0.45 + Math.max(0, fret - 12) * 0.9;
          options.push({
            strings: nextStrings,
            used: state.used | bit,
            hand: state.hand,
            count: state.count + 1,
            cost: state.cost + fretCost + Math.max(0, after.cost - before.cost),
            difficult: state.difficult || after.difficult,
            last: { column, note: noteIndex, position, previous: state.last },
          });
        }
      }
      states = keepBest(options);
    }
    states = keepBest(states.map((state) => {
      const newlyFretted = state.strings.some((note, string) => note && note.fret > 0 && (state.used & (1 << string)));
      const hand = newlyFretted ? grip(state.strings).center ?? state.hand : state.hand;
      return { ...state, used: 0, hand, cost: state.cost + Math.abs(hand - state.hand) * 0.45 };
    }));
  }

  const best = states[0];
  const positions = columns.map((notes) => Array<Position | null>(notes.length).fill(null));
  for (let step = best.last; step; step = step.previous) {
    positions[step.column][step.note] = step.position;
  }
  return { positions, difficult: best.difficult };
}
