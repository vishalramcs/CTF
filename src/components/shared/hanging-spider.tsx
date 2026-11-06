// The organiser's hanging-spider artwork (red strand, eight-legged body, slow sway), ported from the
// supplied HTML to a component: static SVG and CSS only, no script and no iframe. Original art.
export function HangingSpider() {
  return (
    <div aria-hidden className="hanging-spider-stage">
      <div className="hanging-spider">
        <span className="hanging-spider__line" />
        <svg
          className="hanging-spider__body"
          viewBox="0 0 140 150"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g
            fill="none"
            stroke="#ed101b"
            strokeWidth="7"
            strokeLinecap="square"
            strokeLinejoin="miter"
          >
            <path d="M62 61 L43 45 L31 17" />
            <path d="M57 69 L34 65 L19 43" />
            <path d="M78 61 L97 45 L109 17" />
            <path d="M83 69 L106 65 L121 43" />
            <path d="M57 79 L34 91 L20 119" />
            <path d="M62 86 L47 112 L45 143" />
            <path d="M83 79 L106 91 L120 119" />
            <path d="M78 86 L93 112 L95 143" />
          </g>
          <path
            fill="#ed101b"
            d="M70 51C59 51 54 60 55 70C56 80 62 91 70 103C78 91 84 80 85 70C86 60 81 51 70 51Z"
          />
          <path
            fill="#ed101b"
            d="M70 35C61 35 55 41 55 49C55 56 61 61 70 61C79 61 85 56 85 49C85 41 79 35 70 35Z"
          />
        </svg>
      </div>
    </div>
  );
}
