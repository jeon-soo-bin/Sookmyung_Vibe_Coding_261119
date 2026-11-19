import { parseBuffer } from "music-metadata";
import { AnalysisError, analyzeGuitar, getKlangioKey } from "../../../lib/klangio";
import { isCapo } from "../../../lib/capo";
import { createDemoScore } from "../../../lib/guitar-score";
import { MAX_UPLOAD_BYTES, validateAudio, validateAudioFile } from "../../../lib/transcription";

export const runtime = "nodejs";
export const maxDuration = 120;
const invalidCapo = "카포는 0부터 12까지의 정수로 선택해 주세요.";

function failure(error: string, status: number, retryAfter?: string) {
  return Response.json({ error }, { status, headers: retryAfter ? { "Retry-After": retryAfter } : undefined });
}

export async function POST(request: Request) {
  const key = getKlangioKey();
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    if (!key) return failure("현재 데모 모드입니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.", 409);
    if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 32_768) {
      return failure("음원 파일은 4MB 이하여야 합니다.", 413);
    }
    const form = await request.formData().catch(() => null);
    const [file, extra] = form?.getAll("file") ?? [];
    if (!(file instanceof File) || extra !== undefined || file.name.length > 255) {
      return failure("음원 파일 하나를 선택해 주세요.", 400);
    }
    const capoFields = form?.getAll("capo") ?? [];
    const rawCapo = capoFields[0];
    const capo = rawCapo === undefined ? 0 : typeof rawCapo === "string" && /^\d{1,2}$/.test(rawCapo) ? Number(rawCapo) : NaN;
    if (capoFields.length > 1 || !isCapo(capo)) return failure(invalidCapo, 400);

    const fileError = validateAudioFile(file, true);
    if (fileError) return failure(fileError, file.size > MAX_UPLOAD_BYTES ? 413 : 400);

    const metadata = await parseBuffer(new Uint8Array(await file.arrayBuffer()), undefined, {
      duration: true,
      skipCovers: true,
    }).catch(() => null);
    const duration = metadata?.format.duration;
    if (duration === undefined || !metadata?.format.numberOfChannels) {
      return failure("음원을 읽을 수 없습니다. 지원 형식의 오디오 파일을 선택해 주세요.", 422);
    }
    const durationError = validateAudio({ name: file.name, size: file.size, duration }, true);
    if (durationError) return failure(durationError, 422);

    try {
      return Response.json(await analyzeGuitar(file, key, request.signal, capo));
    } catch (error) {
      if (error instanceof AnalysisError) return failure(error.message, error.status, error.retryAfter);
      return failure("분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
    }
  }
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "요청을 읽을 수 없습니다." }, { status: 400 });
  }
  const capo = "capo" in body ? body.capo : 0;
  if (!isCapo(capo)) return failure(invalidCapo, 400);
  if ("sample" in body && body.sample === true) {
    return Response.json(createDemoScore(undefined, capo));
  }
  if (key) return failure("실제 분석에는 음원 파일이 필요합니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.", 400);
  if (!("name" in body) || typeof body.name !== "string" || body.name.length > 255 ||
      !("size" in body) || typeof body.size !== "number" ||
      !("duration" in body) || typeof body.duration !== "number") {
    return Response.json({ error: "음원 정보를 확인해 주세요." }, { status: 400 });
  }
  const input = { name: body.name, size: body.size, duration: body.duration };
  const error = validateAudio(input);
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json(createDemoScore(input, capo));
}
