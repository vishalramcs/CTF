import { POSES } from '@/lib/swing/poses';
import type { Origin } from '@/lib/swing/sequences';

const LOGIN = POSES.login;
// The hand sits on the end of the web line; turning by -tilt stands the picture's web upright.
const BODY_STYLE = {
  transformOrigin: `${LOGIN.hand[0] * 100}% ${LOGIN.hand[1] * 100}%`,
  transform: `translate(${-LOGIN.hand[0] * 100}%, ${-LOGIN.hand[1] * 100}%) rotate(${-LOGIN.tilt}deg)`,
};

// Team login only: Spider-Man hangs from the top edge on his web, swaying. On a successful login the
// form hands his position to the engine (takeHangingHero) and hides him; the overlay drops him from
// exactly there. The login pose is used nowhere else.
export function HangingHero() {
  return (
    <div aria-hidden className="spidey-hang" data-spidey-hang>
      <span className="spidey-hang__web" />
      <span className="spidey-hang__hand" data-spidey-hand />
      {/* eslint-disable-next-line @next/next/no-img-element -- transformed; next/image adds nothing */}
      <img
        src={LOGIN.src}
        alt=""
        className="spidey-hang__body"
        style={BODY_STYLE}
        draggable={false}
      />
    </div>
  );
}

/** Where the hanging hero is now, and hides him: the engine takes over from this exact spot. */
export function takeHangingHero(): Origin | undefined {
  const stage = document.querySelector<HTMLElement>('[data-spidey-hang]');
  const hand = stage?.querySelector('[data-spidey-hand]')?.getBoundingClientRect();
  const body = stage?.querySelector('img');
  if (!stage || !hand || !body || getComputedStyle(stage).display === 'none') return undefined;
  stage.dataset.dropped = '';
  return { x: hand.left, y: hand.top, h: body.offsetHeight };
}
