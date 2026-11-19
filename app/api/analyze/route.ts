import { createMockScore, validateAudio } from "../../../lib/transcription";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "요청을 읽을 수 없습니다." }, { status: 400 });
  }
  if ("sample" in body && body.sample === true) {
    return Response.json(createMockScore());
  }
  if (!("name" in body) || typeof body.name !== "string" || body.name.length > 255 ||
      !("size" in body) || typeof body.size !== "number" ||
      !("duration" in body) || typeof body.duration !== "number") {
    return Response.json({ error: "음원 정보를 확인해 주세요." }, { status: 400 });
  }
  const input = { name: body.name, size: body.size, duration: body.duration };
  const error = validateAudio(input);
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json(createMockScore(input));
}
