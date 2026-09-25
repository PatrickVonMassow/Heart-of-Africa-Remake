import { ROCK_RELIEF_SVG } from '../world/rockRelief'

/** The carried negative, with the same notch and outline as the stone face. */
export function ClayImpression() {
  return <svg className="clay-impression" aria-hidden="true" viewBox="-0.8 -0.8 1.6 1.6" width="56" height="56">
    <path d="M-.72-.66 Q0-.83 .7-.62 L.76.55 Q0 .8 -.7.6Z" fill="#c58f63" stroke="#704b32" strokeWidth=".06" />
    <polygon points={ROCK_RELIEF_SVG} fill="#593c2b" stroke="#e1b68a" strokeWidth=".07" />
  </svg>
}
