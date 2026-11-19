import { layoutTab } from "./tab-layout";

export const MAX_SECONDS = 15;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 4_000_000;
export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a"];
export const STANDARD_TUNING = ["E", "A", "D", "G", "B", "e"];
export const STANDARD_OPEN_PITCHES = [40, 45, 50, 55, 59, 64];

export type AudioInput = { name: string; size: number; duration: number };

export function validateAudioFile(input: Pick<AudioInput, "name" | "size">, real = false) {
  if (!input.name.includes(".") || !AUDIO_EXTENSIONS.includes(input.name.split(".").pop()?.toLowerCase() ?? "")) {
    return "MP3, WAV, M4A 파일을 선택해 주세요.";
  }
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > (real ? MAX_UPLOAD_BYTES : MAX_BYTES)) {
    return `파일 크기는 0B보다 크고 ${real ? 4 : 10}MB 이하여야 합니다.`;
  }
  return null;
}

export function validateAudio(input: AudioInput, real = false) {
  const fileError = validateAudioFile(input, real);
  if (fileError) return fileError;
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > MAX_SECONDS) {
    return "15초 이하의 재생 가능한 음원을 선택해 주세요.";
  }
  return null;
}

export type Chord = {
  name: string;
  voicingId?: string;
  frets: (number | null)[];
  fingers: number[];
  barre?: { fret: number; from: number; to: number };
};

export type ChordInterval = { start: number; end: number; name: string; voicingId?: string };

export type Note = { pitch: number; start: number; duration: number };
export type TimedColumn = {
  start: number;
  restBefore: number;
  notes: (Note & { string: number | null })[];
};

export type Score = {
  title: string;
  tuning: string[];
  mock: boolean;
  capo?: number;
  measures: {
    chord: string;
    beats: (number | null)[][];
    chordChanges?: { beat: number; name: string }[];
    timing?: TimedColumn[];
  }[];
  chords: Chord[];
  chordIntervals?: ChordInterval[];
  notices?: string[];
};

export const exampleScore: Score = {
  title: "어쿠스틱 기타 연습",
  tuning: STANDARD_TUNING,
  mock: true,
  measures: [
    { chord: "Em", beats: [[0,2,2,0,0,0], [null,null,2,null,null,null], [null,null,null,0,null,null], [null,null,null,null,0,null]] },
    { chord: "C", beats: [[null,3,2,0,1,0], [null,null,2,null,null,null], [null,null,null,0,null,null], [null,null,null,null,1,null]] },
    { chord: "G", beats: [[3,2,0,0,0,3], [null,2,null,null,null,null], [null,null,0,null,null,null], [null,null,null,null,0,null]] },
    { chord: "D", beats: [[null,null,0,2,3,2], [null,null,null,2,null,null], [null,null,null,null,3,null], [null,null,null,null,null,2]] },
  ],
  chords: [
    { name: "Em", frets: [0,2,2,0,0,0], fingers: [0,2,3,0,0,0] },
    { name: "C", frets: [null,3,2,0,1,0], fingers: [0,3,2,0,1,0] },
    { name: "G", frets: [3,2,0,0,0,3], fingers: [2,1,0,0,0,3] },
    { name: "D", frets: [null,null,0,2,3,2], fingers: [0,0,0,1,3,2] },
  ],
};

export function createMockScore(input?: AudioInput): Score {
  return {
    ...exampleScore,
    title: input?.name.replace(/\.[^.]+$/, "").trim() || exampleScore.title,
  };
}

export function formatTab(score: Score, includeTiming = true) {
  const systems = layoutTab(score, 760).map(({ events }) => {
    const columns = events.map(({ x }) => Math.round((x - 60) / 8));
    const length = (columns.at(-1) ?? 0) + 4;
    const header = Array<string>(length).fill(" ");
    const strings = score.tuning.map(() => Array<string>(length).fill("-"));
    for (const [{ change, frets }, offset] of events.map((event, index) => [event, columns[index]] as const)) {
      if (change) header.splice(offset, change.name.length, ...change.name);
      frets?.forEach((fret, string) => {
        if (fret === null) return;
        const digits = String(fret);
        strings[string].splice(offset, digits.length, ...digits);
      });
    }
    return ["  " + header.join("").trimEnd(), ...strings.map((line, index) =>
      score.tuning[index] + " " + line.join(""),
    ).reverse()].join("\n");
  });
  if (score.capo) systems.unshift(`카포 ${score.capo}프렛 · 프렛 숫자는 카포 기준`);
  if (!includeTiming) return systems.join("\n\n");
  const timing = score.measures.flatMap(({ timing }) => timing ?? []).flatMap(({ restBefore, notes, start }) => [
    ...(restBefore >= 0.1 ? [`${start.toFixed(3)}초 전 쉼 ${restBefore.toFixed(3)}초`] : []),
    ...notes.map(({ pitch, start, duration, string }) =>
      `${start.toFixed(3)}초 · ${duration.toFixed(3)}초 지속 · MIDI ${pitch} · ${string === null ? "줄 배치 불가" : `${6 - string}번 줄`}`),
  ]);
  return [...systems, ...(timing.length ? [["음표 시간", ...timing].join("\n")] : [])].join("\n\n");
}
