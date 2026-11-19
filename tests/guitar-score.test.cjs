const assert = require("node:assert/strict");
const { registerHooks } = require("node:module");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");
const { Midi } = require("@tonejs/midi");

// Node strips the types. Resolve the extensionless imports used by Next.js in lib.
const sourceRoot = pathToFileURL(resolve(__dirname, "../lib") + "/").href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeSource = context.parentURL?.startsWith(sourceRoot) && /^\.\/[^.]+$/.test(specifier);
    const result = nextResolve(relativeSource ? specifier + ".ts" : specifier, context);
    return result.url.startsWith(sourceRoot) && result.url.endsWith(".ts")
      ? { ...result, format: "module-typescript" }
      : result;
  },
});
const { createDemoScore, createGuitarScore } = require("../lib/guitar-score.ts");
const { isCapo } = require("../lib/capo.ts");
const { formatTab } = require("../lib/transcription.ts");
const { layoutTab } = require("../lib/tab-layout.ts");
hooks.deregister();

const openPitches = [40, 45, 50, 55, 59, 64];
const note = (pitch, start = 0, duration = 0.15) => ({ pitch, start, duration });

function analyze(input, chords = [], capo = 0) {
  const score = createGuitarScore("test.wav", input, chords, capo);
  const assigned = score.measures.flatMap((measure) => measure.timing.flatMap((column, index) =>
    column.notes.map(({ pitch, start, duration, string }) => {
      const fret = string === null ? null : measure.beats[index][string];
      if (string !== null) {
        assert.ok(Number.isInteger(fret) && fret >= 0 && capo + fret <= 24);
        assert.equal(openPitches[string] + capo + fret, pitch);
      }
      return { pitch, start, duration, string, fret };
    }),
  ));
  assert.deepEqual(assigned.map(({ pitch, start, duration }) => ({ pitch, start, duration })), input);
  return { score, assigned };
}

const tab = (assigned) => assigned.map(({ string, fret }) => string === null ? null : `${6 - string}/${fret}`);

test("takes the required high frets when the pitch has no lower alternative", () => {
  assert.deepEqual(tab(analyze([note(81), note(86, 0.3)]).assigned), ["1/17", "1/22"]);
});

test("leaves the high position when later single notes have lower equivalent frets", () => {
  assert.deepEqual(tab(analyze([note(84), note(76, 0.3), note(74, 0.6)]).assigned), ["1/20", "1/12", "1/10"]);
});

test("fits the simultaneous group into five distinct strings and four frets of span", () => {
  const { score, assigned } = analyze([50, 55, 70, 71, 75].map((pitch) => note(pitch)));
  assert.equal(new Set(assigned.map(({ string }) => string)).size, 5);
  assert.ok(assigned.every(({ string }) => string !== null));
  const pressed = assigned.map(({ fret }) => fret).filter((fret) => fret > 0);
  assert.equal(Math.max(...pressed) - Math.min(...pressed), 4);
  assert.equal(score.measures[0].beats.length, 1);
  assert.ok(!score.notices.some((message) => message.includes("연주하기 어려울")));
});

test("moves the earlier sustained MIDI 64 to reserve the only string for MIDI 85", () => {
  const { assigned } = analyze([note(64, 0, 0.8), note(85, 0.3)]);
  assert.deepEqual(tab(assigned), ["5/19", "1/21"]);
});

test("preserves the six open strings, quick repeated notes, and onset grouping", () => {
  assert.deepEqual(tab(analyze(openPitches.map((pitch) => note(pitch))).assigned),
    ["6/0", "5/0", "4/0", "3/0", "2/0", "1/0"]);
  const repeated = analyze([note(40, 0, 0.01), note(40, 0.02, 0.01)]);
  assert.deepEqual(tab(repeated.assigned), ["6/0", "6/0"]);
  assert.equal(repeated.score.measures[0].beats.length, 2);
  assert.equal(analyze([note(45, 0.039), note(50, 0.041)]).score.measures[0].beats.length, 1);
});

