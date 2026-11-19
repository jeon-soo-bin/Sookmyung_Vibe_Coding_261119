import "server-only";

import { Midi } from "@tonejs/midi";
import { setTimeout as delay } from "node:timers/promises";
import { createGuitarScore } from "./guitar-score";
import type { ChordInterval, Note } from "./guitar-score";

const origin = "https://api.klang.io";
const submissionInterval = 61_000;
const jobIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let active = false;
let canSubmitAt = 0;

export function getKlangioKey() {
  return process.env.KLANGIO_API_KEY?.trim();
}

export class AnalysisError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: string) {
    super(message);
  }
}

async function requestKlangio(path: string, key: string, signal: AbortSignal, body?: FormData) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: { "kl-api-key": key },
    body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    redirect: "error",
    cache: "no-store",
  });
  if (response.ok) return response;
  await response.body?.cancel();
  if (response.status === 401 || response.status === 403) {
    throw new AnalysisError("Klangio 인증 또는 접근 권한을 확인해 주세요.", 502);
  }
  if (response.status === 402 || response.status === 429) {
    const retryAfter = response.headers.get("retry-after") ?? "";
    throw new AnalysisError("Klangio 요청 빈도 또는 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      429, /^\d{1,8}$/.test(retryAfter) ? retryAfter : undefined);
  }
  if (response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422) {
    throw new AnalysisError("Klangio가 음원을 처리할 수 없습니다. 형식, 길이 및 용량을 확인해 주세요.", 422);
  }
  throw new AnalysisError("Klangio 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
}

async function runJob(path: string, form: FormData, key: string, signal: AbortSignal) {
  canSubmitAt = Date.now() + submissionInterval;
  const response = await requestKlangio(path, key, signal, form);
  const job: unknown = await response.json();
  if (!job || typeof job !== "object" || !("job_id" in job) ||
      typeof job.job_id !== "string" || !jobIdPattern.test(job.job_id)) {
    throw new AnalysisError("Klangio 작업 정보를 읽을 수 없습니다.", 502);
  }

  const jobPath = `/job/${job.job_id}`;
  while (!signal.aborted) {
    await delay(2500, undefined, { signal });
    const response = await requestKlangio(jobPath + "/status", key, signal);
    const { status } = await response.json();
    if (status === "COMPLETED") return jobPath;
    if (status === "TIMED_OUT") throw new AnalysisError("Klangio 분석 시간이 초과되었습니다.", 504);
    if (status === "FAILED" || status === "CANCELLED") {
      throw new AnalysisError("Klangio에서 분석을 완료하지 못했습니다. 다른 음원으로 다시 시도해 주세요.", 422);
    }
    if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") {
      throw new AnalysisError("Klangio 작업 상태를 확인할 수 없습니다.", 502);
    }
  }
  signal.throwIfAborted();
  throw new AnalysisError("분석 시간이 초과되었습니다.", 504);
}

function audioForm(file: File) {
  const form = new FormData();
  form.append("file", file);
  return form;
}

function readChords(json: unknown): ChordInterval[] {
  if (!Array.isArray(json)) throw new AnalysisError("Klangio 코드 결과 형식을 읽을 수 없습니다.", 502);
  return json.flatMap((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3) return [];
    const [start, end, label] = entry;
    if (typeof start !== "number" || typeof end !== "number" ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || typeof label !== "string") return [];
    const match = /^([A-G]#?)(?::(maj|min))?$/.exec(label);
    return match ? [{ start, end, name: match[1] + (match[2] === "min" ? "m" : "") }] : [];
  });
}

export async function analyzeGuitar(file: File, key: string, requestSignal: AbortSignal) {
  const remaining = canSubmitAt - Date.now();
  if (active || remaining > 0) {
    throw new AnalysisError("다른 분석이 진행 중이거나 요청 간격 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      429, remaining > 0 ? String(Math.ceil(remaining / 1000)) : undefined);
  }
  active = true;
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(110_000)]);
  try {
    const form = audioForm(file);
    form.append("outputs", "midi");
    const transcription = await runJob("/transcription?model=guitar", form, key, signal);
    const midi = await requestKlangio(transcription + "/midi", key, signal);
    let notes: Note[];
    try {
      notes = new Midi(await midi.arrayBuffer()).tracks.flatMap(({ notes }) =>
        notes.map(({ midi, time, duration }) => ({ pitch: midi, start: time, duration })),
      ).filter(({ pitch, start, duration }) =>
        Number.isInteger(pitch) && pitch >= 0 && pitch <= 127 &&
        Number.isFinite(start) && start >= 0 && Number.isFinite(duration) && duration > 0,
      );
    } catch {
      throw new AnalysisError("Klangio 전사 결과에서 MIDI 음표를 읽을 수 없습니다.", 502);
    }
    const tab = createGuitarScore(file.name, notes, []);
    if (!tab) throw new AnalysisError("기타 타브에 표시할 수 있는 음표를 찾지 못했습니다.", 422);

    try {
      await delay(Math.max(0, canSubmitAt - Date.now()), undefined, { signal });
      const chords = await runJob("/chord-recognition?vocabulary=major-minor", audioForm(file), key, signal);
      const result = await requestKlangio(chords + "/json", key, signal);
      return createGuitarScore(file.name, notes, readChords(await result.json())) ?? tab;
    } catch (error) {
      const reason = error instanceof AnalysisError ? error.message : "코드 분석 결과를 가져오지 못했습니다.";
      return { ...tab, notices: [`코드 정보를 표시할 수 없습니다. ${reason}`,
        ...(tab.notices ?? []).filter((message) => message !== "인식된 코드가 없습니다.")] };
    }
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    if (signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
      throw new AnalysisError("Klangio 분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    }
    throw new AnalysisError("Klangio 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
  } finally {
    active = false;
  }
}
