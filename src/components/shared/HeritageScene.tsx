/**
 * Living Heritage scene.
 *
 * The MVP spec allows a polished AR-style experience rather than production
 * spatial AR (docs/02-mvp-spec.md, E4), and says explicitly not to block the
 * demo on a real AR SDK. This renders a generated base scene with a layer
 * overlaid on it, which is the same interpretive idea and works on any device,
 * offline, with no camera permission.
 */

export type SceneKind = 'hills' | 'citadel';

const VIEW = { width: 800, height: 450 };

function HillsBase() {
  return (
    <g>
      <rect width={VIEW.width} height={VIEW.height} fill="url(#heritage-sky)" />
      <circle cx="640" cy="110" r="46" fill="#f2c98a" opacity="0.55" />
      <path d="M0 290 L150 180 L270 280 L400 150 L540 270 L660 190 L800 280 L800 450 L0 450 Z" fill="#4b4a72" />
      <path d="M0 340 L180 250 L330 340 L470 260 L620 345 L760 280 L800 320 L800 450 L0 450 Z" fill="#3b3a5c" />
      <path d="M0 400 L200 350 L420 405 L640 355 L800 395 L800 450 L0 450 Z" fill="#2a2a45" />
      <rect x="0" y="286" width={VIEW.width} height="10" fill="#ffffff" opacity="0.2" />
    </g>
  );
}

function CitadelBase() {
  return (
    <g>
      <rect width={VIEW.width} height={VIEW.height} fill="url(#heritage-sky)" />
      <circle cx="170" cy="120" r="52" fill="#f0c58b" opacity="0.5" />
      <rect x="0" y="330" width={VIEW.width} height="120" fill="#5c4536" />
      <rect x="0" y="372" width={VIEW.width} height="26" fill="#3f6b74" opacity="0.8" />
      <path d="M0 330 L800 330" stroke="#7a5c48" strokeWidth="3" />
    </g>
  );
}

