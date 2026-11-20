import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasZeichnung, NormPunkt, ZeichenWerkzeug } from '../../../shared/types.ts';

interface TelestrationCanvasProps {
  zeichnungen: CanvasZeichnung[];
  aktivesWerkzeug: ZeichenWerkzeug | null;
  aktiveFarbe: string;
  bearbeitbar: boolean;
  onZeichnungHinzufuegen: (zeichnung: Omit<CanvasZeichnung, 'id' | 'timestamp_ms' | 'status'>) => void;
}

const VB_BREITE = 1000;
const VB_HOEHE = 562.5;

function zuSvgX(normX: number): number {
  return Math.round(normX * VB_BREITE * 10) / 10;
}

function zuSvgY(normY: number): number {
  return Math.round(normY * VB_HOEHE * 10) / 10;
}

function berechneRadius(punkte: NormPunkt[]): number {
  if (punkte.length < 2) return 44;
  const dx = (punkte[1].x - punkte[0].x) * VB_BREITE;
  const dy = (punkte[1].y - punkte[0].y) * VB_HOEHE;
  return Math.max(28, Math.min(180, Math.hypot(dx, dy)));
}

export function TelestrationCanvas({
  zeichnungen,
  aktivesWerkzeug,
  aktiveFarbe,
  bearbeitbar,
  onZeichnungHinzufuegen,
}: TelestrationCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [entwurfPunkte, setEntwurfPunkte] = useState<NormPunkt[] | null>(null);
  const [textPosition, setTextPosition] = useState<NormPunkt | null>(null);
  const [textEingabe, setTextEingabe] = useState('');

  const leseNormPunkt = (e: ReactPointerEvent<SVGSVGElement>): NormPunkt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!bearbeitbar || !aktivesWerkzeug) return;
    const punkt = leseNormPunkt(e);
    if (!punkt) return;

    if (aktivesWerkzeug === 'text') {
      setTextPosition(punkt);
      setTextEingabe('');
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setEntwurfPunkte([punkt]);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!entwurfPunkte || !aktivesWerkzeug || aktivesWerkzeug === 'text') return;
    const punkt = leseNormPunkt(e);
    if (!punkt) return;

    if (aktivesWerkzeug === 'pen') {
      const letzter = entwurfPunkte[entwurfPunkte.length - 1];
      const distanz = Math.hypot(punkt.x - letzter.x, punkt.y - letzter.y);
      if (distanz > 0.005) {
        setEntwurfPunkte([...entwurfPunkte, punkt]);
      }
    } else {
      setEntwurfPunkte([entwurfPunkte[0], punkt]);
    }
  };

  const handlePointerUp = () => {
    if (!entwurfPunkte || !aktivesWerkzeug || aktivesWerkzeug === 'text') return;

    const hatBewegung =
      entwurfPunkte.length >= 2 &&
      Math.hypot(
        entwurfPunkte[entwurfPunkte.length - 1].x - entwurfPunkte[0].x,
        entwurfPunkte[entwurfPunkte.length - 1].y - entwurfPunkte[0].y
      ) > 0.01;

    if (hatBewegung || aktivesWerkzeug === 'spotlight') {
      onZeichnungHinzufuegen({
        werkzeug: aktivesWerkzeug,
        farbe: aktiveFarbe,
        punkte:
          entwurfPunkte.length === 1
            ? [entwurfPunkte[0], { x: Math.min(1, entwurfPunkte[0].x + 0.05), y: entwurfPunkte[0].y }]
            : entwurfPunkte,
      });
    }
    setEntwurfPunkte(null);
  };

  const handleTextBestaetigen = () => {
    if (textPosition && textEingabe.trim()) {
      onZeichnungHinzufuegen({
        werkzeug: 'text',
        farbe: aktiveFarbe,
        punkte: [textPosition],
        text: textEingabe.trim(),
      });
    }
    setTextPosition(null);
    setTextEingabe('');
  };

  const alleAnzuzeigenden: Array<
    Pick<CanvasZeichnung, 'werkzeug' | 'farbe' | 'punkte' | 'text'> & { id: string }
  > = [
    ...zeichnungen,
    ...(entwurfPunkte && aktivesWerkzeug && aktivesWerkzeug !== 'text'
      ? [
          {
            id: 'preview-stroke',
            werkzeug: aktivesWerkzeug,
            farbe: aktiveFarbe,
            punkte: entwurfPunkte,
          },
        ]
      : []),
  ];

  const spotlights = alleAnzuzeigenden.filter((z) => z.werkzeug === 'spotlight' && z.punkte.length >= 1);

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_BREITE} ${VB_HOEHE}`}
        preserveAspectRatio="none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`h-full w-full touch-none ${
          bearbeitbar && aktivesWerkzeug ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
        }`}
      >
        <defs>
          {/* Dynamische Pfeilspitzen je Farbe */}
          {Array.from(new Set(alleAnzuzeigenden.map((z) => z.farbe))).map((farbe) => {
            const markerId = `arrow-${farbe.replace('#', '')}`;
            return (
              <marker
                key={markerId}
                id={markerId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill={farbe} />
              </marker>
            );
          })}

          {spotlights.length > 0 && (
            <mask id="sideline-spotlight-mask">
              <rect x="0" y="0" width={VB_BREITE} height={VB_HOEHE} fill="white" />
              {spotlights.map((spot) => (
                <circle
                  key={`mask-${spot.id}`}
                  cx={zuSvgX(spot.punkte[0].x)}
                  cy={zuSvgY(spot.punkte[0].y)}
                  r={berechneRadius(spot.punkte)}
                  fill="black"
                />
              ))}
            </mask>
          )}
        </defs>

        {/* Abdunklung des Hintergrunds bei aktivem Spieler-Spotlight */}
        {spotlights.length > 0 && (
          <rect
            x="0"
            y="0"
            width={VB_BREITE}
            height={VB_HOEHE}
            fill="rgba(0, 0, 0, 0.56)"
            mask="url(#sideline-spotlight-mask)"
          />
        )}

        {alleAnzuzeigenden.map((z) => {
          if (z.werkzeug === 'spotlight' && z.punkte.length >= 1) {
            return (
              <circle
                key={z.id}
                cx={zuSvgX(z.punkte[0].x)}
                cy={zuSvgY(z.punkte[0].y)}
                r={berechneRadius(z.punkte)}
                fill="none"
                stroke={z.farbe}
                strokeWidth="3.5"
                strokeDasharray="8 4"
              />
            );
          }

          if (z.werkzeug === 'pen' && z.punkte.length >= 2) {
            const pointsAttr = z.punkte.map((p) => `${zuSvgX(p.x)},${zuSvgY(p.y)}`).join(' ');
            return (
              <polyline
                key={z.id}
                points={pointsAttr}
                fill="none"
                stroke={z.farbe}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }

          if (z.werkzeug === 'arrow' && z.punkte.length >= 2) {
            const start = z.punkte[0];
            const ende = z.punkte[z.punkte.length - 1];
            const markerId = `arrow-${z.farbe.replace('#', '')}`;
            return (
              <line
                key={z.id}
                x1={zuSvgX(start.x)}
                y1={zuSvgY(start.y)}
                x2={zuSvgX(ende.x)}
                y2={zuSvgY(ende.y)}
                stroke={z.farbe}
                strokeWidth="4.5"
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
              />
            );
          }

          if (z.werkzeug === 'text' && z.punkte.length >= 1 && z.text) {
            const x = zuSvgX(z.punkte[0].x);
            const y = zuSvgY(z.punkte[0].y);
            const breite = Math.max(84, z.text.length * 10.5 + 22);
            return (
              <g key={z.id} transform={`translate(${x}, ${y})`}>
                <rect
                  x="-6"
                  y="-22"
                  width={breite}
                  height="30"
                  rx="4"
                  fill="rgba(11, 14, 17, 0.88)"
                  stroke={z.farbe}
                  strokeWidth="1.5"
                />
                <text
                  x="6"
                  y="-2"
                  fill="#FFFFFF"
                  fontSize="16"
                  fontWeight="600"
                  fontFamily="DM Sans, sans-serif"
                >
                  {z.text}
                </text>
              </g>
            );
          }

          return null;
        })}
      </svg>

      {/* Inline-Texteingabe auf dem Canvas (ohne window.prompt) */}
      {textPosition && bearbeitbar && (
        <div
          style={{
            left: `${Math.min(72, Math.max(4, textPosition.x * 100))}%`,
            top: `${Math.min(82, Math.max(6, textPosition.y * 100))}%`,
          }}
          className="pointer-events-auto absolute z-20 flex items-center gap-1.5 rounded-md border border-[#F59E0B] bg-[#0B0E11]/95 p-1.5 shadow-lg"
        >
          <input
            type="text"
            autoFocus
            value={textEingabe}
            onChange={(e) => setTextEingabe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextBestaetigen();
              if (e.key === 'Escape') setTextPosition(null);
            }}
            placeholder="Text-Marker..."
            className="w-40 bg-transparent px-1.5 py-0.5 text-xs text-white placeholder-[#6E7681] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleTextBestaetigen}
            className="rounded bg-[#F59E0B] px-2 py-0.5 text-[11px] font-semibold text-[#0B0E11]"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
