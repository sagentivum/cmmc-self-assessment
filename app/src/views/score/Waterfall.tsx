import type { WaterfallStep } from '../../scoring/engine';

interface Props {
  steps: readonly WaterfallStep[];
  maxScore: number;
  minScore: number;
}

/**
 * Hand-rolled SVG waterfall. A chart library would be more bytes and, since it
 * would likely want a CDN, more privacy risk.
 *
 * The fiddly bit is the y-domain: it must span 110 AND the current score, which
 * can be negative, with an explicit zero baseline drawn so crossing zero reads
 * correctly rather than looking like the axis moved.
 */
export function Waterfall({ steps, maxScore, minScore }: Props): React.ReactElement {
  const W = 900;
  const H = 340;
  const PAD_L = 46;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 64;

  const finalScore = steps.at(-1)?.runningScore ?? maxScore;

  // Domain always includes 0 and the ceiling; extends down to the current score
  // (with headroom) but never past the theoretical floor.
  const lo = Math.max(minScore, Math.min(0, finalScore) - 10);
  const hi = maxScore + 5;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number): number => PAD_T + ((hi - v) / (hi - lo)) * plotH;

  const bars = steps.slice(1);
  const bandW = plotW / Math.max(bars.length, 1);
  const barW = Math.min(bandW * 0.68, 46);

  const ticks: number[] = [];
  for (let v = Math.ceil(lo / 25) * 25; v <= hi; v += 25) ticks.push(v);
  if (!ticks.includes(0) && lo < 0) ticks.push(0);
  if (!ticks.includes(maxScore)) ticks.push(maxScore);
  ticks.sort((a, b) => a - b);

  return (
    <svg
      className="waterfall"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Waterfall from a starting score of ${maxScore} down to ${finalScore}, one bar per family.`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? 'var(--fg-muted)' : 'var(--border)'}
            strokeWidth={t === 0 ? 1.5 : 1}
            strokeDasharray={t === 0 ? undefined : '2 3'}
          />
          <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" fontSize={11}>
            {t}
          </text>
        </g>
      ))}

      {/* Ceiling reference — the score can never go above it. */}
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={y(maxScore)}
        y2={y(maxScore)}
        stroke="var(--ok)"
        strokeWidth={1.5}
      />

      {bars.map((step, i) => {
        const x = PAD_L + i * bandW + (bandW - barW) / 2;
        const top = step.runningScore + step.deduction;
        const yTop = y(top);
        const yBottom = y(step.runningScore);
        const h = Math.max(yBottom - yTop, step.deduction === 0 ? 1.5 : 2);
        return (
          <g key={step.key}>
            <rect
              x={x}
              y={yTop}
              width={barW}
              height={h}
              rx={2}
              fill={step.deduction === 0 ? 'var(--border-strong)' : 'var(--bad)'}
              opacity={step.deduction === 0 ? 0.5 : 0.85}
            >
              <title>{`${step.label}: −${step.deduction} → ${step.runningScore}`}</title>
            </rect>
            {step.deduction > 0 && (
              <text
                x={x + barW / 2}
                y={yTop - 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--fg-muted)"
              >
                −{step.deduction}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={H - PAD_B + 14}
              textAnchor="middle"
              fontSize={10}
              transform={
                bars.length > 8
                  ? `rotate(-45 ${x + barW / 2} ${H - PAD_B + 14})`
                  : undefined
              }
            >
              {step.key === 'start' ? 'Start' : step.label.split(' — ')[0]}
            </text>
          </g>
        );
      })}

      {/* Final score line */}
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={y(finalScore)}
        y2={y(finalScore)}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
      <text x={W - PAD_R} y={y(finalScore) - 5} textAnchor="end" fontSize={11} fill="var(--accent)">
        score {finalScore}
      </text>
    </svg>
  );
}
