// The villager appearance table: people × sex × age group × season × year →
// the ordered dress layers a figure wears (docs/peoples-1890.md §2, §7, §8.3).
// Pure logic; the skinned figure (render/figureDress.ts) draws what it returns.
//
// Every layer names the section of docs/peoples-1890.md it rests on, or is an
// educated GUESS with its reason (CLAUDE.md §2): the cells neither the period
// search nor the second search settled are recorded as guesses in §8.3, and
// their numeric parts (shares, years) sit in VILLAGER_DRESS, calibratable.
//
// The seasonal rules are NOT restated here: the shoulder layer the cold, the
// harmattan or the karif adds comes from systems/dress.ts (`seasonalDressFor`),
// so the low preset's primitive figure and this table can never disagree.

import { VILLAGER_DRESS } from '../config/balance'
import { cloakForCloth, seasonalDressFor, wearsByRank, type DressDrivers } from './dress'

export type Sex = 'female' | 'male'
/** child, girl / young man (unmarried, initiated), adult (married), elder. */
export type AgeGroup = 'child' | 'youth' | 'adult' | 'elder'
export const SEXES: readonly Sex[] = ['female', 'male']
export const AGE_GROUPS: readonly AgeGroup[] = ['child', 'youth', 'adult', 'elder']

/** Where a layer sits, in drawing order (inner to outer). */
export type LayerSlot = 'hip' | 'torso' | 'shoulder' | 'head' | 'ornament'
export const LAYER_SLOTS: readonly LayerSlot[] = ['hip', 'torso', 'shoulder', 'head', 'ornament']

export type LayerForm =
  | 'loinFlap' // a small flap before (and behind) from a girdle
  | 'girdleTails' // a girdle with hanging strips before and a hide flap behind
  | 'apron' // skins hung before and behind, to the knee
  | 'skirtShort' // to mid-thigh: string, bead or strip skirt
  | 'skirtKnee' // to the knee
  | 'wrapLong' // a wrapper from the chest or waist to the calf
  | 'trousers'
  | 'breastCloth' // a cloth wound round or hung over the chest
  | 'shirt' // a wide shirt or frock to the knee
  | 'robe' // a gown to the ankle
  | 'toga' // a sheet knotted or thrown over one shoulder, to the ankle
  | 'cloak' // over both shoulders, to the knee
  | 'cape' // a short skin over one shoulder or both, to the waist
  | 'hood' // a cloth drawn over the head and shoulders
  | 'turban'
  | 'veil' // the face veil below the eyes
  | 'cap'
  | 'headRing' // the Zulu married man's isicoco
  | 'topknot' // dressed hair on the crown
  | 'hairBag' // the Somali married woman's chignon bag
  | 'headband'
  | 'neckBeads'
  | 'waistBeads'
  | 'limbRings'
  | 'bodyPaint' // a colour on the skin itself (ochre, camwood, red clay)
  | 'babySling' // an infant carried on the back in the mantle

export type DressMaterial =
  | 'hide'
  | 'fur'
  | 'barkCloth'
  | 'cotton'
  | 'wool'
  | 'blanket'
  | 'raffia'
  | 'leaves'
  | 'beads'
  | 'metal'
  | 'hair'
  | 'pigment'

/** The surface pattern, evaluated in TSL on the garment (render/figureDress.ts). */
export type DressPattern = 'plain' | 'bands' | 'stripes' | 'checks' | 'mottle' | 'beadwork' | 'border'

export type DressWear =
  | 'waist'
  | 'chest' // a wrap from the chest; a cape, cloak or bead collar tied closed over the breast
  | 'bothShoulders'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'overHead'
  | 'aroundHead'
  | 'face'
  | 'crown'
  | 'neck'
  | 'limbs'
  | 'skin'

/** Where a layer comes from: a section of docs/peoples-1890.md, or a guess. */
export type DressSource = { section: string } | { guess: string }

export interface DressLayer {
  slot: LayerSlot
  form: LayerForm
  material: DressMaterial
  /** Hex colour, or 'cloth' for the figure's own village cloth. */
  colour: string
  /** Second colour of a pattern (null for plain). */
  colour2: string | null
  pattern: DressPattern
  wear: DressWear
  source: DressSource
}

// ---- colours ---------------------------------------------------------------

const C = {
  hide: '#7a5a3a',
  hideDark: '#5a4128',
  hideBlack: '#2a2420', // greased hide, "appeared then black" (Mayr, §2.3)
  hideOchre: '#6e3226',
  fur: '#8a7a5c',
  furSpot: '#3a3024',
  bark: '#9c5a34', // Baganda "rich terracotta" (§7.1)
  barkPale: '#a88a62',
  barkRed: '#8a3a26', // camwood- or paint-reddened bark
  cotton: '#e6e1d3',
  indigo: '#26355c',
  darkBlue: '#2b3550',
  black: '#211d1a',
  red: '#8a2a22',
  sienna: '#a85a35', // the red-clay tobe (Swayne, §7.1)
  cream: '#d9cfb4',
  beadWhite: '#e8e4da',
  beadRed: '#a23a2a',
  beadBlue: '#3a5a9a',
  brass: '#b08a3c',
  iron: '#4f4c48',
  ochre: '#8c3a24',
  raffia: '#b49a62',
  leaves: '#4f6a2c',
  blanket: '#b9b2a4', // a PLAIN trade blanket (§2.3: the patterned one is 1897)
} as const

