// Hand-sketch illustrations for journal entries (design.md §19): small ink
// drawings (an animal, a landmark, a face) rendered as inline SVG next to
// the text. Deliberately rough strokes to read as pencil/ink sketches.

export type SketchId =
  | 'palm'
  | 'acacia'
  | 'bird'
  | 'mountain'
  | 'antelope'
  | 'hut'
  | 'harbor'
  | 'compass'
  | 'face'
  | 'grave'

const INK = '#4a3826'

function Frame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg
      className="sketch"
      viewBox="0 0 64 64"
      width="64"
      height="64"
      role="img"
      aria-label={title}
      fill="none"
      stroke={INK}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const SKETCHES: Record<SketchId, React.ReactElement> = {
  palm: (
    <Frame title="Skizze: Palme">
      <path d="M30 56 C31 42 32 30 34 22" />
      <path d="M34 22 C26 18 18 19 12 24" />
      <path d="M34 22 C30 14 24 11 16 12" />
      <path d="M34 22 C38 13 45 10 52 13" />
      <path d="M34 22 C42 18 50 20 55 26" />
      <path d="M10 56 C24 53 44 53 56 56" />
    </Frame>
  ),
  acacia: (
    <Frame title="Skizze: Akazie">
      <path d="M32 56 C32 46 31 38 30 30" />
      <path d="M30 30 C22 30 12 27 8 22 C20 16 46 16 56 23 C50 28 40 30 30 30" />
      <path d="M30 44 L20 52 M31 40 L42 50" />
      <path d="M8 57 C22 55 44 55 58 57" />
    </Frame>
  ),
  bird: (
    <Frame title="Skizze: Vogel">
      <path d="M20 34 C26 26 38 25 44 31 C50 36 49 44 42 47 C34 50 24 46 20 40" />
      <path d="M44 31 C48 27 53 26 57 28 L50 33" />
      <path d="M24 44 C20 52 18 56 14 58" />
      <path d="M28 46 C26 52 24 56 22 58" />
      <path d="M20 34 C14 32 10 28 8 22 C16 24 22 27 26 30" />
      <circle cx="47" cy="33" r="0.9" fill={INK} />
    </Frame>
  ),
  mountain: (
    <Frame title="Skizze: Berg">
      <path d="M6 52 L24 20 L34 34 L42 14 L58 52" />
      <path d="M37 24 L42 18 L47 26" />
      <path d="M24 20 L28 27 L32 24" />
      <path d="M10 52 C24 50 44 50 56 52" />
    </Frame>
  ),
  antelope: (
    <Frame title="Skizze: Antilope">
      <path d="M16 38 C18 30 30 28 38 31 L46 27" />
      <path d="M46 27 C50 22 50 16 48 12 M46 27 C52 24 55 18 55 13" />
      <path d="M18 38 L15 54 M25 36 L24 54 M35 33 L36 54 M43 30 L45 52" />
      <path d="M16 38 C13 36 12 33 13 30" />
      <circle cx="46" cy="29" r="0.8" fill={INK} />
    </Frame>
  ),
  hut: (
    <Frame title="Skizze: Hütte">
      <path d="M14 34 C13 44 14 50 16 54 L48 54 C50 48 51 42 50 34" />
      <path d="M8 36 C18 20 46 20 56 36" />
      <path d="M28 54 C28 46 36 46 36 54" />
      <path d="M32 21 L32 14 M30 15 C33 12 35 15 32 14" />
      <path d="M10 57 C24 55 42 55 54 57" />
    </Frame>
  ),
  harbor: (
    <Frame title="Skizze: Hafen">
      <path d="M30 12 L30 40" />
      <path d="M30 16 C38 15 46 18 50 24 C42 24 34 22 30 20" />
      <path d="M14 40 C20 36 42 36 50 40 L46 50 L18 50 Z" />
      <path d="M6 54 C16 50 26 56 34 53 C44 49 52 56 60 53" />
    </Frame>
  ),
  compass: (
    <Frame title="Skizze: Kompass">
      <circle cx="32" cy="32" r="20" />
      <circle cx="32" cy="32" r="23" strokeDasharray="2 5" />
      <path d="M32 16 L37 32 L32 48 L27 32 Z" />
      <circle cx="32" cy="32" r="2" fill={INK} />
      <path d="M32 8 L32 11 M32 53 L32 56 M8 32 L11 32 M53 32 L56 32" />
    </Frame>
  ),
  face: (
    <Frame title="Skizze: Gesicht">
      <path d="M22 26 C20 42 24 52 32 53 C40 52 44 42 42 26 C38 20 26 20 22 26" />
      <path d="M26 32 C28 31 30 31 31 32 M37 32 C38 31 40 31 41 32" />
      <circle cx="28.5" cy="34" r="0.8" fill={INK} />
      <circle cx="38.5" cy="34" r="0.8" fill={INK} />
      <path d="M32 36 C32 40 31 42 30 43 M28 47 C30 49 36 49 38 47" />
      <path d="M20 24 C24 12 42 12 44 24 M44 28 C46 30 46 34 44 36" />
    </Frame>
  ),
  grave: (
    <Frame title="Skizze: Grab">
      <path d="M32 14 L32 44 M22 24 L42 24" />
      <path d="M18 48 C24 42 40 42 46 48 C40 52 24 52 18 48" />
      <path d="M12 54 C24 51 40 51 52 54" />
      <path d="M48 18 C50 14 54 12 57 13" />
    </Frame>
  ),
}

export function Sketch({ id }: { id: SketchId }) {
  return SKETCHES[id]
}
