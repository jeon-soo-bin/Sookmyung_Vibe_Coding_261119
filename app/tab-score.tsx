"use client";

import { useEffect, useRef, useState } from "react";
import { layoutTab, MIN_TAB_WIDTH } from "../lib/tab-layout";
import { formatTab, STANDARD_TUNING } from "../lib/transcription";
import type { Chord, Score } from "../lib/transcription";

function ChordGrid({ chord }: { chord: Chord }) {
  const pressed = chord.frets.filter((fret): fret is number => fret !== null && fret > 0);
  const start = pressed.some((fret) => fret > 4) ? Math.min(...pressed) : 1;
  const rows = Math.max(4, ...pressed.map((fret) => fret - start + 1));
  const step = 68 / rows;
  const yFor = (fret: number) => 25 + (fret - start + 0.5) * step;
  return <>
    {Array.from({ length: rows + 1 }, (_, row) =>
      <line key={row} x1="22" x2="92" y1={25 + row * step} y2={25 + row * step}
        className={row === 0 && start === 1 ? "nut" : undefined} />)}
    {start > 1 && <text x="3" y="38" className="diagram-marker">{start}fr</text>}
    {chord.frets.map((fret, string) => {
      const x = 22 + string * 14;
      return <g key={string}>
        <line x1={x} x2={x} y1="25" y2="93" />
        {(fret === null || fret === 0) &&
          <text x={x} y="17" textAnchor="middle" className="diagram-marker">{fret === null ? "X" : "O"}</text>}
        <text x={x} y="108" textAnchor="middle">{STANDARD_TUNING[string]}</text>
      </g>;
    })}
    {chord.barre && <line className="barre" x1={22 + chord.barre.from * 14} x2={22 + chord.barre.to * 14}
      y1={yFor(chord.barre.fret)} y2={yFor(chord.barre.fret)} />}
    {chord.frets.map((fret, string) => {
      if (!fret) return null;
      const x = 22 + string * 14;
      const y = yFor(fret);
      return <g key={string}>
        <circle cx={x} cy={y} r={Math.min(6, step * 0.42)} />
        <text x={x} y={y + 3} textAnchor="middle" className="finger">{chord.fingers[string] || ""}</text>
      </g>;
    })}
  </>;
}

function chordDescription(chord: Chord) {
  return `${chord.name} 운지, 낮은 줄부터 ${chord.frets.map((fret) => fret ?? "뮤트").join(", ")}`;
}

export function ChordDiagram({ chord }: { chord: Chord }) {
  return <figure className="chord">
    <figcaption>{chord.name}</figcaption>
    <svg viewBox="0 0 114 114" role="img" aria-label={chordDescription(chord)}><ChordGrid chord={chord} /></svg>
  </figure>;
}

export function TabScore({ score, compact = false }: { score: Score; compact?: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(MIN_TAB_WIDTH);
  useEffect(() => {
    const element = area.current;
    if (!element || compact) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact]);

  const width = compact ? 430 : Math.max(MIN_TAB_WIDTH, available);
  const rows = layoutTab(score, width);
  return <div className={compact ? "tab-preview" : "tab-book"} ref={area}
    role={compact ? undefined : "region"} aria-label={compact ? undefined : "여러 줄 타브 악보"}
    tabIndex={compact ? undefined : 0}>
    {!compact && <pre className="sr-only">{formatTab(score, false)}</pre>}
    {rows.map(({ events }, row) => {
      const hasVoicing = events.some(({ change }) => change?.voicing);
      const hasShapeLabel = !!score.capo && hasVoicing && !compact;
      const top = compact ? 28 : hasVoicing ? (hasShapeLabel ? 116 : 101) : events.some(({ change }) => change) ? 39 : 23;
      const gutter = compact ? 14 : 17;
      const bottom = top + 5 * gutter;
      const height = bottom + (events.some(({ missing }) => missing) ? 28 : 16);
      return <svg key={row} className="tab-system" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
        aria-label={compact ? "예시 타브 악보" : `타브 ${row + 1}번째 줄`}>
        {[...score.tuning].reverse().map((string, index) => {
          const y = top + index * gutter;
          return <g key={string}>
            <text x="14" y={y + 4} textAnchor="middle" className="string-label">{string}</text>
            <line x1="28" x2={width - 12} y1={y} y2={y} />
          </g>;
        })}
        {events.map(({ x, change, frets, missing }, column) => <g key={column}>
          {change && <>
            <text x={x} y="17" textAnchor="middle" className="chord-label">{change.name}</text>
            {!compact && change.voicing && <>
              {hasShapeLabel && <text x={x} y="33" textAnchor="middle" className="tab-shape">{change.voicing.name} 모양</text>}
              <svg x={x - 38} y={hasShapeLabel ? 35 : 20} width="76" height="76" viewBox="0 0 114 114"
                className="tab-voicing" role="img" aria-label={chordDescription(change.voicing)}>
                <ChordGrid chord={change.voicing} />
              </svg>
            </>}
          </>}
          {frets?.map((fret, string) => {
            if (fret === null) return null;
            const y = top + (5 - string) * gutter;
            return <g key={string}>
              <rect x={x - 10} y={y - 7} width="20" height="14" rx="2" />
              <text x={x} y={y + 4} textAnchor="middle" className="fret">{fret}</text>
            </g>;
          })}
          {!!missing && <text x={x} y={bottom + 19} textAnchor="middle" className="tab-unassigned"
            aria-label={`운지 불가 ${missing}개`}>! {missing}</text>}
        </g>)}
      </svg>;
    })}
  </div>;
}