// ---- layer constructors ----------------------------------------------------

const S = (section: string): DressSource => ({ section })
const G = (reason: string): DressSource => ({ guess: reason })

function layer(
  slot: LayerSlot,
  form: LayerForm,
  material: DressMaterial,
  colour: string,
  wear: DressWear,
  source: DressSource,
  pattern: DressPattern = 'plain',
  colour2: string | null = null,
): DressLayer {
  return { slot, form, material, colour, colour2, pattern, wear, source }
}

/** The bare minimum a child is never drawn without — a string of beads at the
 *  waist. The record is silent on children for most of the roster (§8.3). */
const childBeads = (why: string) =>
  layer('ornament', 'waistBeads', 'beads', C.beadWhite, 'waist', G(why), 'beadwork', C.beadRed)

type Cell = DressLayer[]
type PeopleDress = Record<Sex, Record<AgeGroup, Cell>>

/** One people's eight cells; `elder` defaults to the adult's dress (the age
 *  cues are the body's, not a garment's — §8.3) unless given. */
function people(cells: {
  male: { child: Cell; youth: Cell; adult: Cell; elder?: Cell }
  female: { child: Cell; youth: Cell; adult: Cell; elder?: Cell }
}): PeopleDress {
  return {
    male: { ...cells.male, elder: cells.male.elder ?? cells.male.adult },
    female: { ...cells.female, elder: cells.female.elder ?? cells.female.adult },
  }
}

const NO_CHILD_RECORD = 'no period record of children’s dress (§8.3)'

/** The rule of §8.6: a child always wears a hip layer — the adults' hip
 *  garment of its people, scaled down; the waist beads stay as ornament. */
const childHip = (form: LayerForm, material: DressMaterial, colour: string, pattern: DressPattern = 'plain', colour2: string | null = null) =>
  layer('hip', form, material, colour, 'waist', G('a child always wears a hip layer: the adults’ own garment, scaled down (§8.6)'), pattern, colour2)

// ---- the table --------------------------------------------------------------

