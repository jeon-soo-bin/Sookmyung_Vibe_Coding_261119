"use client";

import {
  AudioLines, Check, ChevronRight, CircleHelp, CloudUpload, Copy, FileAudio,
  Guitar, Info, LoaderCircle, Music2, RotateCcw, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  AUDIO_EXTENSIONS, exampleScore, formatTab, validateAudio, validateAudioFile,
} from "../lib/transcription";
import type { AudioInput, Chord, Score } from "../lib/transcription";

function getDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => finish(), 8000);
    function finish(duration?: number) {
      window.clearTimeout(timeout);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (duration === undefined) reject(new Error("음원을 읽을 수 없습니다. 다른 파일을 선택해 주세요."));
      else resolve(duration);
    }
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish();
    audio.src = url;
  });
}

function TabStaff({ score, compact = false }: { score: Score; compact?: boolean }) {
  const width = 40 + score.measures.length * 140;
  return <div className={compact ? "staff preview-staff" : "staff"} tabIndex={compact ? undefined : 0}
    role="region" aria-label="가로로 스크롤할 수 있는 타브 악보">
    <svg viewBox={`0 0 ${width} 158`} style={score.mock ? undefined : { minWidth: width }} role="img" aria-label={formatTab(score)}>
      {score.tuning.map((string, index) => {
        const y = 44 + (5 - index) * 19;
        return <g key={string}>
          <text x="10" y={y + 4} className="string-label">{string}</text>
          <line x1="34" x2={width - 8} y1={y} y2={y} />
        </g>;
      })}
      {score.measures.map(({ chord, beats, chordChanges }, measure) => {
        const x = 34 + measure * 140;
        return <g key={measure}>
          {chordChanges ? chordChanges.map(({ beat, name }) =>
            <text key={beat} x={x + 14 + beat * 28} y="23" className="chord-label">{name}</text>,
          ) : <text x={x + 14} y="23" className="chord-label">{chord}</text>}
          <line x1={x} x2={x} y1="44" y2="139" />
          {beats.map((beat, position) => beat.map((fret, string) => {
            if (fret === null) return null;
            const noteX = x + 22 + position * 28;
            const y = 44 + (5 - string) * 19;
            return <g key={`${position}-${string}`}>
              <rect x={noteX - 10} y={y - 8} width="20" height="16" rx="3" />
              <text x={noteX} y={y + 4} textAnchor="middle" className="fret">{fret}</text>
            </g>;
          }))}
        </g>;
      })}
      <line x1={width - 8} x2={width - 8} y1="44" y2="139" />
    </svg>
  </div>;
}

function ChordDiagram({ chord }: { chord: Chord }) {
  const playedFrets = chord.frets.filter((fret): fret is number => fret !== null && fret > 0);
  const start = playedFrets.some((fret) => fret > 4) ? Math.min(...playedFrets) : 1;
  return <figure className="chord">
    <figcaption>{chord.name}</figcaption>
    <svg viewBox="0 0 114 114" role="img" aria-label={`${chord.name} 운지, 낮은 줄부터 ${chord.frets.map((fret) => fret ?? "뮤트").join(", ")}`}>
      {Array.from({ length: 5 }, (_, row) =>
        <line key={row} x1="22" x2="92" y1={25 + row * 17} y2={25 + row * 17} className={row === 0 && start === 1 ? "nut" : ""} />)}
      {start > 1 && <text x="3" y="38" className="diagram-marker">{start}fr</text>}
      {chord.frets.map((fret, string) => {
        const x = 22 + string * 14;
        return <g key={string}>
          <line x1={x} x2={x} y1="25" y2="93" />
          {(fret === null || fret === 0) &&
            <text x={x} y="17" textAnchor="middle" className="diagram-marker">{fret === null ? "×" : "○"}</text>}
          <text x={x} y="108" textAnchor="middle" className="diagram-string">{exampleScore.tuning[string]}</text>
        </g>;
      })}
      {chord.barre && <line className="barre" x1={22 + chord.barre.from * 14} x2={22 + chord.barre.to * 14}
        y1={33.5 + (chord.barre.fret - start) * 17} y2={33.5 + (chord.barre.fret - start) * 17} />}
      {chord.frets.map((fret, string) => {
        if (!fret) return null;
        const x = 22 + string * 14;
        const y = 33.5 + (fret - start) * 17;
        return <g key={string}><circle cx={x} cy={y} r="6" />
          <text x={x} y={y + 3} textAnchor="middle" className="finger">{chord.fingers[string] || ""}</text></g>;
      })}
    </svg>
  </figure>;
}

