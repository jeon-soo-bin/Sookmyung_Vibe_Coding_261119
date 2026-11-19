export const MAX_SECONDS = 15;
export const MAX_BYTES = 10 * 1024 * 1024;
export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a"];
export const STANDARD_TUNING = ["E", "A", "D", "G", "B", "e"];

export type AudioInput = { name: string; size: number; duration: number };

export function validateAudio(input: AudioInput) {
  if (!AUDIO_EXTENSIONS.includes(input.name.split(".").pop()?.toLowerCase() ?? "")) {
    return "MP3, WAV, M4A 파일을 선택해 주세요.";
  }
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_BYTES) {
    return "파일 크기는 0B보다 크고 10MB 이하여야 합니다.";
  }
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > MAX_SECONDS) {
    return "15초 이하의 재생 가능한 음원을 선택해 주세요.";
  }
  return null;
}

export type Chord = {
  name: string;
  frets: (number | null)[];
  fingers: number[];
  barre?: { fret: number; from: number; to: number };
};

export type Score = {
  title: string;
  tuning: string[];
  mock: true;
  measures: { chord: string; beats: (number | null)[][] }[];
  chords: Chord[];
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

export function formatTab(score: Score) {
  const measureWidth = Math.max(...score.measures.map(({ beats, chord }) => Math.max(beats.length * 3, chord.length)));
  const header = score.measures.map(({ chord }) => chord.padEnd(measureWidth + 1)).join("");
  const strings = score.tuning.map((string, index) =>
    string + "|" + score.measures.map(({ beats }) => beats.map((beat) =>
      String(beat[index] ?? "-").padEnd(3, "-")).join("").padEnd(measureWidth, "-")).join("|") + "|",
  ).reverse();
  return ["  " + header.trimEnd(), ...strings].join("\n");
}