/** The everyday dress of every people in the game (src/world/geo.ts). */
export const PEOPLE_DRESS: Record<string, PeopleDress> = {
  zulu: people({
    male: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('small boys: no age-specific source (Astra B3, §8.3)'))],
      youth: [
        layer('hip', 'girdleTails', 'fur', C.fur, 'waist', S('§8.3 Zulu'), 'mottle', C.furSpot),
        layer('ornament', 'neckBeads', 'beads', C.beadWhite, 'neck', G('young men’s bead strings (§8.3)'), 'beadwork', C.beadRed),
      ],
      adult: [
        layer('hip', 'girdleTails', 'fur', C.fur, 'waist', S('§8.3 Zulu'), 'mottle', C.furSpot),
        layer('head', 'headRing', 'hair', C.black, 'crown', S('§8.3 Zulu')),
      ],
    },
    female: {
      child: [
        layer('hip', 'loinFlap', 'beads', C.beadWhite, 'waist', S('§8.3 Zulu'), 'beadwork', C.beadRed),
      ],
      youth: [
        layer('hip', 'skirtShort', 'beads', C.beadWhite, 'waist', S('§8.3 Zulu'), 'beadwork', C.beadBlue),
        // the bead strings built into a deep collar over the breast (§8.6)
        layer('ornament', 'neckBeads', 'beads', C.beadWhite, 'chest', S('§8.6 Zulu'), 'beadwork', C.beadRed),
        layer('ornament', 'waistBeads', 'beads', C.beadRed, 'waist', S('§8.3 Zulu'), 'beadwork', C.beadWhite),
      ],
      adult: [
        layer('hip', 'skirtKnee', 'hide', C.hideBlack, 'waist', S('§2.3')),
        layer('torso', 'breastCloth', 'hide', C.hide, 'chest', S('§8.3 Zulu')),
        layer('head', 'topknot', 'hair', C.ochre, 'crown', S('§8.3 Zulu')),
      ],
    },
  }),
  pedi: people({
    male: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G(NO_CHILD_RECORD))],
      youth: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', S('§7.3 Pedi'))],
      adult: [
        layer('hip', 'loinFlap', 'hide', C.hide, 'waist', S('§7.3 Pedi')),
        layer('shoulder', 'cloak', 'blanket', C.blanket, 'bothShoulders', S('§7.3 Pedi')),
      ],
    },
    female: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G(NO_CHILD_RECORD))],
      // Merensky's "eine Art ledernen Fracks", tied over the breast (§8.6)
      youth: [
        layer('hip', 'apron', 'hide', C.hide, 'waist', S('§7.3 Pedi')),
        layer('shoulder', 'cape', 'hide', C.hideDark, 'chest', S('§8.6 Pedi')),
      ],
      adult: [
        layer('hip', 'apron', 'hide', C.hide, 'waist', S('§7.3 Pedi')),
        layer('shoulder', 'cape', 'hide', C.hideDark, 'chest', S('§8.6 Pedi')),
      ],
    },
  }),
  san: people({
    male: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('Passarge: often not even a cloak (§7.3); the flap is a guess'))],
      youth: [
        layer('hip', 'loinFlap', 'hide', C.hide, 'waist', S('§7.3 San')),
        layer('shoulder', 'cape', 'hide', C.hideDark, 'rightShoulder', S('§7.3 San')),
      ],
      adult: [
        layer('hip', 'loinFlap', 'hide', C.hide, 'waist', S('§7.3 San')),
        layer('shoulder', 'cape', 'hide', C.hideDark, 'rightShoulder', S('§7.3 San')),
      ],
    },
    female: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('Passarge: often not even a cloak (§7.3); the flap is a guess'))],
      // Passarge: the women's Ledermantel, often larger, knotted under the
      // chin over both shoulders — worn so the year round (§8.6)
      youth: [
        layer('hip', 'apron', 'hide', C.hide, 'waist', G('women’s apron form not described (§8.3)')),
        layer('shoulder', 'cloak', 'hide', C.hideDark, 'chest', S('§8.6 San')),
      ],
      adult: [
        layer('hip', 'apron', 'hide', C.hide, 'waist', G('women’s apron form not described (§8.3)')),
        layer('shoulder', 'cloak', 'hide', C.hideDark, 'chest', S('§8.6 San')),
      ],
    },
  }),
  wayeyi: people({
    male: {
      child: [childHip('loinFlap', 'hide', C.hide), childBeads(NO_CHILD_RECORD)],
      youth: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', S('§7.3 Wayeyi'))],
      adult: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', S('§7.3 Wayeyi'))],
    },
    female: {
      child: [childHip('apron', 'hide', C.hide), childBeads(NO_CHILD_RECORD)],
      // Andersson's light goat-skin caross, tied over the breast (§8.6)
      youth: [
        layer('hip', 'apron', 'hide', C.hide, 'waist', S('§7.3 Wayeyi')),
        layer('shoulder', 'cape', 'hide', '#8a7355', 'chest', S('§8.6 Wayeyi')),
      ],
      adult: [
        layer('hip', 'apron', 'hide', C.hide, 'waist', S('§7.3 Wayeyi')),
        layer('shoulder', 'cape', 'hide', '#8a7355', 'chest', S('§8.6 Wayeyi')),
      ],
    },
  }),
  bemba: people({
    male: {
      child: [childHip('loinFlap', 'barkCloth', C.barkRed, 'mottle', C.bark), childBeads(NO_CHILD_RECORD)],
      youth: [layer('hip', 'skirtKnee', 'barkCloth', C.barkRed, 'waist', S('§7.3 Bemba'), 'mottle', C.bark)],
      adult: [layer('hip', 'skirtKnee', 'barkCloth', C.barkRed, 'waist', S('§7.3 Bemba'), 'mottle', C.bark)],
    },
    female: {
      // the buchushi apron: the girl's hip layer
      child: [childHip('apron', 'barkCloth', C.barkRed, 'mottle', C.bark), childBeads(NO_CHILD_RECORD)],
      // the camwood-red bark cloth, worn from the chest (§8.6)
      youth: [layer('hip', 'wrapLong', 'barkCloth', C.barkRed, 'chest', S('§8.6 Bemba'), 'mottle', C.bark)],
      adult: [layer('hip', 'wrapLong', 'barkCloth', C.barkRed, 'chest', S('§8.6 Bemba'), 'mottle', C.bark)],
    },
  }),
  lunda: people({
    male: {
      child: [childHip('apron', 'fur', C.fur, 'mottle', C.furSpot), childBeads(NO_CHILD_RECORD)],
      youth: [layer('hip', 'apron', 'fur', C.fur, 'waist', S('§7.3 Lunda'), 'mottle', C.furSpot)],
      adult: [layer('hip', 'apron', 'fur', C.fur, 'waist', S('§7.3 Lunda'), 'mottle', C.furSpot)],
    },
    female: {
      child: [childHip('loinFlap', 'hide', C.hide), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('women’s everyday garment not described (§8.3)')),
        layer('torso', 'breastCloth', 'cotton', C.cotton, 'chest', G('Arnot 1889: calico reaches commoners by the yard (§7.3 Lunda); worn over the breast by the rule of §8.6, never a kaross')),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§7.3 Lunda')),
      ],
      adult: [
        layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('women’s everyday garment not described (§8.3)')),
        layer('torso', 'breastCloth', 'cotton', C.cotton, 'chest', G('Arnot 1889: calico reaches commoners by the yard (§7.3 Lunda); worn over the breast by the rule of §8.6, never a kaross')),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§7.3 Lunda')),
      ],
    },
  }),
  bambundu: people({
    male: {
      child: [childHip('loinFlap', 'cotton', 'cloth'), childBeads(NO_CHILD_RECORD)],
      youth: [layer('hip', 'loinFlap', 'cotton', 'cloth', 'waist', G('Monteiro gives only "nearly naked" (§7.3)'))],
      adult: [layer('hip', 'loinFlap', 'cotton', 'cloth', 'waist', G('Monteiro gives only "nearly naked" (§7.3)'))],
    },
    female: {
      child: [childHip('skirtShort', 'cotton', 'cloth'), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'skirtShort', 'cotton', 'cloth', 'waist', G('Monteiro gives only "nearly naked" (§7.3)')),
        layer('torso', 'breastCloth', 'cotton', 'cloth', 'chest', G('Monteiro gives only "nearly naked" (§7.3); the cloth over the breast by the rule of §8.6')),
      ],
      adult: [layer('hip', 'wrapLong', 'cotton', 'cloth', 'chest', G('Monteiro gives only "nearly naked" (§7.3); the cloth over the breast by the rule of §8.6'))],
    },
  }),
  maasai: people({
    male: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('pre-initiation dress needs a passage (Astra B31, §8.3)'))],
      // The warrior: sheep-skin over the LEFT shoulder, legs bare, grease and red clay.
      youth: [
        layer('shoulder', 'cape', 'hide', C.hide, 'leftShoulder', S('§2.1')),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§2.1')),
      ],
      adult: [layer('shoulder', 'cape', 'hide', C.hide, 'leftShoulder', S('§2.1'))],
      elder: [layer('shoulder', 'cloak', 'fur', C.fur, 'bothShoulders', S('§7.1 Maasai'), 'mottle', C.furSpot)],
    },
    female: {
      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('pre-initiation dress needs a passage (Astra B31, §8.3)'))],
      youth: [
        layer('hip', 'skirtKnee', 'hide', C.hide, 'waist', G('girls’ garment not described (§8.3)')),
        layer('shoulder', 'cape', 'hide', C.hide, 'chest', G('girls’ garment not described; a hide over the breast, the women’s material (§8.6)')),
        layer('ornament', 'limbRings', 'metal', C.brass, 'limbs', S('§2.1')),
      ],
      adult: [
        layer('hip', 'wrapLong', 'hide', C.hide, 'chest', S('§2.1')),
        layer('ornament', 'limbRings', 'metal', C.iron, 'limbs', S('§2.1')),
      ],
    },
  }),
  somali: people({
    male: {
      child: [layer('hip', 'loinFlap', 'cotton', C.cotton, 'waist', G(NO_CHILD_RECORD))],
      youth: [layer('torso', 'toga', 'cotton', C.cotton, 'leftShoulder', S('§7.1 Somali'))],
      adult: [layer('torso', 'toga', 'cotton', C.cotton, 'leftShoulder', S('§7.1 Somali'))],
    },
    female: {
      child: [layer('hip', 'skirtShort', 'cotton', C.cotton, 'waist', G(NO_CHILD_RECORD))],
      youth: [layer('torso', 'robe', 'cotton', C.sienna, 'chest', G('women’s cut not described; no face veil (§7.1)'))],
      adult: [
        layer('torso', 'robe', 'cotton', C.sienna, 'chest', G('women’s cut not described; no face veil (§7.1)')),
        layer('head', 'hairBag', 'cotton', C.darkBlue, 'crown', S('§7.1 Somali')),
      ],
    },
  }),
  swahili: people({
    male: {
      child: [layer('torso', 'shirt', 'cotton', C.cotton, 'chest', G(NO_CHILD_RECORD))],
      youth: [
        layer('torso', 'robe', 'cotton', C.cotton, 'chest', S('§7.1 Swahili')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.1 Swahili')),
      ],
      adult: [
        layer('torso', 'robe', 'cotton', C.cotton, 'chest', S('§7.1 Swahili')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.1 Swahili')),
      ],
    },
    female: {
      child: [layer('hip', 'wrapLong', 'cotton', 'cloth', 'chest', G(NO_CHILD_RECORD))],
      // The kanga: one round the body, one over the head — plain border, no text.
      youth: [
        layer('hip', 'wrapLong', 'cotton', 'cloth', 'chest', S('§2.3b'), 'border', C.black),
        layer('shoulder', 'hood', 'cotton', 'cloth', 'overHead', S('§2.3b'), 'border', C.black),
      ],
      adult: [
        layer('hip', 'wrapLong', 'cotton', 'cloth', 'chest', S('§2.3b'), 'border', C.black),
        layer('shoulder', 'hood', 'cotton', 'cloth', 'overHead', S('§2.3b'), 'border', C.black),
      ],
    },
  }),
  baganda: people({
    male: {
      child: [layer('hip', 'loinFlap', 'barkCloth', C.bark, 'waist', G(NO_CHILD_RECORD), 'mottle', C.barkPale)],
      youth: [layer('torso', 'toga', 'barkCloth', C.bark, 'rightShoulder', S('§7.1 Baganda'), 'mottle', C.barkPale)],
      adult: [layer('torso', 'toga', 'barkCloth', C.bark, 'rightShoulder', S('§7.1 Baganda'), 'mottle', C.barkPale)],
    },
    female: {
      child: [layer('hip', 'skirtShort', 'barkCloth', C.bark, 'waist', G(NO_CHILD_RECORD), 'mottle', C.barkPale)],
      youth: [layer('hip', 'wrapLong', 'barkCloth', C.bark, 'chest', S('§7.1 Baganda'), 'mottle', C.barkPale)],
      adult: [layer('hip', 'wrapLong', 'barkCloth', C.bark, 'chest', S('§7.1 Baganda'), 'mottle', C.barkPale)],
    },
  }),
  sidama: people({
    male: {
      child: [childHip('loinFlap', 'hide', C.hide), childBeads(NO_CHILD_RECORD)],
      youth: [layer('torso', 'toga', 'cotton', C.cream, 'leftShoulder', G('no source on Sidama dress c.1890; never the Amhara shamma (§7.1)'))],
      adult: [layer('torso', 'toga', 'cotton', C.cream, 'leftShoulder', G('no source on Sidama dress c.1890; never the Amhara shamma (§7.1)'))],
    },
    female: {
      child: [childHip('skirtShort', 'hide', C.hide), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'skirtKnee', 'hide', C.hide, 'waist', G('no source on Sidama dress c.1890 (§7.1)')),
        layer('torso', 'breastCloth', 'hide', C.hideDark, 'chest', G('no source on Sidama dress c.1890; a hide over the breast by the rule of §8.6')),
      ],
      adult: [layer('hip', 'wrapLong', 'hide', C.hide, 'chest', G('no source on Sidama dress c.1890 (§7.1)'))],
    },
  }),
  tuareg: people({
    male: {
      child: [layer('torso', 'shirt', 'cotton', C.indigo, 'chest', G('veil only from manhood (§2.4); child’s shirt a guess'))],
      youth: [
        layer('torso', 'robe', 'cotton', C.indigo, 'chest', S('§7.2 Tuareg')),
        layer('head', 'veil', 'cotton', C.black, 'face', S('§2.4')),
        layer('head', 'turban', 'cotton', C.black, 'aroundHead', S('§7.2 Tuareg')),
      ],
      adult: [
        layer('torso', 'robe', 'cotton', C.indigo, 'chest', S('§7.2 Tuareg')),
        layer('head', 'veil', 'cotton', C.black, 'face', S('§2.4')),
        layer('head', 'turban', 'cotton', C.black, 'aroundHead', S('§7.2 Tuareg')),
      ],
    },
    female: {
      child: [layer('torso', 'shirt', 'cotton', C.indigo, 'chest', G(NO_CHILD_RECORD))],
      youth: [
        layer('torso', 'robe', 'cotton', C.darkBlue, 'chest', G('women’s dress not described; unveiled (§2.4)')),
        layer('shoulder', 'hood', 'cotton', C.indigo, 'overHead', G('women’s head cloth not described (§8.3)')),
      ],
      adult: [
        layer('torso', 'robe', 'cotton', C.darkBlue, 'chest', G('women’s dress not described; unveiled (§2.4)')),
        layer('shoulder', 'hood', 'cotton', C.indigo, 'overHead', G('women’s head cloth not described (§8.3)')),
      ],
    },
  }),
  berbers: people({
    male: {
      child: [layer('torso', 'shirt', 'wool', C.cream, 'chest', G(NO_CHILD_RECORD))],
      youth: [layer('shoulder', 'cloak', 'wool', C.cream, 'bothShoulders', S('§7.2 Berbers'))],
      adult: [
        layer('shoulder', 'cloak', 'wool', C.cream, 'bothShoulders', S('§7.2 Berbers')),
        layer('head', 'turban', 'cotton', C.cotton, 'aroundHead', S('§7.2 Berbers')),
      ],
    },
    female: {
      child: [layer('torso', 'shirt', 'wool', C.cream, 'chest', G(NO_CHILD_RECORD))],
      youth: [
        layer('hip', 'wrapLong', 'wool', 'cloth', 'chest', S('§7.2 Berbers')),
        layer('ornament', 'waistBeads', 'wool', C.red, 'waist', S('§7.2 Berbers')),
      ],
      adult: [
        layer('hip', 'wrapLong', 'wool', 'cloth', 'chest', S('§7.2 Berbers')),
        layer('ornament', 'waistBeads', 'wool', C.red, 'waist', S('§7.2 Berbers')),
        layer('ornament', 'neckBeads', 'metal', '#c8c8c0', 'neck', S('§7.2 Berbers')),
      ],
    },
  }),
  nubians: people({
    male: {
      child: [layer('torso', 'shirt', 'cotton', C.cotton, 'chest', G(NO_CHILD_RECORD))],
      youth: [
        layer('torso', 'shirt', 'cotton', C.cotton, 'chest', S('§7.2 Nubians')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Nubians')),
      ],
      adult: [
        layer('torso', 'shirt', 'cotton', C.cotton, 'chest', S('§7.2 Nubians')),
        layer('head', 'turban', 'cotton', C.cotton, 'aroundHead', S('§7.2 Nubians')),
      ],
    },
    female: {
      child: [layer('hip', 'skirtShort', 'hide', C.hideDark, 'waist', S('§8.3 Nubians'))],
      youth: [
        layer('hip', 'skirtShort', 'hide', C.hideDark, 'waist', S('§8.3 Nubians')),
        layer('torso', 'breastCloth', 'cotton', C.darkBlue, 'chest', G('the women’s dark cotton over the breast, by the rule of §8.6')),
      ],
      adult: [
        layer('torso', 'robe', 'cotton', C.darkBlue, 'chest', G('no 1890 eyewitness of village women (§7.2)')),
        layer('shoulder', 'hood', 'cotton', C.black, 'overHead', G('no 1890 eyewitness of village women (§7.2)')),
      ],
    },
  }),
  hausa: people({
    male: {
      child: [layer('torso', 'shirt', 'cotton', C.cotton, 'chest', G('one universal age rule unsupported (Astra B19)'))],
      youth: [
        layer('hip', 'trousers', 'cotton', C.darkBlue, 'waist', S('§7.2 Hausa')),
        layer('torso', 'robe', 'cotton', C.darkBlue, 'chest', S('§7.2 Hausa')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Hausa')),
      ],
      adult: [
        layer('hip', 'trousers', 'cotton', C.darkBlue, 'waist', S('§7.2 Hausa')),
        layer('torso', 'robe', 'cotton', C.darkBlue, 'chest', S('§7.2 Hausa')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Hausa')),
      ],
    },
    female: {
      child: [childHip('skirtShort', 'cotton', C.indigo), childBeads('one universal age rule unsupported (Astra B19)')],
      youth: [layer('hip', 'wrapLong', 'cotton', C.indigo, 'chest', S('§7.2 Hausa'))],
      adult: [layer('hip', 'wrapLong', 'cotton', C.indigo, 'chest', S('§7.2 Hausa'))],
    },
  }),
  bambara: people({
    male: {
      child: [childHip('loinFlap', 'cotton', 'cloth'), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'trousers', 'cotton', C.cotton, 'waist', S('§7.2 Bambara')),
        layer('torso', 'shirt', 'cotton', C.indigo, 'chest', S('§7.2 Bambara')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Bambara')),
      ],
      adult: [
        layer('hip', 'trousers', 'cotton', C.cotton, 'waist', S('§7.2 Bambara')),
        layer('torso', 'shirt', 'cotton', C.indigo, 'chest', S('§7.2 Bambara')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Bambara')),
      ],
    },
    female: {
      child: [childHip('skirtShort', 'cotton', 'cloth'), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'wrapLong', 'cotton', 'cloth', 'waist', S('§7.2 Bambara')),
        layer('torso', 'breastCloth', 'cotton', C.cotton, 'chest', S('§7.2 Bambara')),
      ],
      adult: [
        layer('hip', 'wrapLong', 'cotton', 'cloth', 'waist', S('§7.2 Bambara')),
        layer('torso', 'breastCloth', 'cotton', C.cotton, 'chest', S('§7.2 Bambara')),
      ],
    },
  }),
  mandinka: people({
    male: {
      child: [childHip('loinFlap', 'cotton', 'cloth'), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'trousers', 'cotton', C.cotton, 'waist', S('§7.2 Mandinka')),
        layer('torso', 'shirt', 'cotton', C.cotton, 'chest', S('§7.2 Mandinka')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Mandinka')),
      ],
      adult: [
        layer('hip', 'trousers', 'cotton', C.cotton, 'waist', S('§7.2 Mandinka')),
        layer('torso', 'shirt', 'cotton', C.cotton, 'chest', S('§7.2 Mandinka')),
        layer('head', 'cap', 'cotton', C.cotton, 'crown', S('§7.2 Mandinka')),
      ],
    },
    female: {
      child: [childHip('skirtShort', 'cotton', 'cloth'), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'wrapLong', 'cotton', 'cloth', 'waist', S('§7.2 Mandinka')),
        layer('torso', 'breastCloth', 'cotton', C.cotton, 'chest', S('§7.2 Mandinka')),
        layer('head', 'headband', 'cotton', C.cotton, 'aroundHead', S('§7.2 Mandinka')),
      ],
      adult: [
        layer('hip', 'wrapLong', 'cotton', 'cloth', 'waist', S('§7.2 Mandinka')),
        layer('torso', 'breastCloth', 'cotton', C.cotton, 'chest', S('§7.2 Mandinka')),
        layer('head', 'headband', 'cotton', C.cotton, 'aroundHead', S('§7.2 Mandinka')),
      ],
    },
  }),
  fang: people({
    male: {
      child: [childHip('loinFlap', 'barkCloth', C.barkPale, 'mottle', C.bark), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', S('§7.4 Fang'), 'mottle', C.bark),
        layer('hip', 'apron', 'fur', C.fur, 'waist', S('§7.4 Fang'), 'mottle', C.furSpot),
      ],
      adult: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', S('§7.4 Fang'), 'mottle', C.bark),
        layer('hip', 'apron', 'fur', C.fur, 'waist', S('§7.4 Fang'), 'mottle', C.furSpot),
      ],
    },
    female: {
      child: [childHip('loinFlap', 'barkCloth', C.red), childBeads(NO_CHILD_RECORD)],
      // the red-dyed "Fan cloth", a second strip worn over the breast (§8.6)
      youth: [
        layer('hip', 'loinFlap', 'barkCloth', C.red, 'waist', S('§7.4 Fang')),
        layer('torso', 'breastCloth', 'barkCloth', C.red, 'chest', S('§8.6 Fang'), 'mottle', C.barkRed),
      ],
      adult: [
        layer('hip', 'loinFlap', 'barkCloth', C.red, 'waist', S('§7.4 Fang')),
        layer('torso', 'breastCloth', 'barkCloth', C.red, 'chest', S('§8.6 Fang'), 'mottle', C.barkRed),
      ],
    },
  }),
  mongo: people({
    male: {
      child: [
        childHip('loinFlap', 'raffia', C.raffia, 'stripes', C.barkPale),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', G('camwood on children assumed from the adults (§7.4)')),
      ],
      youth: [
        layer('hip', 'loinFlap', 'raffia', C.raffia, 'waist', S('§7.4 Mongo'), 'stripes', C.barkPale),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§7.4 Mongo')),
      ],
      adult: [
        layer('hip', 'loinFlap', 'raffia', C.raffia, 'waist', S('§7.4 Mongo'), 'stripes', C.barkPale),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§7.4 Mongo')),
      ],
    },
    female: {
      child: [
        childHip('loinFlap', 'raffia', C.raffia, 'stripes', C.barkPale),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', G('camwood on children assumed from the adults (§7.4)')),
      ],
      youth: [
        layer('hip', 'loinFlap', 'leaves', C.leaves, 'waist', S('§7.4 Mongo')),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§7.4 Mongo')),
        layer('ornament', 'neckBeads', 'beads', C.beadBlue, 'chest', S('§8.6 Mongo'), 'beadwork', C.beadWhite),
      ],
      adult: [
        layer('hip', 'loinFlap', 'leaves', C.leaves, 'waist', S('§7.4 Mongo')),
        layer('ornament', 'bodyPaint', 'pigment', C.ochre, 'skin', S('§7.4 Mongo')),
        layer('ornament', 'neckBeads', 'beads', C.beadBlue, 'chest', S('§8.6 Mongo'), 'beadwork', C.beadWhite),
      ],
    },
  }),
  mbuti: people({
    male: {
      child: [childHip('loinFlap', 'barkCloth', C.barkPale, 'mottle', C.bark), childBeads(NO_CHILD_RECORD)],
      youth: [layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', S('§7.4 Mbuti'), 'mottle', C.bark)],
      adult: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', S('§7.4 Mbuti'), 'mottle', C.bark),
        layer('head', 'cap', 'fur', C.hideDark, 'crown', S('§7.4 Mbuti')),
      ],
    },
    female: {
      child: [childHip('loinFlap', 'barkCloth', C.barkPale, 'mottle', C.bark), childBeads(NO_CHILD_RECORD)],
      youth: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', G('women’s dress not described (§7.4)'), 'mottle', C.bark),
        layer('shoulder', 'cape', 'barkCloth', C.bark, 'chest', G('women’s dress not described (§7.4); the bark cloth as a shoulder cape over the breast (§8.6)'), 'mottle', C.barkPale),
      ],
      adult: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', G('women’s dress not described (§7.4)'), 'mottle', C.bark),
        layer('shoulder', 'cape', 'barkCloth', C.bark, 'chest', G('women’s dress not described (§7.4); the bark cloth as a shoulder cape over the breast (§8.6)'), 'mottle', C.barkPale),
      ],
    },
  }),
  banda: people({
    male: {
      child: [childHip('loinFlap', 'barkCloth', C.barkPale, 'mottle', C.bark), childBeads('no period description of Banda dress at all (§7.4)')],
      youth: [layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', G('proxy: the Banziri, not Banda (§7.4)'), 'mottle', C.bark)],
      adult: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', G('proxy: the Banziri, not Banda (§7.4)'), 'mottle', C.bark),
        layer('ornament', 'waistBeads', 'metal', C.brass, 'waist', G('proxy: the Banziri belt rings (§7.4)')),
      ],
    },
    female: {
      child: [childHip('loinFlap', 'barkCloth', C.barkPale, 'mottle', C.bark), childBeads('no period description of Banda dress at all (§7.4)')],
      youth: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', G('proxy: the Banziri, not Banda (§7.4)'), 'mottle', C.bark),
        layer('torso', 'breastCloth', 'barkCloth', C.barkPale, 'chest', G('proxy: the Banziri bark pagne (§7.4), a second piece over the breast by the rule of §8.6'), 'mottle', C.bark),
      ],
      adult: [
        layer('hip', 'loinFlap', 'barkCloth', C.barkPale, 'waist', G('proxy: the Banziri, not Banda (§7.4)'), 'mottle', C.bark),
        layer('torso', 'breastCloth', 'barkCloth', C.barkPale, 'chest', G('proxy: the Banziri bark pagne (§7.4), a second piece over the breast by the rule of §8.6'), 'mottle', C.bark),
        layer('head', 'headband', 'beads', C.beadWhite, 'aroundHead', G('proxy: the Banziri hair beads (§7.4)'), 'beadwork', C.beadRed),
      ],
    },
  }),
}