function Overlay({ overlay }: { overlay: string }) {
  switch (overlay) {
    case 'TERRACES':
      return (
        <g className="rise">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <path
              key={index}
              d={`M${60 + index * 12} ${330 + index * 18} Q 400 ${306 + index * 18} ${740 - index * 10} ${332 + index * 18}`}
              fill="none"
              stroke="#c8d96f"
              strokeWidth="3"
              opacity={0.85 - index * 0.09}
            />
          ))}
          <text x="60" y="300" fill="#c8d96f" style={{ fontSize: 15, fontWeight: 600 }}>
            Terraces hold the monsoon long enough to be useful
          </text>
        </g>
      );

    case 'WEAVE':
      return (
        <g className="rise">
          <rect x="250" y="150" width="300" height="200" rx="6" fill="#1b1830" opacity="0.72" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <rect
              key={index}
              x="266"
              y={166 + index * 23}
              width="268"
              height="12"
              fill={index % 3 === 0 ? '#c1443f' : index % 3 === 1 ? '#f0e4d0' : '#2c4f7c'}
              opacity="0.92"
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
            <rect key={`w${index}`} x={266 + index * 30} y="166" width="4" height="170" fill="#0f0d1a" opacity="0.35" />
          ))}
          <text x="250" y="378" fill="#f0e4d0" style={{ fontSize: 15, fontWeight: 600 }}>
            Pattern carries family, occasion and standing
          </text>
        </g>
      );

    case 'LILY':
      return (
        <g className="rise">
          {([
            [180, 300],
            [300, 268],
            [430, 292],
            [560, 258],
            [660, 296],
          ] satisfies [number, number][]).map(([x, y], index) => (
            <g key={index} transform={`translate(${x} ${y})`}>
              <path d="M0 0 L0 46" stroke="#4f7a4a" strokeWidth="3" />
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <ellipse
                  key={angle}
                  cx="0"
                  cy="-11"
                  rx="6"
                  ry="14"
                  fill="#e8c7de"
                  opacity="0.94"
                  transform={`rotate(${angle})`}
                />
              ))}
              <circle cx="0" cy="0" r="4" fill="#f4e4b0" />
            </g>
          ))}
          <text x="150" y="382" fill="#e8c7de" style={{ fontSize: 15, fontWeight: 600 }}>
            Lilium mackliniae grows in the wild on this range and effectively nowhere else
          </text>
        </g>
      );

    case 'COMMUNITY':
      return (
        <g className="rise">
          {([
            [200, 300],
            [330, 312],
            [470, 300],
            [600, 314],
          ] satisfies [number, number][]).map(([x, y], index) => (
            <g key={index}>
              <rect x={x} y={y} width="72" height="46" fill="#2a2a45" stroke="#e8b15f" strokeWidth="2" />
              <path d={`M${x - 8} ${y} L${x + 36} ${y - 26} L${x + 80} ${y} Z`} fill="#e8b15f" opacity="0.9" />
              <rect x={x + 28} y={y + 20} width="16" height="26" fill="#e8b15f" opacity="0.6" />
            </g>
          ))}
          <path d="M180 392 Q 400 366 700 392" stroke="#e8b15f" strokeWidth="3" fill="none" strokeDasharray="10 7" />
          <text x="180" y="418" fill="#e8b15f" style={{ fontSize: 15, fontWeight: 600 }}>
            Money arriving through a local host reaches the household doing the work
          </text>
        </g>
      );

    case 'GATEWAY':
      return (
        <g className="rise">
          <rect x="300" y="140" width="200" height="192" fill="#2a1c38" opacity="0.9" />
          <path d="M292 140 L400 68 L508 140 Z" fill="#452b63" />
          <rect x="360" y="212" width="80" height="120" fill="#d8a24a" opacity="0.28" />
          <path d="M60 372 Q 400 340 740 372" stroke="#3f6b74" strokeWidth="9" fill="none" opacity="0.85" />
          <text x="300" y="404" fill="#d8a24a" style={{ fontSize: 15, fontWeight: 600 }}>
            The moat marks where ordinary ground ends
          </text>
        </g>
      );

    case 'GUARDIAN':
      return (
        <g className="rise">
          {[250, 490].map((x, index) => (
            <g key={index} transform={`translate(${x} 190)`}>
              <ellipse cx="30" cy="132" rx="46" ry="12" fill="#2a1c38" opacity="0.5" />
              <path d="M6 130 L6 64 Q 6 30 34 30 Q 62 30 62 64 L62 130 Z" fill="#d8a24a" />
              <circle cx="34" cy="38" r="22" fill="#e8b15f" />
              <path d="M16 24 L24 4 L34 22 L44 4 L52 24 Z" fill="#d8a24a" />
              <circle cx="26" cy="36" r="3" fill="#2a1c38" />
              <circle cx="42" cy="36" r="3" fill="#2a1c38" />
            </g>
          ))}
          <text x="250" y="384" fill="#e8b15f" style={{ fontSize: 15, fontWeight: 600 }}>
            Kangla Sha, where the approach becomes ceremonial
          </text>
        </g>
      );

    case 'GARRISON':
      return (
        <g className="rise">
          <rect x="180" y="220" width="440" height="112" fill="#3a3a3a" opacity="0.82" />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <rect key={index} x={206 + index * 70} y="248" width="34" height="34" fill="#8a8a8a" opacity="0.6" />
          ))}
          <path d="M180 220 L620 220" stroke="#9a9a9a" strokeWidth="4" />
          <path d="M120 340 L680 340" stroke="#9a9a9a" strokeWidth="2" strokeDasharray="14 10" />
          <text x="180" y="384" fill="#c9c9c9" style={{ fontSize: 15, fontWeight: 600 }}>
            A century of other use, part of the history of the ground
          </text>
        </g>
      );

    case 'OPEN':
      return (
        <g className="rise">
          <rect x="120" y="120" width="560" height="212" fill="none" stroke="#7fd1a8" strokeWidth="3" strokeDasharray="16 10" />
          <path d="M400 120 L400 332" stroke="#7fd1a8" strokeWidth="2" opacity="0.5" />
          <circle cx="400" cy="226" r="42" fill="none" stroke="#7fd1a8" strokeWidth="3" />
          <path d="M378 226 L394 244 L424 208" stroke="#7fd1a8" strokeWidth="5" fill="none" strokeLinecap="round" />
          <text x="120" y="384" fill="#7fd1a8" style={{ fontSize: 15, fontWeight: 600 }}>
            November 2004: returned to the people of Manipur
          </text>
        </g>
      );

    default:
      return null;
  }
}

export function HeritageScene({
  scene,
  overlay,
  label,
}: {
  scene: SceneKind;
  overlay: string;
  label: string;
}) {
  const sky: [string, string] =
    scene === 'hills' ? ['#4a4a7a', '#17162b'] : ['#6a4a3a', '#221527'];

  return (
    <svg
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      className="h-full w-full"
      role="img"
      aria-label={`Illustrative heritage scene: ${label}. Generated artwork, not a photograph.`}
    >
      <defs>
        <linearGradient id="heritage-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky[0]} />
          <stop offset="100%" stopColor={sky[1]} />
        </linearGradient>
      </defs>

      {scene === 'hills' ? <HillsBase /> : <CitadelBase />}
      <Overlay overlay={overlay} />
    </svg>
  );
}