export default function Tabify({ demo }: { demo: boolean }) {
  const [file, setFile] = useState<AudioInput & { audio: File }>();
  const [score, setScore] = useState<Score>();
  const [phase, setPhase] = useState<"idle" | "validating" | "analyzing">("idle");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const operation = useRef(false);
  const [sampleRequest, setSampleRequest] = useState(false);

  useEffect(() => {
    if (score) heading.current?.focus();
  }, [score]);

  async function selectFile(selected?: File) {
    if (!selected || operation.current) return;
    operation.current = true;
    setError("");
    setFile(undefined);
    setPhase("validating");
    try {
      const fileError = validateAudioFile(selected, !demo);
      if (fileError) throw new Error(fileError);
      const input = { name: selected.name, size: selected.size, duration: await getDuration(selected), audio: selected };
      const durationError = validateAudio(input, !demo);
      if (durationError) throw new Error(durationError);
      setFile(input);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "파일을 확인할 수 없습니다.");
    } finally {
      operation.current = false;
      setPhase("idle");
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      if (!operation.current) setError("한 번에 음원 파일 하나를 선택해 주세요.");
      return;
    }
    void selectFile(event.dataTransfer.files[0]);
  }

  async function analyze(sample = false) {
    if (operation.current || (!sample && !file)) return;
    operation.current = true;
    setError("");
    setSampleRequest(sample);
    setPhase("analyzing");
    try {
      const live = !sample && !demo && file;
      const form = new FormData();
      if (live) form.append("file", live.audio);
      const body = live ? form : JSON.stringify(sample ? { sample: true } :
        file && { name: file.name, size: file.size, duration: file.duration });
      const [response] = await Promise.all([
        fetch("/api/analyze", {
          method: "POST",
          headers: live ? undefined : { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(live ? 118_000 : 12_000),
        }),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
      if (response.status === 413) throw new Error("음원 파일은 4MB 이하여야 합니다.");
      const data = await response.json();
      if (!response.ok || typeof data?.mock !== "boolean") throw new Error(data?.error || "분석 결과를 불러올 수 없습니다.");
      setCopyStatus("");
      setScore(data);
    } catch (problem) {
      setError(problem instanceof Error && problem.name === "TimeoutError"
        ? "응답 시간이 초과되었습니다. 다시 시도해 주세요."
        : problem instanceof Error && !(problem instanceof TypeError) && !(problem instanceof SyntaxError)
          ? problem.message : "결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      operation.current = false;
      setPhase("idle");
    }
  }

  function reset() {
    setScore(undefined);
    setFile(undefined);
    setError("");
    requestAnimationFrame(() => document.getElementById("choose-file")?.focus());
  }

  async function copy() {
    if (!score) return;
    try {
      await navigator.clipboard.writeText(formatTab(score));
      setCopyStatus("복사 완료");
    } catch {
      setCopyStatus("복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  const busy = phase !== "idle";
  const analysisLabel = demo || sampleRequest ? "예시 악보 생성 중" : "기타 음원 분석 중";
  return <div className="site">
    <header className="topbar">
      <div className="top-inner">
        <a className="wordmark" href="./" aria-label="Tabify 홈"><span className="logomark"><AudioLines size={19} /></span>Tabify<span className="wordmark-dot">.</span></a>
        <button className="help" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp} aria-controls="help-panel">
          <CircleHelp size={17} /> 사용 안내
        </button>
        {showHelp && <aside id="help-panel" className="help-panel">
          <strong>음원 사용 안내</strong>
          <p>15초 이내의 단일 기타 연주 파일을 선택하세요. {demo ? "데모에서는 파일의 형식과 길이만 확인하며, 악보는 예시 데이터로 표시됩니다." : "분석을 시작하면 음원 파일이 Klangio로 전송됩니다."}</p>
        </aside>}
      </div>
    </header>

    <main className="container">
      <nav className="steps" aria-label="진행 단계">
        <span aria-current={!score ? "step" : undefined}><i />음원 입력</span>
        <ChevronRight size={15} aria-hidden="true" />
        <span aria-current={score ? "step" : undefined}><i />악보 결과</span>
      </nav>

      {!score ? <>
        <div className="hero">
          <h1>기타 음원을<br /><em>타브 악보로.</em></h1>
          <p>짧은 기타 연주를 올리고 타브 악보와 코드 운지를 한눈에 확인하세요.</p>
        </div>
        <div className="dashboard">
          <section className="panel upload">
            <div className="panel-heading"><span className="section-icon"><AudioLines size={20} /></span>
              <div><h2>음원 업로드</h2><p>기타 연주 파일을 선택해 주세요.</p></div>
            </div>
            <input ref={picker} type="file" accept={AUDIO_EXTENSIONS.map((format) => "." + format).join(",")} hidden
              onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} />
            <div className={dragging ? "droparea dragging" : "droparea"} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={drop}>
              <span className="drop-icon">{file ? <FileAudio size={23} /> : <CloudUpload size={23} />}</span>
              <strong className="file-title">{file ? file.name : "여기에 음원 파일을 끌어다 놓으세요"}</strong>
              <span className="file-meta">{file ? `${file.duration.toFixed(2)}초 · ${Math.max(1, Math.round(file.size / 1024))}KB` : `MP3, WAV, M4A · 최대 15초 · ${demo ? 10 : 4}MB 이하`}</span>
              <div className="file-actions">
                <button id="choose-file" className="button button-neutral" type="button" disabled={busy} onClick={() => picker.current?.click()}>{file ? "파일 변경" : "파일 선택"}</button>
                {file && <button className="button button-neutral icon-only" aria-label="선택한 파일 제거" disabled={busy} onClick={() => { setFile(undefined); setError(""); }}><X size={16} /></button>}
              </div>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <span className="sr-only" role="status">{phase === "validating" ? "음원 확인 중" : phase === "analyzing" ? analysisLabel : ""}</span>
            <button className="button primary analyze" onClick={() => void analyze()} disabled={!file || busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <Music2 size={18} />}
              {phase === "validating" ? "파일 확인 중" : phase === "analyzing" ? analysisLabel : "분석 시작"}
            </button>
          </section>
          <section className="panel preview">
            <div className="panel-heading"><span className="section-icon"><Guitar size={20} /></span>
              <div><h2>악보 미리보기</h2><p>6현 타브와 코드별 기타 운지</p></div>
            </div>
            <div className="preview-content">
              <TabStaff score={{ ...exampleScore, measures: exampleScore.measures.slice(0, 2) }} compact />
              <div className="preview-chords">{exampleScore.chords.slice(0, 3).map((chord) => <ChordDiagram chord={chord} key={chord.name} />)}</div>
            </div>
            <button className="button sample" onClick={() => void analyze(true)} disabled={busy}>예시 악보 열기</button>
          </section>
        </div>
        <p className="notice"><Info size={16} /><span>{demo ? "데모 모드입니다. 음원은 브라우저에 머물며 결과는 예시 악보로 표시됩니다." : "분석을 시작하면 음원이 Klangio로 전송됩니다. 코드 인식은 요청 간격 제한으로 1분 이상 걸릴 수 있습니다."}</span></p>
      </> : <>
        <div className="result-heading">
          <div><span className="result-kind">{score.mock ? "예시 악보" : "Klangio 분석 결과"}</span><h1 ref={heading} tabIndex={-1}>{score.title}</h1>
            <p>표준 튜닝 <span className="tuning">{score.tuning.join(" · ")}</span></p></div>
          <button className="button button-neutral reset" onClick={reset}><RotateCcw size={17} /> 새 음원 선택</button>
        </div>
        <section className="panel result-panel">
          <div className="panel-heading result-panel-heading"><span className="section-icon"><Music2 size={20} /></span>
            <div><h2>타브 악보</h2><p>맨 위 줄은 가장 얇은 1번 줄입니다.</p></div>
            <button className="button button-neutral copy" onClick={() => void copy()}>
              {copyStatus === "복사 완료" ? <Check size={16} /> : <Copy size={16} />}
              {copyStatus === "복사 완료" ? copyStatus : "타브 복사"}
            </button>
          </div>
          <div role="status" className={copyStatus && copyStatus !== "복사 완료" ? "error" : "sr-only"}>{copyStatus}</div>
          <TabStaff score={score} />
        </section>
        <section className="panel result-panel">
          <div className="panel-heading"><span className="section-icon"><Guitar size={20} /></span>
            <div><h2>코드 운지</h2><p>{score.mock ? "○ 개방현 · × 뮤트현 · 숫자 손가락 번호" : score.chords.length ? "Tabify 참고 운지 · ○ 개방현 · × 뮤트현 · 숫자 손가락 번호" : "표시할 코드 운지 정보가 없습니다."}</p></div>
          </div>
          <div className="result-chords">{score.chords.map((chord) => <ChordDiagram chord={chord} key={chord.name} />)}</div>
        </section>
        {score.notices?.map((notice) => <p className="notice" key={notice}><Info size={16} /><span>{notice}</span></p>)}
        <p className="notice"><Info size={16} /><span>{score.mock ? "이 악보는 화면 확인용 예시입니다. " : ""}실제 자동 채보에는 음표나 운지 오류가 있을 수 있습니다.</span></p>
      </>}
    </main>
    <footer className="footer"><div><span>Tabify<span className="wordmark-dot">.</span></span><span>기타 타브 및 코드 운지</span></div></footer>
  </div>;
}