/** A settlement without a people (the ports): a plain wrap in the village cloth. */
const NO_PEOPLE: PeopleDress = people({
  male: {
    child: [layer('hip', 'loinFlap', 'cotton', 'cloth', 'waist', G('port town: no people recorded'))],
    youth: [layer('torso', 'shirt', 'cotton', 'cloth', 'chest', G('port town: no people recorded'))],
    adult: [layer('torso', 'robe', 'cotton', 'cloth', 'chest', G('port town: no people recorded'))],
  },
  female: {
    child: [layer('hip', 'skirtShort', 'cotton', 'cloth', 'waist', G('port town: no people recorded'))],
    youth: [layer('hip', 'wrapLong', 'cotton', 'cloth', 'chest', G('port town: no people recorded'))],
    adult: [layer('hip', 'wrapLong', 'cotton', 'cloth', 'chest', G('port town: no people recorded'))],
  },
})

// ---- the query --------------------------------------------------------------

export interface AppearanceQuery {
  peopleId: string | null
  sex: Sex
  age: AgeGroup
  /** This visit's seasonal drivers (systems/season.ts). */
  drivers: DressDrivers
  /** The game year (1890..1895). */
  year: number
  /** The figure's everyday cloth and its settlement's palette: they key the
   *  rank (the first cloth is the notable's — `wearsByRank`) and the wrap's
   *  colour, exactly as the primitive figure keys them. */
  cloth: string
  palette: readonly string[]
  /** A stable per-figure number in [0, 1) for the choices a share decides. */
  pick: number
}

