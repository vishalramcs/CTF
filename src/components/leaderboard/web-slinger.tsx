// Original character for this project: a masked web-slinger with a visor and a trailing scarf.
// Not any existing character (CLAUDE.md rule 11). Decorative, so hidden from screen readers.
const POSES = {
  swing: {
    line: 'M118 26 L170 0',
    scarf: 'M86 66 C60 58 42 74 16 60 M84 72 C62 70 48 88 26 80',
    torso: 'M90 84 L81 126',
    limbs:
      'M88 86 L104 56 L118 26 M88 86 L58 102 L42 86 M80 132 L60 168 L34 174 M80 132 L98 170 L84 206',
    head: { cx: 94, cy: 60 },
    web: 'M0 250 L200 214 M0 214 L120 260 M60 200 L60 260',
  },
  crouch: {
    line: 'M0 226 L200 226',
    scarf: 'M112 104 C136 94 150 112 178 96 M114 110 C134 108 150 126 172 118',
    torso: 'M104 118 L94 158',
    limbs:
      'M100 120 L68 150 L54 222 M104 120 L132 160 L140 222 M92 164 L58 190 L80 222 M92 164 L130 190 L112 222',
    head: { cx: 108, cy: 94 },
    web: 'M100 226 L100 0 M100 226 L20 260 M100 226 L180 260',
  },
};

function Figure({ pose }: { pose: keyof typeof POSES }) {
  const { torso, limbs, head } = POSES[pose];
  return (
    <>
      <path d={torso} strokeWidth="30" />
      <path d={limbs} />
      <circle cx={head.cx} cy={head.cy} r="16" fill="currentColor" stroke="none" />
    </>
  );
}

export function WebSlinger({
  pose,
  className = '',
}: {
  pose: keyof typeof POSES;
  className?: string;
}) {
  const { line, scarf, web, head } = POSES[pose];
  const figure = {
    fill: 'none',
    strokeWidth: 14,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <svg aria-hidden viewBox="0 0 200 260" className={className} fill="none">
      <path d={web} stroke="#7da7ff" strokeOpacity="0.5" strokeWidth="1.5" />
      <path d={line} stroke="#e8ecf6" strokeWidth="2.5" />
      <path d={scarf} stroke="#e2232a" strokeWidth="7" strokeLinecap="round" />
      {/* Colour-split edges match the site's glitch effect and lift the figure off the background. */}
      <g {...figure} stroke="#19f5d0" color="#19f5d0" transform="translate(-3 1)">
        <Figure pose={pose} />
      </g>
      <g {...figure} stroke="#ff2bd6" color="#ff2bd6" transform="translate(3 -1)">
        <Figure pose={pose} />
      </g>
      <g {...figure} stroke="#07090f" color="#07090f">
        <Figure pose={pose} />
      </g>
      <rect x={head.cx - 11} y={head.cy - 5} width="22" height="6" rx="3" fill="#19f5d0" />
    </svg>
  );
}