test("retains notes outside the range and warns about an unavoidable wide grip", () => {
  const outside = analyze([note(39), note(89, 0.3)]);
  assert.deepEqual(tab(outside.assigned), [null, null]);
  assert.match(formatTab(outside.score), /MIDI 39 · 줄 배치 불가/);
  assert.match(outside.score.notices.join(" "), /음표 2개/);
  const crowded = analyze([note(40), note(40), ...openPitches.slice(1).map((pitch) => note(pitch))]);
  assert.equal(crowded.assigned.filter(({ string }) => string === null).length, 1);
  const stretch = analyze([note(41), note(88)]);
  assert.ok(stretch.assigned.every(({ string }) => string !== null));
  assert.match(stretch.score.notices.join(" "), /연주하기 어려울/);
});

test("converts the 58-note test MIDI without changing note timing or chord layouts", () => {
  const midi = new Midi();
  const track = midi.addTrack();
  for (const pitch of [50, 55, 70, 71, 75]) track.addNote({ midi: pitch, time: 0, duration: 0.15 });
  for (let i = 1; i < 54; i++) {
    track.addNote({ midi: openPitches[i % 6], time: i * 0.2, duration: 0.12 });
  }
  const input = new Midi(midi.toArray()).tracks.flatMap(({ notes }) =>
    notes.map(({ midi, time, duration }) => note(midi, time, duration)),
  );
  const { score, assigned } = analyze(input, [
    { start: 0, end: 0.2, name: "G" }, { start: 0.2, end: 2, name: "Em" },
    { start: 2, end: 3, name: "C" }, { start: 3, end: 4, name: "F#m" },
    { start: 4, end: 12, name: "D" },
  ]);
  assert.equal(assigned.filter(({ string }) => string !== null).length, 58);
  for (const [width, expectedRows] of [[1039, 2], [311, 8]]) {
    const rows = layoutTab(score, width);
    assert.equal(rows.length, expectedRows);
    assert.deepEqual(rows.flatMap(({ events }) => events).flatMap(({ change }) =>
      change ? [[change.name, change.voicing?.name]] : [],
    ), [["G", "G"], ["Em", "Em"], ["C", "C"], ["F#m", undefined], ["D", "D"]]);
  }
});

test("accepts only integer capo settings from 0 to 12 and keeps the zero-capo demo", () => {
  assert.ok([0, 1, 5, 12].every(isCapo));
  assert.ok([-1, 13, 2.5, "5", null].every((value) => !isCapo(value)));
  assert.deepEqual(createDemoScore(undefined, 0), createDemoScore());
});

test("capo 5 reports relative frets and reassigns notes below the capo on their old string", () => {
  const input = [note(45), note(47, 0.3), note(57, 0.6)];
  assert.equal(tab(analyze(input).assigned).at(-1), "3/2");
  assert.deepEqual(tab(analyze(input, [], 5).assigned), ["6/0", "6/2", "4/2"]);
});

test("capo 5 displays a G shape that sounds as C and omits unsupported diagrams", () => {
  const { score } = analyze([note(60), note(64, 0.3)], [
    { start: 0, end: 0.3, name: "C" }, { start: 0.3, end: 0.6, name: "D" },
  ], 5);
  const changes = layoutTab(score, 280).flatMap(({ events }) => events.flatMap(({ change }) => change ? [change] : []));
  assert.deepEqual(changes.map(({ name, voicing }) => [name, voicing?.name]), [["C", "G"], ["D", undefined]]);
  const pitches = changes[0].voicing.frets.flatMap((fret, string) => fret === null ? [] : [(openPitches[string] + 5 + fret) % 12]);
  assert.deepEqual([...new Set(pitches)].sort((a, b) => a - b), [0, 4, 7]);
  assert.equal(createDemoScore(undefined, 5).capo, 5);
});

test("preserves capo-5 simultaneous pitches and retains notes below the available range", () => {
  const { score, assigned } = analyze([note(44), ...[45, 50, 55, 60, 64, 69].map((pitch) => note(pitch))], [], 5);
  assert.deepEqual(tab(assigned), [null, "6/0", "5/0", "4/0", "3/0", "2/0", "1/0"]);
  assert.match(score.notices.join(" "), /카포 5프렛.*음표 1개/);
});

test("prefers lower relative frets while preserving required high notes at capo 5", () => {
  assert.deepEqual(tab(analyze([note(84), note(76, 0.3), note(74, 0.6)], [], 5).assigned),
    ["1/15", "1/7", "1/5"]);
  assert.deepEqual(tab(analyze([note(88)], [], 12).assigned), ["1/12"]);
});