/** The Zulu blanket share for a year (VILLAGER_DRESS, calibratable). */
export function zuluBlanketShare(year: number): number {
  const z = VILLAGER_DRESS.zuluBlanketShare
  const t = Math.min(1, Math.max(0, (year - z.from) / (z.to - z.from)))
  return z.share + (z.shareTo - z.share) * t
}

/** The peoples whose record carries an infant in the women's mantle:
 *  Passarge's San (§7.3 San, §8.6). */
const BABY_SLING_PEOPLES = new Set(['san'])

const bySlot = (a: DressLayer, b: DressLayer) => LAYER_SLOTS.indexOf(a.slot) - LAYER_SLOTS.indexOf(b.slot)

/**
 * The ordered dress layers this figure wears today: the people's everyday
 * cell, the year's changes, and the season's wrap from systems/dress.ts — which
 * REPLACES an everyday shoulder layer (the San ‡nau closes over both shoulders,
 * it is not a second cloak) and is never put on a small child (Passarge's San
 * children have "often not even a cloak"; for the rest it is a guess, §8.3).
 * The 'cloth' colour token is resolved to the figure's own cloth.
 */
export function appearanceFor(q: AppearanceQuery): DressLayer[] {
  const table = (q.peopleId && PEOPLE_DRESS[q.peopleId]) || NO_PEOPLE
  let layers = table[q.sex][q.age].map((l) => ({ ...l }))

  // YEAR: a Baganda man of rank takes the white cotton kanzu (VILLAGER_DRESS).
  const rank = wearsByRank(q.cloth, q.palette)
  if (q.peopleId === 'baganda' && q.sex === 'male' && q.age !== 'child' && rank && q.year >= VILLAGER_DRESS.bagandaCottonFrom) {
    layers = layers.filter((l) => l.slot !== 'torso')
    layers.push(layer('torso', 'robe', 'cotton', C.cotton, 'chest', G('cotton for the rank from the protectorate, §2.5 / VILLAGER_DRESS')))
  }

  // SEASON: the wrap the record supports, from dress.ts.
  const seasonal = q.peopleId ? seasonalDressFor(q.peopleId, q.drivers) : null
  if (seasonal && q.age !== 'child' && (!seasonal.rankOnly || rank)) {
    let colour = cloakForCloth(seasonal.cloaks, q.palette, q.cloth)
    let material: DressMaterial = q.peopleId === 'somali' || q.peopleId === 'hausa' ? 'cotton' : q.peopleId === 'tuareg' ? 'wool' : 'hide'
    let source: DressSource = S('§7')
    if (q.peopleId === 'zulu') {
      // YEAR: Mayr's skin-to-blanket transition, at the calibratable rate.
      const blanket = q.pick < zuluBlanketShare(q.year)
      colour = blanket ? C.blanket : q.pick < 0.65 ? C.hideBlack : C.hideOchre
      material = blanket ? 'blanket' : 'hide'
      source = blanket ? G('blanket share by year, VILLAGER_DRESS (§8.3)') : S('§2.3')
    }
    // The seasonal wrap replaces the shoulder layer of its own kind — a cloak
    // or cape for a cloak, a hood for a hood — and keeps the rest: a Tuareg
    // woman's everyday head cloth stays on under the cold-weather wool cloak.
    const replaces = (l: DressLayer) =>
      l.slot === 'shoulder' && (seasonal.wear === 'head' ? l.form === 'hood' : l.form === 'cloak' || l.form === 'cape')
    // A wrap pulled over the head (the Somali tobe in the karif) or closed
    // over both shoulders (the San ‡nau) is the garment already worn, worn
    // differently: it keeps that garment's cloth and colour (dress.ts).
    const raised =
      seasonal.wear === 'head'
        ? layers.find((l) => l.form === 'toga' || l.form === 'robe')
        : layers.find((l) => l.slot === 'shoulder' && (l.form === 'cape' || l.form === 'cloak'))
    if (raised) {
      colour = raised.colour
      material = raised.material
    }
    // A mantle tied over the breast stays tied in the cold (§8.6).
    const closed = layers.some((l) => replaces(l) && l.wear === 'chest')
    layers = layers.filter((l) => !replaces(l))
    layers.push(
      seasonal.wear === 'head'
        ? layer('shoulder', 'hood', material, colour, 'overHead', source)
        : layer('shoulder', 'cloak', material, colour, closed ? 'chest' : 'bothShoulders', source),
    )
  }

  // An infant carried in the mantle, for a share of the adult women whose
  // record says so (VILLAGER_DRESS.babySlingShare, calibratable). Keyed on a
  // second draw from `pick`, so it does not follow the blanket share.
  const mantle = layers.find((l) => l.slot === 'shoulder' && l.form === 'cloak' && l.wear === 'chest')
  if (q.peopleId && BABY_SLING_PEOPLES.has(q.peopleId) && q.sex === 'female' && q.age === 'adult' && mantle && (q.pick * 7.31) % 1 < VILLAGER_DRESS.babySlingShare) {
    layers.push(layer('shoulder', 'babySling', mantle.material, mantle.colour, 'bothShoulders', S('§8.6 San')))
  }

  for (const l of layers) if (l.colour === 'cloth') l.colour = q.cloth
  return layers.sort(bySlot)
}

/** The skin colour a figure is drawn with: its body paint, when it wears one. */
export function skinTone(layers: readonly DressLayer[], skin: string): string {
  return layers.find((l) => l.form === 'bodyPaint')?.colour ?? skin
}
