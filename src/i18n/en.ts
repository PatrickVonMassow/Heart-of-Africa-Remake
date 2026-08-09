// English language file (design.md §17). Texts are written for their
// context — a Victorian-era explorer's diary and period UI — rather than
// being literal translations of the German originals.

import type { Strings, TextParams } from './types'
import { DIRECTION_WORDS, GLOSSARY } from '../world/lore'
import { namesFromCsv } from './names'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const dec = (v: number) => Math.abs(v).toFixed(1)

const PLACES: Record<string, string> = {
  cairo: 'Cairo',
  tangier: 'Tangier',
  khartoum: 'Khartoum',
  'st-louis': 'St. Louis',
  timbuktu: 'Timbuktu',
  lagos: 'Lagos',
  boma: 'Boma',
  berbera: 'Berbera',
  zanzibar: 'Zanzibar',
  capetown: 'Cape Town',
  'tuareg-village': 'Tuareg Village',
  'berber-village': 'Berber Village',
  'nubian-village': 'Nubian Village',
  'bambara-village': 'Bambara Village',
  'hausa-village': 'Hausa Village',
  'mandinka-village': 'Mandinka Village',
  'fang-village': 'Fang Village',
  'mongo-village': 'Mongo Village',
  'mbuti-village': 'Mbuti Village',
  'banda-village': 'Banda Village',
  'bambundu-village': 'Bambundu Village',
  'lunda-village': 'Lunda Village',
  'maasai-village': 'Maasai Village',
  'swahili-village': 'Swahili Village',
  'somali-village': 'Somali Village',
  'sidama-village': 'Sidama Village',
  'baganda-village': 'Baganda Village',
  'wayeyi-village': 'Wayeyi Village',
  'bemba-village': 'Bemba Village',
  'pedi-village': 'Pedi Village',
  'zulu-village': 'Zulu Village',
  'san-village': 'San Village',
  giza: 'The Pyramids of Giza',
}

const PEOPLES: Record<string, string> = {
  maasai: 'Maasai', pedi: 'Pedi', zulu: 'Zulu', san: 'San',
  wayeyi: 'Wayeyi', lunda: 'Lunda', mbuti: 'Mbuti', swahili: 'Swahili',
  somali: 'Somali', hausa: 'Hausa', mongo: 'Mongo', sidama: 'Sidama',
  banda: 'Banda', nubians: 'Nubians', tuareg: 'Tuareg', berbers: 'Berbers',
  bambara: 'Bambara', mandinka: 'Mandinka', bemba: 'Bemba',
  bambundu: 'Bambundu', baganda: 'Baganda', fang: 'Fang',
}

const LANDMARKS: Record<string, string> = {
  'lake-chad': 'Lake Chad',
  'lake-tana': 'Lake Tana',
  'lake-albert': 'Lake Albert',
  'lake-edward': 'Lake Edward',
  'lake-victoria': 'Lake Victoria',
  'lake-rudolf': 'Lake Rudolf',
  'lake-tanganyika': 'Lake Tanganyika',
  'lake-nyasa': 'Lake Nyasa',
  toubkal: 'Toubkal',
  'emi-koussi': 'Emi Koussi',
  kilimanjaro: 'Kilimanjaro',
  'mount-kenya': 'Mount Kenya',
  elgon: 'Mount Elgon',
  'ras-dashen': 'Ras Dashen',
  'mount-cameroon': 'Mount Cameroon',
  tahat: 'Tahat',
  rwenzori: 'Rwenzori',
  meru: 'Mount Meru',
  'thabana-ntlenyana': 'Thabana Ntlenyana',
  'stanley-falls': 'Stanley Falls',
  'livingstone-falls': 'Livingstone Falls',
  'murchison-falls': 'Murchison Falls',
  'victoria-falls': 'Victoria Falls',
  'augrabies-falls': 'Augrabies Falls',
  'elephant-graveyard': 'Elephant Graveyard',
  meroe: 'Pyramids of Meroë',
  giza: 'Pyramids of Giza',
  'great-zimbabwe': 'Great Zimbabwe',
  lalibela: 'Lalibela',
  kilwa: 'Kilwa',
  aksum: 'Aksum',
  gondar: 'Gondar',
  bandiagara: 'Bandiagara',
  ngorongoro: 'Ngorongoro Crater',
  lengai: 'Ol Doinyo Lengai',
  okavango: 'Okavango Delta',
  sudd: 'Sudd',
}

export const en: Strings = {
  lang: 'en',
  languageName: 'English',
  months: MONTHS,

  formatDate(day, startYear) {
    const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
  },
  formatDateShort(day, startYear) {
    const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
  },
  formatLatLon(lat, lon) {
    const latDir = lat >= 0 ? 'North' : 'South'
    const lonDir = lon >= 0 ? 'East' : 'West'
    return `Latitude ${dec(lat)}° ${latDir} · Longitude ${dec(lon)}° ${lonDir}`
  },
  formatDecimal: dec,

  regions: { north: 'North', west: 'West', central: 'Central', east: 'East', south: 'South' },
  animals: { lion: 'lions', cheetah: 'a cheetah', leopard: 'a leopard', hyena: 'hyenas', snake: 'a snake', crocodile: 'a crocodile' },
  // Naming what ACTS on screen (design.md §17.8). English needs no gender to
  // inflect its qualifier, but the field is part of the contract every language
  // fills; the young carry the word a naturalist of the period would use.
  actors: {
    kinds: {
      elephant: { noun: 'elephant', gender: 'n', young: 'elephant calf' },
      giraffe: { noun: 'giraffe', gender: 'n', young: 'giraffe calf' },
      zebra: { noun: 'zebra', gender: 'n', young: 'zebra foal' },
      wildebeest: { noun: 'wildebeest', gender: 'n', young: 'wildebeest calf' },
      antelope: { noun: 'antelope', gender: 'n', young: 'antelope calf' },
      warthog: { noun: 'warthog', gender: 'n', young: 'warthog piglet' },
      flamingo: { noun: 'flamingo', gender: 'n' },
      crocodile: { noun: 'crocodile', gender: 'n' },
      plover: { noun: 'plover', gender: 'n', young: 'plover chick' },
      lion: { noun: 'lion', gender: 'n', young: 'lion cub' },
      cheetah: { noun: 'cheetah', gender: 'n' },
      leopard: { noun: 'leopard', gender: 'n' },
      hyena: { noun: 'hyena', gender: 'n' },
      vulture: { noun: 'vulture', gender: 'n' },
      elder: { noun: 'elder', gender: 'n' },
      trader: { noun: 'trader', gender: 'n' },
      porter: { noun: 'porter', gender: 'n' },
      villager: { noun: 'villager', gender: 'n' },
      child: { noun: 'child', gender: 'n' },
      guide: { noun: 'guide', gender: 'n' },
      cameleer: { noun: 'camel driver', gender: 'n' },
      donkeyboy: { noun: 'donkey boy', gender: 'n' },
      tourist: { noun: 'tourist', gender: 'n' },
      goat: { noun: 'goat', gender: 'n' },
      camel: { noun: 'camel', gender: 'n' },
      donkey: { noun: 'donkey', gender: 'n' },
      camp: { noun: 'camp', gender: 'n' },
      canoe: { noun: 'canoe', gender: 'n' },
    },
    adult: { m: 'Adult', f: 'Adult', n: 'Adult' },
    dead: { m: 'Dead', f: 'Dead', n: 'Dead' },
    youngGender: 'n',
  },
  places: PLACES,
  peoples: PEOPLES,
  landmarks: LANDMARKS,
  unknownPlaces: {
    port: 'Unknown port', monument: 'Unknown monument', village: 'Unknown village',
    mountain: 'Unknown mountain', waterfall: 'Unknown waterfall', lake: 'Unknown lake',
    cultural: 'Unknown ruins', natural: 'Unknown landmark', site: 'Unknown site',
  },
  equipment: {
    shovel: 'Shovel', rope: 'Rope', machete: 'Machete', rifle: 'Rifle',
    medicine: 'Medicine', canteen: 'Canteen', canoe: 'Canoe',
  },
  gifts: {
    gold: 'Gold Jewelry', silver: 'Silver Jewelry', emerald: 'Emerald',
    copper: 'Copper Bangle', ivory: 'Ivory Carving',
  },
  treasures: {
    gold: 'Gold', silver: 'Silver', emerald: 'Emeralds',
    copper: 'Copper', ivory: 'Ivory', statue: 'Golden Statue',
  },
  buildings: {
    shop: 'General Store', weapons: 'Weapons Hut', tools: 'Tool Hut',
    market: 'Market Hut', bazaar: 'Bazaar', agency: 'Travel Agency', chief: "Chief's Hut",
  },
  sketches: {
    palm: 'Sketch: palm tree', acacia: 'Sketch: acacia', bird: 'Sketch: bird',
    mountain: 'Sketch: mountain', antelope: 'Sketch: antelope', hut: 'Sketch: hut',
    harbor: 'Sketch: harbor', compass: 'Sketch: compass', face: 'Sketch: face',
    grave: 'Sketch: grave',
  },

  health: {
    states: { healthy: 'healthy', weakened: 'weakened', poor: 'in poor condition' },
    fever: 'fever',
    dehydration: 'dehydration',
    sunblind: 'sun blindness',
    woundsLight: 'light wounds',
    woundsSevere: 'severe wounds',
    report: (state, afflictions) =>
      afflictions.length > 0 ? `I feel ${state} (${afflictions.join(', ')}).` : `I feel ${state}.`,
  },

  status: {
    date: 'Date',
    cash: 'Funds',
    provisions: 'Provisions',
    provisionsWeeks: (weeks) => `${weeks} weeks`,
    gifts: 'Gifts',
    region: 'Region',
  },

  hud: {
    journalToggle: 'Journal (Tab)',
    campToggle: 'Camp (C)',
    mapToggle: 'Map (M)',
    useTooltip: 'Click to use it here',
    passiveTooltip: 'Works automatically while you carry it',
    canteenTooltip: 'Canteen water level — refills at fresh water',
    presentTooltip: 'Show it to a village (provokes a reaction)',
    webglFallback: 'Graphics notice: WebGPU is unavailable — the game is running in WebGL 2 compatibility mode.',
    webglFallbackDismiss: 'Got it',
    fps: (fps) => `${fps} FPS`,
    healthBar: 'Health',
    movementPenalty: {
      jungle: 'Slowed by dense jungle — a machete in the pack would clear the way faster.',
      water: 'Swimming is slow and risky — a canoe would cross the water faster and safer.',
      mountain: 'The steep rock slows the climb — a rope makes it safer and faster.',
      canoeOnLand: 'The canoe is dead weight on land and slows me — better left in a camp for long overland stretches.',
    },
    touch: {
      moveStick: 'Move (drag to walk)',
      lookArea: 'Look and zoom (drag to turn, pinch to zoom)',
    },
  },

  prompts: {
    interact: (label) => `Space — ${label}`,
    openCamp: 'C — Open camp',
    enterPlace: (name) => `Space to enter ${name}`,
  },

  labels: {
    talkToElder: 'Talk to the elder',
    oldMan: 'Elder',
    graveDebug: 'Grave (debug)',
    camp: 'Camp',
  },

  journalPanel: {
    title: 'Journal',
    close: 'Close (Tab)',
    readAloud: 'Read aloud',
    stopReading: 'Stop reading',
    voiceLoading: 'Loading voice …',
    voiceError: 'The narration voice could not be loaded.',
    entries: 'Diary',
    observations: 'Overheard',
    observationsHint: 'What I heard them say, and what I take it to mean.',
    hypothesis: 'My reading',
    hypothesisFor: (utterance: string) => `My reading of ${utterance}`,
    firstHeard: (date: string) => `First heard ${date}`,
    firstHeardIn: (date: string, place: string) => `First heard ${date} in ${place}`,
    reopenDrumMessage: "Read the chief's drum message again",
  },

  drumMessage: {
    title: "The Chief's Message on the Drums",
    hint: 'Seven words, one after another. Above each stands my own reading — click one to change it; it is the same note my book holds.',
    readingFor: (utterance: string) => `My reading of ${utterance}`,
    notePlaceholder: 'My reading',
    close: 'Put the message away (Esc)',
  },

  mapOverlay: {
    title: 'Map',
    continent: 'Africa',
    subtitle: 'From the surveys of the expedition · 1890',
    scaleMiles: 'English Miles',
    explored: (region, percent) => `${region}: ${percent}% explored`,
    plan: (place: string) => `Plan of ${place}`,
    close: 'Close (M)',
  },

  loadMenu: {
    title: 'Port Visits',
    port: 'Port city',
    health: 'Health',
    resume: 'Continue',
    back: 'Back',
  },

  stateDump: {
    title: 'Bug Report',
    download: 'State only (JSON)',
    downloadReport: 'Download report',
    copy: 'Copy',
    copied: 'Game state copied to the clipboard.',
    close: 'Close (F6)',
    descriptionLabel: 'What went wrong?',
    descriptionPlaceholder: 'Describe what you saw — what you were doing, and what looked wrong.',
    contents: 'The archive holds the picture, the full game state and your description. Pass it on unopened.',
    saved: 'Bug report saved.',
    report: {
      heading: 'The Heart of Africa — bug report',
      description: 'What went wrong',
      noDescription: '(no description given)',
      environment: 'Environment',
      reproduction: 'Reproduction',
      files: 'Files in this archive',
      pictureNote: 'the 3-D scene, read back from the canvas. It does NOT contain the HUD or any floating label — those are HTML and never enter the picture.',
      pictureMissing: '(no screenshot: the capture failed — the state and the overlay list are still complete.)',
      stateNote: 'the complete game state, balance values and UI state as JSON.',
      wildlifeNote:
        'the section of that same JSON holding the wildlife around the traveller: every animal with its species, position, state and target, every carcass with its remaining seconds and who feeds on it, and every vulture flock with the carcass it owns. Bounded — the section names its radius and its cap, and how many entries were left out.',
      overlayNote: 'every label and HUD element visible at that moment, with its text and its on-screen rectangle — this is where the HUD and the map labels are.',
      duplicateNote: 'Labels sharing a text at overlapping positions',
    },
  },

  benchmark: {
    title: 'Render Benchmark',
    config: (name, index, count) => `Setting ${index}/${count}: ${name}`,
    warmup: 'Warm-up pass (not measured)',
    phase: (name) => `Section: ${name}`,
    phases: {
      savannaStanding: 'Standing in dense savanna',
      desertStanding: 'Standing in empty desert',
      savannaDriving: 'Travelling through the savanna',
    },
    remaining: (time) => `About ${time} left`,
    abortHint: 'Esc aborts the benchmark and restores every setting.',
    doneTitle: 'Benchmark Finished',
    abortedNote: 'The run was aborted — the report covers the completed settings only.',
    headline: {
      gpu: 'Read the GPU column: these are real GPU times from the graphics driver, unaffected by the display refresh rate.',
      cpu: (reason) =>
        `No GPU times available (${reason}), and the frame times are capped by the display refresh rate. Only the CPU column carries information — the graphics card's own cost is not measured in this run.`,
      wall: 'Read the frame column: the frame times are not capped by the display refresh rate here, so they measure the whole frame.',
    },
    download: 'Download report',
    copy: 'Copy',
    copied: 'Benchmark report copied to the clipboard.',
    close: 'Close',
    unavailable: 'The benchmark needs the running 3D view.',
    failed: (message) => `Benchmark aborted: ${message}`,
    lowProfile: {
      title: 'Low-level cost ranking — where to cut next:',
      dominatedBy: (list) => `At the low graphics level the frame is dominated by: ${list}.`,
    },
  },

  toasts: {
    oceanBlocked: 'The ocean is impassable — there is no leaving the continent.',
    mountainNoRopeWarn: 'Without a rope this climb is dangerous — one slip and I fall. Slowly and carefully!',
    penaltyJungle: 'The jungle slows me — a machete in the pack would clear the way.',
    penaltyWater: 'No canoe — I must swim across, slow and soaked.',
    penaltyCanoeLand: 'The canoe slows me on land — better left in a camp for overland travel.',
    valuableAlreadyShown: 'This village has already seen the treasure.',
    boughtFood: 'Bought one week of provisions.',
    bought: (name) => `${name} purchased.`,
    notEnoughMoney: 'Not enough money.',
    digNoShovel: 'I cannot dig without a shovel in hand.',
    villagerNod: 'The old man gives me a friendly nod.',
    drumsSending: 'The chief calls his drummer. The message is going out over the village.',
    journalDndOn: 'Journal interruptions off — entries appear silently.',
    journalDndOff: 'Journal interruptions on — new entries open the journal.',
    graphicsLevel: {
      low: 'Graphics: Low — leanest effects for the highest framerate.',
      medium: 'Graphics: Medium — the balanced default.',
      high: 'Graphics: High — the richest effects.',
    },
    debugLoadout: 'Debug: full loadout — everything in the pack, funds and provisions maxed, in perfect health.',
    debugCanoeOn: 'Debug: canoe added to the pack.',
    debugCanoeOff: 'Debug: canoe removed.',
    noMedicine: 'I have no medicine left.',
    medicineNotNeeded: 'I am neither feverish nor wounded — I shall save the medicine.',
    inventoryFull: 'My pack is full — I cannot carry any more.',
    discovered: (name) => `Discovered: ${name}. The geographic society will pay for this report.`,
    sold: (name, amount) => `${name} sold for ${amount} $.`,
    soldForGifts: (name, count) => `${name} sold for ${count} ${count === 1 ? 'gift' : 'gifts'}.`,
    notEnoughGifts: 'Not enough gifts — money means nothing here.',
    bazaarRejected: (name) => `The merchant waves it away — ${name.toLowerCase()} is not traded here.`,
    graveyardEmpty: 'The bleached bones hold no more ivory worth taking.',
    chiefHostile: 'The village has not forgotten my offense. The chief refuses to see me.',
    regionShunned: 'Word of my robbery has spread — no hut of this region will open to me again.',
    campPitched: 'Camp pitched — an X on my map marks the spot.',
    campNeedsFriend: 'Only an Honored Friend of this region may leave belongings in the village.',
    positionReport: (coords, region) => `By my reckoning: ${coords} — the ${region} region.`,
    orientationGained: 'In thanks for the gift, they point out the important buildings to me.',
  },

  dialogs: {
    tradeGreeting: '"Welcome, traveler! Have a look around — finest goods, honest prices."',
    tradeGreetingVillage: '"Be welcome, stranger. Money is nothing to us — offer gifts, and we will trade."',
    cash: 'Funds',
    giftsHeld: 'Gifts',
    priceGifts: (n) => `${n} ${n === 1 ? 'gift' : 'gifts'}`,
    sellHeader: 'Sell your gear:',
    sell: 'Sell',
    buy: 'Buy',
    leave: 'Leave (Esc)',
    foodItem: 'Provisions (1 week)',
    gift: (name) => `Gift: ${name}`,
    audienceTitle: (people) => `Audience with the Chief of the ${people}`,
    audienceIntro: (mood) => `In the half-dark of the chief's hut, the chief sits upon carved wood. ${mood}`,
    moodHigh: 'The chief regards you with great goodwill.',
    moodMid: 'The chief seems well-disposed toward you.',
    moodLow: 'The chief studies you, giving nothing away.',
    chiefDone: '"I have told you all I know. May your path be blessed."',
    askDrums: 'Ask him to send his message on the drums',
    askDrumsLocked: 'He has a message to send, he lets me know — but not to a stranger who has brought his people nothing.',
    artefactCarried: 'The thing from the foot of the great rock, still wrapped in river clay',
    handArtefact: 'Lay it in his hands',
    chiefAcknowledges: 'He turned it over once, and said:',
    give: 'Offer',
    stock: (n) => `you have ${n}`,
    endAudience: 'End audience (Esc)',
    rob: 'Draw the rifle and rob',
    robConfirm:
      'Rob this village at rifle point? This antagonizes the whole region for good — no more audiences, hints or aid, and any "Honored Friend" standing is lost forever.',
    robConfirmYes: 'Yes, rob them',
    robCancel: 'No, stand down',
    robOrphansGoal:
      'Beware: only this region can still teach you a bearing to the tomb that you have not yet learned. Rob it, and that knowledge is lost for good — the grave may become impossible to find.',
    bazaarGreeting: '"Treasures, effendi! Show me what the wilderness yielded — or take a piece home yourself."',
    bazaarSell: 'Offer a find:',
    bazaarBuy: 'For sale:',
    offer: 'Offer',
    bid: (name, amount) => `The merchant bids ${amount} $ for the ${name.toLowerCase()}.`,
    accept: 'Accept',
    decline: 'Decline',
    agencyGreeting: '"Passages to every port of the continent — swift ships, honest fares."',
    passage: (dest, days) => `Passage to ${dest} (~${days} days)`,
    book: 'Book',
    campTitle: 'Camp',
    villageCampTitle: 'Village Cache',
    campHint: 'Anything left here lightens the pack — but an unguarded camp may be looted.',
    villageCampHint: 'The villagers guard these belongings as their own. Nothing stored here is ever lost.',
    campPack: 'In my pack:',
    campContents: 'Stored here:',
    campEmpty: 'Nothing is stored here.',
    campStore: 'Store',
    campTake: 'Take',
  },

  overlays: {
    title: 'The Heart of Africa',
    victoryText: (days) =>
      `You have found the tomb of the great king and brought its treasure to light. After ${days} days of travel through desert and wilderness, the expedition is complete. Your name will be spoken in the same breath as the great explorers.`,
    remainsReport: (cause, days) =>
      `A caravan has found the remains of the explorer — a gruesome sight. All signs suggest that ${cause}. The journal, ${days} days of hopes and hardships, ends here.`,
    deathCauses: {
      starvation: 'hunger wore him down until he could go no farther',
      fever: 'the fever consumed him far from any help',
      dehydration: 'he perished of thirst under the desert sun',
      sunblind: 'sun-blind, he wandered in circles until the desert took him',
      wounds: 'he succumbed to his wounds',
      eaten: 'wild beasts got the better of him — little was left to bury',
    },
    deadlineExpired: (days) =>
      `The financiers' patience is exhausted: after ${days} days without the tomb, the expedition is recalled. The Heart of Africa keeps its secret.`,
    successor: 'A successor takes over',
    newExpedition: 'New Expedition',
    checkpointFound: 'A saved game was found — your checkpoint from the last port city.',
    loadCheckpoint: 'Load checkpoint',
  },

  debug: {
    title: 'Debug Menu (F1)',
    filter: 'Filter',
    filterHint: 'narrow …',
    filterEmpty: 'No control matches.',
    groups: {
      movement: 'Movement and controls',
      travel: 'Time and travel',
      survival: 'Health, water and provisions',
      wildlife: 'Wildlife and its dramas',
      settlement: 'Settlement life',
      weather: 'Weather and season',
      economy: 'Economy and trade',
      events: 'Random events and triggers',
      graphics: 'Graphics and sound',
      jump: 'Jump targets',
      tools: 'Tools',
    },
    renderer: 'Renderer',
    language: 'Language',
    travelSpeed: 'Travel speed (overland)',
    walkSpeed: 'Walk speed (in places)',
    strafeFactor: 'Strafe/backward factor',
    walkerUnstuck: 'Inhabitant unstuck (s)',
    placeCollisionFactor: 'Settlement collision (share of enter radius)',
    startupFreezeBudget: 'Loading-picture freeze budget (ms)',
    labelOverlayMax: 'Ctrl labels (max.)',
    mouseSensitivity: 'Mouse sensitivity (first-person)',
    lookPitchLimit: 'Look up/down limit (°)',
    invertLook: 'Invert mouse look',
    ambienceVolume: 'Ambience volume',
    footstepVolume: 'Footstep volume',
    ambientVolume: 'Other ambient volume',
    birdsongVolume: 'Birdsong volume',
    surfNearRadius: 'Surf full within (°)',
    surfCutoff: 'Surf silent beyond (°)',
    speechSyllable: 'Speech: syllable length (s)',
    speechPhrasePause: 'Speech: pause between words (s)',
    speechHearingRadius: 'Speech: hearing radius',
    speechHearingFalloff: 'Speech: falloff sharpness',
    speechLabelSeconds: 'Speech: note above the head (s)',
    speechPitch: 'Speech: pitch of the low tone (Hz)',
    speechPitchInterval: 'Speech: high tone above the low one (×)',
    speechVolume: 'Speech: volume of the spoken syllables',
    speechLabelHeadroom: 'Speech: gap above the head (m)',
    speechConceptLabels: 'Speech: show concepts instead of syllables',
    tagChildCount: 'Tag: children playing',
    tagSprintSpeed: 'Tag: chaser sprint (m/s)',
    tagRunnerBoost: 'Tag: runner speed factor',
    tagTrotFactor: 'Tag: trot pace (of sprint)',
    tagRecoverFactor: 'Tag: recovery pace (of sprint)',
    tagFloorFactor: 'Tag: slowest pace (of sprint)',
    tagDrain: 'Tag: reserve spent per second',
    tagRecover: 'Tag: reserve refilled per second',
    tagBreakOff: 'Tag: break off below reserve',
    tagResume: 'Tag: run again above reserve',
    tagPressure: 'Tag: runner flees within',
    tagReach: 'Tag: chaser presses within',
    tagCommit: 'Tag: chaser commits within',
    tagCatch: 'Tag: catch distance',
    tagSwitchMargin: 'Tag: quarry switch margin',
    tagImmunity: 'Tag: immunity after a catch (s)',
    tagResolveCap: 'Tag: give-up cap per chaser (s)',
    tagIdle: 'Tag: break between rounds (s)',
    tagTrendTau: 'Tag: gap trend smoothing (s)',
    tagTrendEnter: 'Tag: start a burst below trend',
    tagTrendLeave: 'Tag: end a burst above trend',
    tagVariation: 'Tag: per-child spread',
    tagUnstuck: 'Tag: child unstuck window (s)',
    tagLean: 'Tag: forward lean at sprint (rad)',
    tagTurnRate: 'Tag: body turn rate (rad/s)',
    tagPlayRadius: 'Tag: play ground radius',
    childSpeechInterval: 'Children: seconds between utterances',
    childSpeechSpread: 'Children: spread of that interval',
    childSpeechAction: 'Children: action lasts (s)',
    childSpeechPace: 'Children: errand pace (m/s)',
    childSpeechRefusal: 'Children: chance a call is refused',
    childSpeechReply: 'Children: answer window (s)',
    adultErrandInterval: 'Adults: seconds between errands',
    adultErrandSpread: 'Adults: spread of that interval',
    adultErrandDwell: 'Adults: stay at the errand (s)',
    adultErrandDig: 'Adults: digging lasts (s)',
    adultErrandLife: 'Adults: errand gives up after (s)',
    adultErrandStall: 'Adults: release an errand going nowhere after (s)',
    adultErrandSilence: 'Adults: alarm when nobody speaks for (s)',
    adultErrandPace: 'Adults: errand pace (m/s)',
    adultErrandCount: 'Adults: villagers running errands',
    separationRadius: 'Inhabitants: body radius',
    separationSlop: 'Inhabitants: overlap tolerated (m)',
    separationStiffness: 'Inhabitants: separation damping',
    separationSpeed: 'Inhabitants: push speed (m/s)',
    separationWedge: 'Inhabitants: wedge escape after (s)',
    foodPerDay: 'Food use per day (0 = infinite)',
    canteenDrain: 'Water use per day (land)',
    canteenDesertDrain: 'Water use per day (desert)',
    canteenCapacity: 'Canteen capacity',
    woundHealLight: 'Light wound heals (days)',
    woundHealSevere: 'Severe wound eases (days)',
    daysPerUnit: 'Days per travel unit',
    canoeSpeedup: 'Canoe speed factor (water)',
    junglePenalty: 'Jungle penalty factor (no machete)',
    riverWidthFactor: 'River width factor (applies on reload)',
    riverMouthSlackDeg: 'River mouth slack water in degrees (applies on reload)',
    drownSeconds: 'Drowning: seconds in a strong current',
    wetFlowFactor: 'Drowning: wet-season current factor',
    vigilPredatorDelay: 'Vigil: seconds until a predator is drawn',
    rescueBurst: 'Parent rescue burst (factor)',
    calfFraction: 'Juvenile fraction per herd',
    calfFollowRadius: 'Calf leash radius',
    calfGambolRange: 'Calf play range',
    calfGambolBout: 'Calf play bout (s)',
    crocStrikeRadius: 'Crocodile: bank strike radius',
    crocAmbushBankBand: 'Crocodile: ambush bank band',
    crocMouthOffset: 'Crocodile: mouth anchor offset',
    juvenilePreyBias: 'Juvenile prey preference',
    juvenileDrinkCrocBias: 'Crocodile: drinking-juvenile preference',
    calfAdoptionRadius: 'Orphan adoption radius',
    calfEscapeSeconds: 'Freed calf escape run (s)',
    calfReunionSeconds: 'Calf separation window (s)',
    calfMourningSeconds: 'Orphan mourning window (s)',
    fightDispositionRate: 'Fight: base disposition rate',
    fightDispositionInterval: 'Fight: disposition roll interval (s)',
    fightSeekRadius: 'Fight: opponent search radius',
    fightContactRadius: 'Fight: contact radius',
    fightDriveOffDistance: 'Fight: drive-off distance',
    fightApproachSeconds: 'Fight: approach deadline (s)',
    fightClashSeconds: 'Fight: clash duration (s)',
    fightClashIntensity: 'Fight: clash pose intensity',
    fightApproachBurst: 'Fight: approach speed factor',
    fightQuarryFleeFactor: 'Fight: quarry flee speed share',
    fightLethalityScale: 'Fight: lethality scale',
    fightCooldownSeconds: 'Fight: cooldown after a bout (s)',
    benchmarkStart: 'Start the render benchmark',
    crocDragSpeed: 'Crocodile: drag-into-water speed',
    crocDragSeconds: 'Crocodile: drag deadline (s)',
    crocGripSeconds: 'Crocodile: grip deadline (s)',
    crocDriveOffRest: 'Crocodile: rest after being driven off (s)',
    huntLeaveOvertime: 'Hunt: walk-off overtime (s)',
    waterCrossMax: 'Water crossing: max width',
    waterCrossChance: 'Water crossing: chance',
    seasonStrength: 'Seasonal weather strength',
    wetGroundStrength: 'Wet ground strength',
    edgeBandWidth: 'Settlement edge: width (m)',
    edgeBandWander: 'Settlement edge: wander (m)',
    edgeBandStrength: 'Settlement edge: strength',
    bankWadeDepth: 'River bank: wading depth (m)',
    bloodStainSize: 'Blood stain: size',
    bloodStainIrregularity: 'Blood stain: ragged outline',
    season: 'Season (weather)',
    seasonAuto: 'From the calendar',
    seasonDry: 'Dry season',
    seasonMid: 'Transition',
    seasonWet: 'Rainy season',
    mountainPenalty: 'Mountain penalty factor (no rope)',
    foodUnitDays: 'Provisions per food unit (days)',
    oceanSwimMargin: 'Swimmable coastal band (°)',
    digRadius: 'Dig radius',
    goodwillForHint: 'Goodwill required for hint',
    randomEvents: 'Random events',
    triggerEvent: 'Trigger event:',
    eventNames: {
      lionAttack: 'Lion attack', cheetahAttack: 'Cheetah attack', leopardAttack: 'Leopard attack',
      hyenaAttack: 'Hyena attack', snakeBite: 'Snake bite',
      robberAttack: 'Robbers', crocodileAttack: 'Crocodile', fever: 'Fever',
      sunblindness: 'Sun blindness', sandstorm: 'Sandstorm', waterfallSweep: 'Swept over falls',
      findRemains: 'Find remains',
    },
    stageEvent: 'Stage event:',
    stageGroups: {
      wildlife: 'Wildlife dramas',
      random: 'Random events',
      hazards: 'Traveller hazards',
    },
    dramaNames: {
      calfDrowning: 'Calf swept into the water',
      calfMired: 'Calf mired at the waterhole',
      crocodileAmbush: 'Crocodile ambush',
      elephantMourning: 'Elephants mourn a herd-mate',
      elephantTrample: 'Elephant tramples an animal',
      grassFire: 'Grass fire on the steppe',
      huntCalf: 'Predator hunts a calf',
      huntGeneric: 'Predator hunts a grazer',
      intraspeciesFight: 'Two of a kind fight it out',
      lionCubDefence: 'Hyena at a lion cub',
      vultureFlock: 'Vultures over a carcass',
    },
    hazardNames: {
      mountainFall: 'Fall while climbing',
    },
    stageFailures: {
      noScene: 'Only out on the journey — no wildlife here.',
      noSavanna: 'No savanna nearby — move onto open grassland.',
      noWater: 'No water nearby — move closer to a river or lake.',
      noPrey: 'No suitable animal nearby — travel until game is in sight.',
      noCalf: 'No calf nearby — travel until a herd with young is in sight.',
      noCub: 'No lion cub nearby — lionesses raise their young on the savanna.',
      noElephant: 'No elephant herd nearby.',
      noFightPair: 'No two rivals of one kind nearby — travel until a herd is in sight.',
    },
    showHidden: 'Show hidden objects',
    fpsCounter: 'FPS counter',
    traa: 'TRAA (temporal anti-aliasing)',
    ssao: 'SSAO (ambient occlusion)',
    shadowMapHalf: 'Half-resolution shadows',
    shadows: 'Sun shadows',
    detailLevel: 'Graphics detail (F9)',
    detailLow: 'Low',
    detailMedium: 'Medium',
    detailHigh: 'High',
    fireShadows: 'Campfire shadows',
    flatGround: 'Flat ground (debug)',
    foliageCollapse: 'Dry-season foliage collapse (debug)',
    health: 'Health',
    wheelZoom: "Allow zooming out beyond default (bird's-eye)",
    journalDnd: "Don't interrupt with journal entries (F2)",
    cash: 'Funds ($)',
    foodDays: 'Food (days)',
    jumpTo: 'Jump to:',
    jumpGroups: {
      ports: 'Ports',
      villages: 'Villages',
      monuments: 'Monuments',
      mountains: 'Mountains',
      waterfalls: 'Waterfalls',
      lakes: 'Lakes',
      cultural: 'Cultural landmarks',
      natural: 'Natural sites',
      other: 'Other',
    },
    choose: 'select …',
    grave: 'Grave',
    addEquipment: 'Add equipment:',
    addGift: 'Add gift:',
    addTreasure: 'Add treasure:',
    giftsTotal: 'Gifts (count)',
    inventoryCapacity: 'Inventory capacity',
  },

  journal: {
    titles: {
      departure: 'Departure',
      region: (p: TextParams) => `Region: ${en.regions[p.region as keyof typeof en.regions]}`,
      arrival: (p: TextParams) => `Arrival in ${PLACES[p.place as string]}`,
      portReturn: (p: TextParams) => `${PLACES[p.place as string]} Once More`,
      village: (p: TextParams) => PLACES[p.place as string],
      villageReturn: (p: TextParams) => `Back in ${PLACES[p.place as string]}`,
      monument: (p: TextParams) => PLACES[p.place as string],
      monumentReturn: (p: TextParams) => `${PLACES[p.place as string]} Once More`,
      audience: 'Audience with the Chief',
      mistake: 'A Grave Mistake',
      chiefHint: "The Chief's Words",
      drumMessage: 'The Drums Speak',
      rockArtefact: 'At the Foot of the Great Rock',
      artefactGiven: 'Into the Hands of the Chief',
      decoded: 'Deciphered!',
      unspecific: 'Vague Murmurs',
      giftLore: 'What the People Revere',
      language: (p: TextParams) => `The Language of the ${en.regions[p.region as keyof typeof en.regions]}`,
      victory: 'The Heart of Africa',
      foodLow: 'Provisions Running Low',
      foodOut: 'Provisions Exhausted',
      dehydration: 'Thirst',
      recovery: 'Recovery',
      healthPoor: 'At the End of My Strength',
      attack: 'Attacked!',
      robbery: 'Robbers',
      fever: 'Fever',
      sunblind: 'Blinded by the Sun',
      sandstorm: 'Sandstorm',
      sweptAway: 'Swept Away',
      mountainClimb: 'Into the Mountains Without a Rope',
      penaltyJungle: 'Fighting Through the Jungle',
      penaltyWater: 'Into the Water',
      penaltyCanoeLand: 'The Canoe on Land',
      dangerUnarmed: 'Wilds Without a Rifle',
      dangerDesert: 'The Blaze of the Desert',
      dangerWater: 'Crocodiles Lie in Wait',
      dangerWetland: 'Fever in the Thicket',
      mountainFall: 'A Fall',
      landmarkDiscovered: (p: TextParams) => {
        const name = en.landmarks[p.landmark as keyof typeof en.landmarks]
        const titles: Record<string, string> = {
          mountain: `${name} in Sight`,
          falls: `The Thunder of ${name}`,
          lake: `An Inland Sea: ${name}`,
          grave: 'Where the Elephants Die',
          pyramids: `The Pyramids of ${name}`,
          'giza-pyramids': `The Great Pyramids of ${name}`,
          'stone-city': `The Stone Walls of ${name}`,
          'rock-churches': `The Rock Churches of ${name}`,
          'coastal-ruins': `The Ruins of ${name}`,
          stelae: `The Stelae of ${name}`,
          castles: `The Castles of ${name}`,
          'cliff-dwellings': `The Cliffs of ${name}`,
          crater: `The Green Caldera: ${name}`,
          volcano: `The Smoking Mountain: ${name}`,
          delta: `A River Lost in the Sands: ${name}`,
          wetland: `The Great Swamp: ${name}`,
        }
        return titles[p.kind as string] ?? `${name} in Sight`
      },
      discovery: 'A Grim Discovery',
      deadline1: 'A Letter from the Financiers',
      deadline2: 'The Final Warning',
      successor: 'A New Hand',
      treasure: (p: TextParams) => {
        const name = p.treasure ? en.treasures[p.treasure as keyof typeof en.treasures] : undefined
        return name ? `${name} from the Earth` : 'Ivory Among the Bones'
      },
      bounty: 'The Bounty of Discovery',
      ferry: 'Passage by Sea',
      valuableReaction: 'The Valuable in My Hand',
      friend: 'An Honored Friend',
      rescue: 'Saved by the Villagers',
      friendSupplies: 'Guests of the Region',
      robberyCommitted: 'A Deed Beyond Forgiving',
      campLooted: 'The Looted Camp',
    },
    start:
      'Cairo, January 1890. [excited]Today my expedition begins.[/excited] With 250 dollars in my pocket, a bundle of trade gifts, and more hope than sense, I mean to find the Heart of Africa — [awe]the fabled tomb of the great king.[/awe] [breath][somber]May fortune walk with me.[/somber]',
    regionEntry: (p: TextParams) => {
      const texts: Record<string, string> = {
        north:
          '[awe]The desert![pause] A sea of sand and light as far as the eye can reach.[/awe] The heat shimmers above the dunes, and yet I feel a strange exaltation. [pause]They say the peoples of the North read direction from the origin of the wind. [somber]I shall have to learn their words first.[/somber]',
        west:
          'Endless savanna, [awe]golden in the evening light.[/awe] Umbrella acacias stand like sentinels across the vastness, and far off the herds are moving. [excited]The West receives me with a feeling of freedom[/excited] — and a suspicion that different words for the points of the compass hold sway here.',
        central:
          '[fear]The jungle has swallowed me whole.[/fear] Green twilight, the shrieking of birds, air so damp it settles on the chest like a wet cloth. [weary]Without a machete I can scarcely advance a step.[/weary] [breath][somber]Everything here is life,[pause] and everything is danger.[/somber]',
        east:
          'Mountains and lakes so clear that the sky mirrors itself in them. [awe]In the East, snow-capped summits rise above the clouds —[pause] what a sight, in the very middle of Africa![/awe] The peoples here measure the world from places they call [emph]"Odabi"[/emph].',
        south:
          'The high plateau of the South. [pause]Cool, clear air after all that heat, wide grassland beneath an immense sky. The people here, so it is said, speak of seasons when they mean directions. [pause][awe]What a curious land this is.[/awe]',
      }
      return texts[p.region as string]
    },
    portArrival: (p: TextParams) =>
      `I have reached ${PLACES[p.place as string]}. [excited]The clamor of the harbor, the cries of the traders, the smell of salt and spices[/excited] — here I can replenish my stores and gather my strength. [pause]My notes are safely put away. [mute](Checkpoint saved)[/mute]`,
    // The first entry into a port (point 394): what the traveller actually sees
    // on arriving at THAT city in ~1890 — Khartoum a ruin opposite the Khalifa's
    // Omdurman, Timbuktu a mud town in the sand, Boma a bolted-together station.
    // Berbera reads its documented fair season (docs/peoples-1890.md §4.0.2).
    portFirstVisit: (p: TextParams) => {
      const name = PLACES[p.place as string]
      const texts: Record<string, string> = {
        cairo: `The gates of Cairo, and the din of them. [excited]Donkey-boys bawling for a fare, dragomans hawking themselves in half a dozen tongues, the covered lanes of the Muski so narrow that two laden camels stop the whole street.[/excited] [awe]Above the roofs stand the minarets of the Citadel, and beyond them a brown line of desert where the pyramids are.[/awe] [somber]English officers take their coffee in the Ezbekiyeh gardens as though the country belonged to them.[/somber]`,
        tangier: `[awe]Tangier is white — a heap of lime-washed cubes climbing the hillside, the Kasbah and the Sultan's flag above them.[/awe] There is no quay: the steamer anchored out in the bay, Moorish boatmen rowed us through the swell and carried us the last few yards ashore on their shoulders. [pause]Outside the walls the great market spreads over the hill, grain and charcoal and country people down from the Rif. [somber]The consulates of half Europe watch one another along a single street; Morocco is still the Sultan's, and everyone here is waiting.[/somber]`,
        khartoum: `[somber]Khartoum is a ruin.[/somber] Since the city fell and Gordon died on the palace stair, its bricks have been ferried over the water to build the Khalifa's own town at Omdurman; grass stands in the streets where the consulates were. [pause][awe]Below the point the two Niles meet — the Blue running dark and swift against the pale White — and the whole traffic of the Sudan crosses at the ferry.[/awe] [fear]I am tolerated here. That is the whole of my standing.[/fear]`,
        'st-louis': `[awe]St. Louis lies on its long island in the river mouth, and it is the most French thing I have found in Africa:[pause] two-storeyed houses with iron balconies, streets laid out with a ruler, the tricolour over the governor's residence.[/awe] A bridge of boats crosses to the mainland, and the rails run from here down to Dakar. [excited]In the sheds along the quay the whole gum of the Senegal is weighed and sacked,[/excited] and the signares of the old merchant families keep house in a style I had not looked for at this latitude.`,
        timbuktu: `[somber]Timbuktu — and I must set it down honestly: the golden city of the books is a town of grey mud.[/somber] The sand has come in among the houses, whole quarters stand empty, and the market here is a poor thing beside Jenne's. [awe]Yet the great mosques stand, Djinguereber's tower of mud and jutting timbers above every flat roof,[pause] and the salt still comes down from Taoudenni in slabs the length of a man, forty days out of the desert.[/awe] [fear]The Tuareg take their toll of the town as they please; there is no other law in it.[/fear]`,
        lagos: `[fear]Lagos is entered over the bar,[/fear] and the bar nearly had us: the steamer lay off in the swell and surf-boats brought us through the broken water with the Kru men singing the stroke. [pause][awe]Behind it the lagoon opens out as calm as a mill pond, and the town lies along it — the British flag, roofs of corrugated iron, and a whole quarter built by the freedmen home from Bahia, with shutters and stucco out of Pernambuco.[/awe] [somber]Everything here smells of palm oil, and everything here is reckoned in puncheons of it.[/somber]`,
        boma: `[somber]Boma is not a city; it is a station.[/somber] A row of iron houses shipped out in pieces and bolted together on the bank, a flagstaff with the blue banner and its gold star, and the mangrove crowding up to the clearing on either hand. [pause][awe]The Congo goes past a good two leagues wide, brown and silent, and the sea is still sixty miles down it.[/awe] [fear]In the sheds the ivory lies stacked like cordwood, and nobody says aloud what it cost to bring down.[/fear] [weary]The fever has thinned the staff here; I am warned not to sleep near the water.[/weary]`,
        berbera:
          p.situation === 'deserted'
            ? `[somber]Berbera in the hot months is a name on a shore.[/somber] The mat town of the fair has been carried away bundle by bundle on the camels that brought it; there remain a few stone houses, the wells, and the burnt ground where twenty thousand people camped the winter through. [fear]A man at the well told me quite calmly that the lions come down to drink there now.[/fear] [weary]The karif comes off the hills like a breath from an oven, and what trade there is happens in the shade and half in a whisper.[/weary]`
            : `[excited]Berbera in its season is a city of matting.[/excited] Thousands of huts of mats and boughs have gone up along the shore, and the caravans are in from the Ogaden and from Harar — camels by the hundred, sheep in flocks that cover the beach, hides, gum, ostrich feathers, coffee in plaited baskets. [awe]Dhows lie out in the roads waiting on the wind for Aden.[/awe] [somber]Not a soul here believes any of it is permanent, and they are right.[/somber]`,
        zanzibar: `[awe]Zanzibar is smelled before it is seen — cloves, on the wind, a good way out.[/awe] The harbour is a forest of dhow masts; the Sultan's palace and the great new house of wonders stand along the front with their tiers of iron balconies, and behind them the stone town closes into lanes where two men can barely pass, every door carved and studded like a strong-box. [pause]Here the caravans of the whole mainland are fitted out — porters, cloth, beads, coils of wire — and every consul on this ocean keeps his agent. [somber]The market where men were sold has been shut these seventeen years; the trade itself has only moved inland.[/somber]`,
        capetown: `[awe]Table Mountain stands over the town like a wall with its cloth laid out on it,[/awe] and after the Africa I have come through, Cape Town is a shock: gas lamps, oak avenues, a dock full of mail steamers, and Adderley Street talking of nothing but diamonds and the new gold on the Rand. [pause]Above the town the Malay quarter keeps its own hours and its own call to prayer. [somber]The rails run from here to Kimberley and further every year; what is settled in this street is felt a thousand miles north of it.[/somber]`,
      }
      const text =
        texts[p.place as string] ??
        `I have reached ${name}. [excited]The harbour, the cries of the traders, the smell of salt and tar[/excited] — a place to set my stores in order before going on.`
      return `${text} [pause]My notes are safely put away. [mute](Checkpoint saved)[/mute]`
    },
    // Re-entering a port whose situation has changed (point 394): only the
    // change is described. Berbera's fair season is the one modelled today.
    portReturn: (p: TextParams) => {
      const transitionKey = `${p.fromSituation as string}_${p.toSituation as string}`
      const texts: Record<string, Record<string, string>> = {
        berbera: {
          fair_deserted: `[somber]Berbera has emptied since I stood here last.[/somber] The whole town of matting is gone — carried off bundle by bundle on the camels that brought it — and the shore where the caravans lay is bare burnt ground. [pause][fear]At the well they told me, without any particular alarm, that the lions come down to drink there in this season.[/fear]`,
          deserted_fair: `[excited]Berbera has filled up again.[/excited] Where I walked over empty ground there stands a mile of huts of mats and boughs, camels in from the Ogaden by the hundred, and the hides and gum piled ready for the dhows to Aden. [pause][awe]It is the same shore, and I would not have known it.[/awe]`,
        },
      }
      const text =
        texts[p.place as string]?.[transitionKey] ??
        `[somber]${PLACES[p.place as string]} is not the town I left.[pause] What has changed here since my last visit stands plainly in the streets.[/somber]`
      return `${text} [pause]My notes are safely put away. [mute](Checkpoint saved)[/mute]`
    },
    // Arrival at a walkable monument site (point 394; research: docs/giza-1890.md):
    // the PERIOD picture, not the modern postcard — Khufu's broken apex, Khafre's
    // pale casing cap, the Sphinx buried to the shoulders — and the Nile flood of
    // the visit date, which before the dam made the plateau an island every autumn.
    monumentFirstVisit: (p: TextParams) => {
      const flood = p.situation === 'flood'
      const texts: Record<string, string> = {
        giza: flood
          ? `[awe]The inundation is out, and the pyramids stand on an island.[/awe] From the desert edge I looked back over a sheet of brown water reaching to the palms of Cairo, the causeway across it like a dike and every village sitting up on its mound. [pause][awe]Khufu is a mountain of tawny steps with its apex broken off flat; Khafre beside it still carries a pale smooth cap of its old casing near the peak,[pause] as though a second and finer summit had been set upon the first.[/awe] [somber]Of the Sphinx only the head and a little of the breast stand clear — paws, body and enclosure lie under the sand, and the face has been noseless these many centuries.[/somber] [pause]The donkey-boys of the hotel take their fares out by boat in this season, and are none the poorer for it.`
          : `[awe]I stood at last beneath the Great Pyramid, and no engraving prepares a man for it:[pause] a mountain of tawny steps, the apex broken off flat, the courses so deep that one must be hauled up each of them.[/awe] Khafre beside it carries a pale smooth cap of its old casing near the peak, [emph]as though a second and finer summit had been set upon the first.[/emph] [pause][somber]Of the Sphinx only the head and a little of the breast are free; the paws, the body and the whole enclosure lie under the sand, and the face has been noseless these many centuries.[/somber] [pause]Below the plateau the fields lie dry and cracked, and Cook's people ride up from the hotel on donkeys while the guides quarrel over them for backsheesh.`,
      }
      return (
        texts[p.place as string] ??
        `[awe]I have reached ${PLACES[p.place as string]}, and stood a long while before it without writing anything down.[/awe] [pause]Some things are older than any account of them.`
      )
    },
    // Re-entering a monument site in a changed situation (point 394).
    monumentReturn: (p: TextParams) => {
      const transitionKey = `${p.fromSituation as string}_${p.toSituation as string}`
      const texts: Record<string, Record<string, string>> = {
        giza: {
          lowWater_flood: `[awe]I came back to Giza in the flood, and the plateau has become an island.[/awe] The cracked fields I walked over are a brown lake to the horizon, the causeway stands out of it like a dike, and the boats come up to the desert edge where the donkeys used to wait. [pause][somber]Not a stone has moved, and the whole place stands differently for the water.[/somber]`,
          flood_lowWater: `[somber]The water has gone off the land since I was here.[/somber] Where I saw a lake between the city and the plateau there is black cracked mud going green at the edges, oxen turning at the water-wheels, and the causeway an ordinary road again. [pause][awe]The pyramids look larger over dry fields than they did over the flood — there is nothing left between them and the eye.[/awe]`,
        },
      }
      return (
        texts[p.place as string]?.[transitionKey] ??
        `[somber]I came back to ${PLACES[p.place as string]}, and the season has changed the place more than the years have.[/somber]`
      )
    },
    villageFirstVisit: (p: TextParams) => {
      const name = PLACES[p.place as string]
      // Each people's village reads like its ~1890 self (design.md §16) —
      // and the rinderpest years are date-dependent (point 133): the plague
      // phase of the visit date picks the Maasai and Sidama vignette. The
      // struck text follows Baumann's period eyewitness account (1892).
      const phase = (p.phase as string) ?? 'clean'
      const texts: Record<string, string> = {
        tuareg: `I have reached the ${name} — a camp of the blue-veiled riders of the desert. [awe]Low tents of hide, camels couched in the sand, and men whose faces are wrapped in indigo cloth —[pause] among the Tuareg it is the men who go veiled, not the women.[/awe] Their salt caravans cross the emptiness for weeks. [somber]The chief receives strangers in the great tent.[/somber]`,
        berbers: `I have reached the ${name}, high against the Atlas. [awe]Flat-roofed houses of stone and clay climb the hillside in terraces,[pause] walnut groves stand along the stream,[/awe] and at the looms the women weave carpets brighter than any I could carry home. The headman's house sits above the terraces.`,
        nubians: `I have reached the ${name} on the great river. [awe]The houses are painted with bold patterns around their doors,[pause] date palms lean over the bank, and the waterwheel creaks as it lifts the Nile onto the narrow terraces.[/awe] [somber]But this is a frontier now: soldiers watch the river road south, and men speak low of the Khalifa's dominion beyond,[pause] and of the hunger year that emptied the herds not long ago.[/somber] [somber]They say the pyramids of ancient kings stand not far from here —[pause] this land is older than any of it.[/somber]`,
        bambara: `I have reached the ${name}. [awe]Granaries of banked clay stand on stilts like great sealed jars,[pause] millet fields run to the horizon,[/awe] and over the doorways are carved antelope figures — the spirit, they tell me, that first taught men to farm. The chief's compound lies at the village heart.`,
        hausa: `I have reached the ${name}, a walled town of the Sahel. [excited]Dye pits full of indigo steam by the gate, leatherworkers cut and stamp their famous red hides,[pause] and horsemen in quilted armor clatter through a market that outshouts the birds.[/excited]`,
        mandinka: `I have reached the ${name}. [awe]From the shade rings the kora — twenty-one strings over a gourd —[pause] and a griot sings the lineage of kings entirely from memory.[/awe] Kola nuts pass from hand to hand in greeting; I was offered one, and took it gratefully.`,
        fang: `I have reached the ${name}, a clearing won from the forest. [awe]Long houses walled with sheets of bark stand in ordered rows,[pause] and the carvers here shape figures of dark wood whose calm gaze, they say, guards the relics of the ancestors.[/awe] [somber]Crossbows hang ready beside the doors.[/somber]`,
        mongo: `I have reached the ${name}, deep in the river forest. [awe]Cloth woven from raffia palm dries between the huts,[pause] fish weirs of plaited cane span the stream,[/awe] and gardens of plantain have been wrested from the jungle's edge. The elders gather by the chief's hearth.`,
        mbuti: `I have reached the ${name}, a camp of the forest people. [awe]Dome huts bent from saplings and broad leaves,[pause] hunting nets slung between the trees, and everywhere the smell of woodsmoke and wild honey.[/awe] [somber]They read this forest as I read my maps —[pause] and far better.[/somber]`,
        banda: `I have reached the ${name}. [awe]The ring of hammers carries from the furnaces — the smiths here draw fine iron from the ore of their hills —[pause] and by the meeting hall stand slit drums taller than a man, whose voices, they say, speak across the bush for miles.[/awe]`,
        bambundu: `I have reached the ${name}, gathered beneath a mighty baobab. [awe]Old trade paths run from this place down to the coast,[/awe] [somber]and the elders still tell of the warrior queen who defied the Portuguese for a whole lifetime.[/somber] The chief holds court in the shade of the great tree.`,
        lunda: `I have reached the ${name}. [awe]Courtly manners rule here:[pause] every greeting has its proper form, every rank its place on the mat.[/awe] They speak with reverence of the Mwata Yamvo, whose court lies far to the east, [pause]and crosses of copper pass through the market as money.`,
        maasai:
          phase === 'struck'
            ? `I have reached the ${name} of the plains — [somber]and it is a place of sorrow. The cattle plague has gone through the kraals like a fire; behind the thorn fence the huts stand around an emptied ground.[/somber] [fear]A wasted Maasai woman swayed through our camp with a fixed stare, gathering what scraps the porters had left — the first of those terrible famine figures we would now see daily in Maasailand, living on wild honey and wild fruit, walking toward a certain death.[/fear] [somber]And yet a core of the village holds out: the elders keep their fire, and the young men stand guard over what remains, spears at rest.[/somber]`
            : phase === 'aftermath'
              ? `I have reached the ${name} of the plains. [somber]The great kraals stand empty; the plague years took the herds, and with them the web of cattle-loans and kinship that held this people together.[/somber] [somber]Some have gone down to the farming peoples of the hills; those who stayed ride raids more desperate than any before, they tell me at the fire.[/somber] [awe]But the ring of huts still stands, and at dusk the young men still leap their dance — straight as arrows.[/awe]`
              : `I have reached the ${name} of the plains. [awe]Huts of branch and earth stand in a ring behind the thorn fence, and at its heart the cattle — wealth, food and pride in one.[/awe] [somber]Yet the kraals are wider than the herds that fill them: the lung-sickness of these last years has cut deep into the stock, the elders say.[/somber] [somber]The warriors keep watch with their long spears at rest, a sheepskin over the shoulder and every inch of them ochred red with fat and clay;[pause] at dusk I saw the young men leap, straight as arrows, in their dance.[/somber]`,
        swahili: `I have reached the ${name} by the sea. [awe]Houses of coral stone line narrow lanes, their great doors carved with vines and script,[pause] and dhows lie drawn up on the beach with their lateen sails furled.[/awe] [excited]The trade winds have made this coast a crossroads of a dozen tongues.[/excited]`,
        somali: `I have reached the ${name}. [awe]Portable houses of bent boughs and woven mats stand ready to move with the herds,[pause] camels beyond counting kneel by the wells,[/awe] and the air carries frankincense from the hills. [somber]Their poets, I am told, carry whole wars and treaties in verse alone.[/somber]`,
        sidama:
          phase === 'aftermath'
            ? `I have reached the ${name} in the highlands. [somber]The Evil Days lie behind this land — years when plague and locusts emptied the highland —[pause] and their traces still stand at the bare cattle pens.[/somber] [awe]But the enset groves carried the villages through, and among them they roast the red berries again into that drink that would wake the dead.[/awe] [excited]I drank three cups.[/excited]`
            : `I have reached the ${name} in the highlands — [somber]in the midst of what they call the Evil Days: plague on the cattle, locusts on the fields, hunger over the whole highland.[/somber] [awe]That life remains here at all they owe to the groves of the enset — the false banana whose pith they pound and bury, a store against exactly such years.[/awe] [somber]Of the cattle scarcely one still stands; the homesteads trade seed for salt.[/somber]`,
        baganda: `I have reached the ${name}. [awe]Banana groves stand in ordered rows, bark-cloth dries on frames, smooth as fine paper,[pause] and reed-fenced compounds line a swept road —[/awe] [somber]the Kabaka's kingdom keeps its order even this far from his hill.[/somber]`,
        wayeyi: `I have reached the ${name} among the reed channels. [awe]The Wayeyi read this water like a book — poling their mokoro dugouts down passages I cannot even see,[pause] fish-traps set where the current remembers to run.[/awe] [excited]Strangest of all: the flood comes in the dry season, they tell me — the river drinks from rains that fell far away, months ago.[/excited] The elder's hut stands on the first dry ground.`,
        bemba: `I have reached the ${name}. [awe]Their fields are won by fire: branches cut and burned, and the millet sown into the warm ash —[pause] the forest gives a harvest, then rests.[/awe] [somber]The name of the Chitimukulu, their great chief in the east, is spoken here with bowed heads.[/somber]`,
        pedi: `I have reached the ${name}. [awe]Round huts of thatch stand about the cattle kraal, grain baskets ride on poles out of the mice's reach,[pause] and at dusk the herd boys whistle their cattle home through the dust.[/awe] The chief's hut is the greatest of the ring.`,
        zulu: `I have reached the ${name}. [awe]Beehive huts of woven grass stand in a perfect ring around the cattle kraal,[pause] hide shields lean stacked by the gate.[/awe] [somber]The discipline of the old regiments lives on in the way the young men hold themselves.[/somber]`,
        san: `I have reached the ${name} at the desert's edge. [awe]Shelters of bent grass, slender bows with poisoned arrows, and water stored in ostrich-egg shells buried against the drought.[/awe] [somber]On the rocks nearby are paintings of eland and hunters.[pause] I had taken these people for a world apart — yet they speak of the cattle folk to the east as neighbours,[pause] and of debts and favours between them that go back further than I could follow.[/somber]`,
      }
      return (
        texts[p.people as string] ??
        `I have reached the ${name}. Simple huts of clay and reed huddle close to the water, and children run out to meet me, [pause]full of curiosity. The chief resides in the great hut at the center of the village. [somber]If I can win his goodwill,[pause] perhaps he will show me the way.[/somber]`
      )
    },
    // Return vignette (point 170): the situation CHANGED since the last visit —
    // describe only the change, in a shocked register. Keyed on people +
    // fromPhase_toPhase; only the rinderpest peoples ever reach it.
    villageReturn: (p: TextParams) => {
      const transitionKey = `${p.fromPhase as string}_${p.toPhase as string}`
      const texts: Record<string, Record<string, string>> = {
        maasai: {
          preDamaged_struck: `[fear]I came back to find the kraals empty.[/fear] Where cattle still stood last year — [somber]thinned, but alive[/somber] — there is nothing now but trodden earth. [pause] A wasted woman was gathering pods from the ground and looked straight through me; they say she lives on wild honey and is walking toward a certain death. [breath] Only the elders at their fire and the young men on guard still hold a remnant of the old order.`,
          struck_aftermath: `[somber]The famine I witnessed here has moved on — and taken half the people with it.[/somber] The great kraals stand open and silent; with the herds went the web of cattle-loans and kinship that bound these people together. [pause] Some have gone to the farming peoples in the hills; those who stayed ride raids more desperate than any I had heard of. [breath] And yet the ring of huts still stands, [emph]and the young men still leap their dance.[/emph]`,
          preDamaged_aftermath: `[fear]I came back and scarcely knew the place.[/fear] In the years I was away the plague went through these kraals [somber]like a fire[/somber]: the cattle I once watched at dusk are gone to the last head, and with them the web of cattle-loans and kinship that held this people together. [pause] Some have gone off to the farming peoples of the hills; those who remain ride desperate raids. [breath] Only the ring of huts still stands, [weary]and at evening the young men still leap their dance — thinner than I remember, but unbroken.[/weary]`,
        },
        sidama: {
          struck_aftermath: `[breath] I came back scarcely daring to hope — [somber]but the Evil Days lie behind them now.[/somber] The cattle pens still stand almost bare, mute witnesses to what I saw here; yet the enset groves carried them through the hunger. [pause] Today they roast the red coffee-berries again, [emph]a drink that would wake the dead,[/emph] and they offered me a cup as in better times.`,
        },
      }
      return (
        texts[p.people as string]?.[transitionKey] ??
        `[somber]I came back, and the place is not the one I left.[pause] What has happened here since my last visit stands unspoken in every face.[/somber]`
      )
    },
    giftRevered: (p: TextParams) =>
      `I presented my gift to the chief of the ${PEOPLES[p.people as string]}. [excited]His eyes lit up —[pause] I have found the very thing his people revere![/excited] He bowed his head and bade me welcome. [pause][excited]My standing here grows.[/excited]`,
    giftNeutral:
      'The chief accepted my gift with a polite nod. [somber]No light came into his eyes —[pause] it was not, I think, what his people hold dear.[/somber] [pause]But a beginning has been made.',
    giftRejected: (p: TextParams) =>
      `[fear]A grave mistake![/fear] No sooner had the chief of the ${PEOPLES[p.people as string]} laid eyes on my gift than his face darkened. [somber]What I offered counts among his people as an ill omen.[pause] I was led out without a word.[/somber] [breath][weary]It will take time to wear down this mistrust.[/weary]`,
    languageLesson: (p: TextParams) => {
      const texts: Record<string, string> = {
        north:
          'An old man by the fire spoke with me at length, with hands as much as words. He named the winds: [emph]"Nivera"[/emph] where the cold night wind is born — toward midnight —, "Chamsina" for the hot breath of noon, "Levantra" for the morning, "Gharbia" for the evening. [breath][excited]Now I understand:[pause] the North reads its directions from the origin of the wind, and [emph]"Nivera" means north![/emph][/excited]',
        west:
          'An elder drew four marks into the dust and spoke slowly: [emph]"koko"[/emph] toward midnight, [emph]"Katula"[/emph] toward the sunrise, "Phuthswama" toward noon, "Mimbumi" toward the sunset. [breath][excited]The words of the West are mine now:[pause] koko is north, Katula is east![/excited]',
        central:
          'By the fire an elder kept pointing at the great river, which his people call [emph]"Utomba"[/emph] — the Mongdamara. Everything lies "wa-Utomba" or "ka-Utomba": away from the river or toward it, "lem-Utomba" toward the sunrise side, "mos-Utomba" toward the sunset. [breath][excited]The forest measures the world from its river![/excited]',
        east:
          'An old herdsman raised his staff toward the shining mountain his people call [emph]"Odabi"[/emph] — the Unumpara. From it flow the directions: [emph]"Relolo"[/emph] beyond it toward midnight, "Dethamee" toward noon, "Salewa" toward the sunrise, "Munjori" toward the sunset. [breath][excited]The East measures the world from the holy mountain![/excited]',
        south:
          'An elder woman laughed at my compass and pointed at the sky: her people name the directions after the seasons — [emph]toward summer[/emph] is toward midnight, toward winter is noon, spring is the sunrise, autumn the sunset. [breath][excited]What a curious, beautiful way to carry the world![/excited]',
      }
      return texts[p.region as string]
    },
    hintRaw: (p: TextParams) => {
      const regionId = p.region as string
      const w = DIRECTION_WORDS[regionId as keyof typeof DIRECTION_WORDS]
      const texts: Record<string, string> = {
        north:
          'The chief leaned close and spoke in a low voice: [whisper]"You seek the tomb of the great king. ' +
          `Where the latitude counts ${dec(p.lat as number)} degrees toward [emph]${w.north}[/emph], there he rests beneath the sand."[/whisper] ` +
          `[breath][somber]${w.north} …[pause] I must learn what that word means;[/somber] [excited]then this number will show me the way.[/excited]`,
        east:
          'The chief pointed his staff far across the plain: [whisper]"Beyond the great desert, towards where Unumpara hides — ' +
          `where the longitude counts ${dec(p.lon as number)} degrees toward [emph]${w.east}[/emph], the old king sleeps."[/whisper] ` +
          `[breath][somber]${w.east} …[pause] another word I must decipher.[/somber]`,
        west:
          `The chief spoke of a land far toward [emph]${w.north}[/emph], beyond the great sand, where no grass grows: [whisper]"There, they say, a king of old was laid into the earth."[/whisper] [somber]If ${w.north} is a direction, this narrows my search.[/somber]`,
        central:
          `The chief murmured: [whisper]"Go [emph]${w.north}[/emph], away from ${GLOSSARY.congo}, until the trees end and the sand begins — under such sand the old kings sleep."[/whisper] [somber]The words of the forest still veil the direction from me.[/somber]`,
        south:
          `The chief gazed long toward the horizon: [whisper]"Many moons toward [emph]${w.north}[/emph], farther than ${GLOSSARY.zambezi}, farther than the great forest — where the land is nothing but sand, the great king lies."[/whisper] [somber]Toward ${w.north} … a season as a signpost?[/somber]`,
      }
      return texts[regionId]
    },
    hintDecoded: (p: TextParams) => {
      const regionId = p.region as string
      const texts: Record<string, string> = {
        north: `[excited]Deciphered![/excited] The chief's words mean: [emph]the tomb lies at latitude ${dec(p.lat as number)} degrees north.[/emph] [somber]Now I still need its longitude.[/somber]`,
        east: `[excited]Deciphered![/excited] "Salewa" is the sunrise: [emph]the tomb lies at longitude ${dec(p.lon as number)} degrees east.[/emph] [somber]Together with the latitude, the site is fixed.[/somber]`,
        west: '[excited]Now I understand the chief of the West:[/excited] the tomb lies [emph]north, beyond the edge of the great desert[/emph] — a land without grass.',
        central: '[excited]The forest\u2019s words open up:[/excited] the tomb lies [emph]north, away from the Congo, where the sand begins[/emph].',
        south: '[excited]The seasons speak:[/excited] "toward summer" means [emph]far north[/emph] — beyond the Zambezi, beyond the forests, in the great sand.',
      }
      return texts[regionId]
    },
    unspecific: (p: TextParams) =>
      `The chief nodded gravely, waved his hands and said again and again only [emph]"${p.word}"[/emph]. [somber]Whatever he knows, he cannot or will not say it in words I grasp.[/somber] [pause]But he pointed insistently toward the villages of the [emph]${PEOPLES[p.people as string]}[/emph] — [excited]they are said to know more.[/excited]`,
    giftLore: (p: TextParams) =>
      `The old man spoke of the treasures of his land: what his people revere above all is [emph]${en.gifts[p.gift as keyof typeof en.gifts]}[/emph]. [pause]A chief honored with it will open his heart.`,
    drumMessage:
      '[awe]The chief called his drummer, and two drums spoke for him — a great one and a small one.[/awe] [pause]Seven words, each of five beats, each parted from the next by the same short silence — deep for the low syllable, bright for the high one. [excited]I know these words. I have heard every one of them in the lanes and at the water.[/excited] [pause]I have written them down in the order they were beaten; what they ask of me I must read for myself.',
    rockArtefact:
      "[excited]Seven words, and they were an errand after all.[/excited] I followed the water against its own pull until the block of stone stood on the bank exactly as the drums had it — taller than a man, alone, nothing of its kind anywhere near it. [pause]Three spans down my shovel met something that was not stone: hammered metal on worn wood, sealed in the river's own clay. [awe]It has lain here longer than the village has stood.[/awe] [pause]I did not open it further. [somber]It is not mine to open.[/somber]",
    artefactGiven:
      "[breath]I carried it back down the river and laid it in the chief's hands.[/breath] [pause]He turned it over once and spoke three words over it. [excited]I had heard every one of them before — one at the stone by the lane, one where they were digging, one from the children at their game.[/excited] [pause][awe]He had sent me to a place he cannot name in any tongue of mine, and I went there and came back with what lay buried at it.[/awe] [pause][somber]We share no language.[pause] And yet we have just understood one another.[/somber]",
    digNothing: '[weary]I dug at this spot, but the sand yielded nothing except stones and old roots.[/weary]',
    victory: (p: TextParams) =>
      `${en.formatDate(p.day as number, 1890)}. [excited]My shovel struck stone —[pause] hewn stone![/excited] [breath]With trembling hands I laid the burial chamber bare. [awe]Gold gleams in the torchlight, and upon the sarcophagus rests the mask of the great king.[/awe] [breath][awe]I have found it.[pause] The Heart of Africa.[/awe] [pause][somber]The journey was worth every step.[/somber]`,
    foodLow:
      '[somber]My provisions are running low.[/somber] I must reach a town or village soon, [pause]or hunger will become my constant companion.',
    foodOut:
      '[weary]The last of my provisions is gone.[pause] Hunger gnaws at me; every step comes harder than the one before.[/weary] [fear]I must find supplies,[pause] and quickly.[/fear]',
    dehydrationOn:
      '[weary]My tongue sticks to the roof of my mouth.[pause] Without a canteen the desert drinks me dry;[/weary] [fear]my steps are beginning to stray.[/fear]',
    dehydrationOver:
      '[somber]Water at last.[/somber] My strength returns with every sip, and my stride is steady again.',
    sunblindOver:
      '[somber]The white glare has faded from my eyes.[/somber] [excited]I can see clearly again![/excited]',
    woundHealed:
      '[somber]I changed the dressing today and found the wound closed at last.[/somber] [excited]My body has mended itself —[pause] I am whole again.[/excited]',
    woundEased:
      '[somber]The deep wound is knitting.[/somber] [weary]It still pulls at every step, but the worst is past —[pause] with rest and rations it will close on its own.[/weary]',
    medicineUsed:
      'I took the medicine. [pause][somber]The fever is breaking and my wounds are closing;[/somber] [excited]I shall be myself again soon.[/excited]',
    healthPoor:
      '[weary]I am at the end of my strength.[pause] My hands tremble as I write these lines.[/weary] [fear]If I do not find rest and relief soon, this journal will outlive me.[/fear]',
    animalAttack: (p: TextParams) => {
      const animal = en.animals[p.animal as keyof typeof en.animals]
      const openings: Record<string, string> = {
        lion: `[fear]I was attacked by ${animal}![/fear]`,
        cheetah: `[fear]In a blur of speed, ${animal} broke from the grass at me![/fear]`,
        leopard: `[fear]Out of nowhere ${animal} was upon me![/fear]`,
        hyena: `[fear]Jaws snapping, ${animal} closed in on me![/fear]`,
        snake: `[fear]I nearly stepped on ${animal}![/fear]`,
        crocodile: `[fear]The water erupted —[pause] ${animal}![/fear]`,
      }
      const results: Record<string, string> = {
        escaped: ' [excited]I escaped.[/excited]',
        defended: ' [excited]I used my weapon and drove the beast off.[/excited]',
        light: ' [somber]I was lightly injured.[/somber]',
        severe: ' [weary]I was severely wounded;[pause] every movement hurts.[/weary]',
      }
      return openings[p.animal as string] + results[p.result as string]
    },
    robbery: (p: TextParams) =>
      p.result === 'deterred'
        ? '[fear]Robbers blocked my path —[/fear] [excited]but one look at the rifle and they melted back into the bush.[/excited]'
        : `[fear]Robbers fell upon me![/fear] [somber]They took ${p.money} dollars before I could flee.[/somber]`,
    feverOn:
      '[weary]A fever burns through me.[pause] The land sways before my eyes, and my legs go where they will.[/weary] [fear]I must find medicine, or this wetland will be my grave.[/fear]',
    sunblindOn:
      '[fear]The desert light has scorched my eyes![/fear] [weary]The world is a white glare;[pause] I can barely make out my own hand.[/weary] Only far from the desert will they recover.',
    sandstorm:
      '[fear]A sandstorm swallowed the horizon![/fear] [weary]I crouched behind my pack for hours while the world turned to howling dust.[/weary] Precious time is lost.',
    sweptAway:
      '[fear]The current seized me and swept me over the falls![/fear] [weary]I dragged myself to the bank, battered and bleeding —[pause] half of my belongings are gone with the river.[/weary]',
    landmarkDiscovered: (p: TextParams) => {
      const name = en.landmarks[p.landmark as keyof typeof en.landmarks]
      const flavors: Record<string, string> = {
        mountain: `[awe]There it rose before me at last —[pause] ${name}, its flanks vast against the sky.[/awe] [excited]I have laid eyes on it, and my journal shall bear witness.[/excited]`,
        falls: `[awe]A distant thunder rolled over the land long before I saw it:[pause] ${name}![/awe] [excited]The river hurls itself into the deep in walls of white water —[pause] a sight I shall never forget.[/excited]`,
        lake: `[awe]A great water opened before me —[pause] ${name}, stretching away to the horizon like a sea.[/awe] [somber]I marked its shore upon my map.[/somber]`,
        grave: `[whisper]I walk among bleached bones and mighty tusks —[pause] the graveyard of the elephants.[/whisper] [awe]So the old tales told the truth after all.[/awe]`,
        'giza-pyramids': `[awe]There they stood across the river as the morning haze lifted —[pause] the three great pyramids of ${name}, and the lion-bodied guardian crouched before them.[/awe] [excited]Raised by African hands four thousand years before any European empire —[pause] the oldest of all the wonders, and it stands in Africa.[/excited]`,
        pyramids: `[awe]Steep pyramids crowd the Nile's east bank —[pause] ${name}, the royal city of Kush.[/awe] [excited]A kingdom that raised these tombs and wrote in its own script —[pause] an African realm in its own right, no shadow of Egypt.[/excited]`,
        'stone-city': `[awe]Mortarless walls of fitted granite curve across the hill, crowned by a great conical tower —[pause] ${name}.[/awe] [somber]African hands raised this capital, whatever the settlers back home care to claim.[/somber]`,
        'rock-churches': `[awe]Churches hewn downward out of the living rock, cross upon cross sunk into the stone —[pause] ${name}.[/awe] [excited]The work of a Christian Ethiopian kingdom,[pause] and worshippers kneel in them still.[/excited]`,
        'coastal-ruins': `[somber]Coral-stone walls and broken arches stand above the tideline —[pause] ${name}.[/somber] [awe]A Swahili city that minted its own coin and traded clear across the Indian Ocean, long before any European sail.[/awe]`,
        stelae: `[awe]Granite needles taller than any mast rise from the grass, one fallen giant among them —[pause] the stelae of ${name}.[/awe] [excited]The Aksumite kingdom carved these, struck its own coinage and traded across the Red Sea —[pause] an African power of the first rank.[/excited]`,
        castles: `[awe]Stone castles with battlements and round towers stand on the highland —[pause] ${name}, seat of Ethiopia's emperors.[/awe] [somber]African masons raised every wall of it, against everything the colonial accounts care to claim.[/somber]`,
        'cliff-dwellings': `[awe]Dwellings terraced into the sheer escarpment, granaries clinging to ledges high above the plain —[pause] ${name}.[/awe] [excited]The Dogon read this land vertically, building their homes over the older houses of the Tellem.[/excited]`,
        crater: `[awe]The rim fell away beneath me into a vast green bowl —[pause] ${name}, a walled world teeming with game.[/awe] [somber]Its ring stands against the plains like a rampart raised by the earth itself.[/somber]`,
        volcano: `[fear]The ground trembled underfoot,[pause] and above me the steep cone smoked —[/fear] [awe]${name}, the mountain the Maasai call the mountain of God.[/awe] [whisper]I did not linger on its slopes.[/whisper]`,
        delta: `[awe]A river that never finds the sea —[pause] ${name}, spending itself into the sands.[/awe] [excited]Its waters braid into a maze of channels and reed islands as far as the eye reaches.[/excited]`,
        wetland: `[somber]The Nile simply vanishes here —[pause] swallowed by ${name}, an endless papyrus swamp.[/somber] [weary]For days the channel loses itself among floating reed;[pause] no bank, no landmark, only green.[/weary]`,
      }
      return flavors[p.kind as string] ?? flavors.mountain
    },
    mountainNoRope:
      '[weary]No rope in hand, and yet there is no way around this range.[/weary] [fear]I climb slowly, hold by hold —[pause] one slip here and the rock will not catch me.[/fear]',
    penaltyJungle:
      '[weary]The jungle closes in, thick with vine and thorn.[/weary] [emph]Without a machete[/emph] I must force every step —[pause] a blade in hand would open the way.',
    penaltyWater:
      '[weary]The water bars my path, and I have no canoe.[/weary] I wade and swim across, slow and soaked;[pause] [emph]a canoe[/emph] would carry me over with ease and keep the crocodiles at bay.',
    penaltyCanoeLand:
      '[weary]The canoe on my back is a heavy burden overland.[/weary] It drags at every step —[pause] [emph]for long stretches on foot[/emph] I had better leave it behind in a camp.',
    dangerUnarmed:
      '[somber]I set out into the wilds,[pause] and it struck me that I carry no weapon.[/somber] [fear]Lions, leopards and snakes prowl this country.[/fear] [emph]A rifle in the pack[/emph] is the surest protection —[pause] better even than a machete.',
    dangerDesert:
      '[weary]The desert blazes without mercy.[/weary] [fear]Without water, thirst and the sun-blindness threaten —[pause] and the blindness can kill.[/fear] [emph]A filled canteen[/emph] holds off the thirst;[pause] against the blindness, only leaving the desert will serve.',
    dangerWater:
      '[fear]Crocodiles lie in wait in the water.[/fear] [weary]Without a canoe I am at their mercy, and my rifle turns wet and useless.[/weary] [emph]A canoe[/emph] carries me across safely and keeps the weapon dry;[pause] failing that, only the machete helps.',
    dangerWaterCanoe:
      '[fear]Crocodiles lie in wait in the water —[pause] I see their eyes above the surface.[/fear] [somber]Good that the canoe carries me:[/somber] [emph]out of their reach,[/emph] and the rifle stays dry aboard.',
    dangerWetland:
      '[somber]A damp haze hangs over the thicket.[/somber] [fear]Here the fever breeds, clouding the mind and draining the strength.[/fear] [emph]Medicine in the pack[/emph] cures it —[pause] I should always keep some at hand.',
    mountainFall:
      '[fear]The rock gave way beneath my foot, and I fell![/fear] [weary]Bruised and dazed I came to rest far below —[pause] without a rope this ascent nearly became my end.[/weary]',
    mountainFallItem:
      '[fear]The rock gave way beneath my foot, and I fell![/fear] [weary]Bruised, I dragged myself onward —[pause] and in the fall a piece of my gear tore loose and vanished into the depths.[/weary]',
    findRemains: (p: TextParams) =>
      `[somber]I came upon the remains of a traveler who made it no farther.[pause] A grim warning of this land.[/somber] Among the bones lay a purse with ${p.money} dollars — [whisper]may they serve a better fate.[/whisper]`,
    deadline1:
      '[somber]A letter reached me from the financiers.[pause] Their patience is thinning: more than half the granted time is spent, and I have no tomb to show.[/somber] [emph]I must press on.[/emph]',
    deadline2:
      '[fear]The final warning![/fear] [somber]The financiers write that the expedition will be recalled soon.[pause] If I do not find the tomb now, everything was in vain.[/somber]',
    successor:
      "[somber]I take up this journal from the hands of my predecessor, who gave everything for it.[pause] His notes shall guide me.[/somber] [emph]The search continues where he left off.[/emph]",
    treasureFound: (p: TextParams) =>
      `[excited]My shovel struck something hard![/excited] [breath]From the earth I lifted a cache of [emph]${en.treasures[p.treasure as keyof typeof en.treasures].toLowerCase()}[/emph] — buried long ago and forgotten by all but the sand. [awe]Fortune smiles on the patient digger.[/awe]`,
    ivoryFound: (p: TextParams) =>
      `[awe]The elephant graveyard.[pause] Bleached bones tower about me like the ribs of stranded ships.[/awe] [somber]With quiet reverence I freed ${p.count === 1 ? 'a great tusk' : `${p.count} great tusks`} from the ground —[pause] ivory of a purity I have never seen.[/somber]`,
    bounty: (p: TextParams) => {
      const names = [namesFromCsv(p.villages, en.places), namesFromCsv(p.landmarks, LANDMARKS)].filter(Boolean).join(', ')
      return `[excited]The geographic society has honored my reports![/excited] For ${p.count} documented ${Number(p.count) === 1 ? 'discovery' : 'discoveries'} — [emph]${names}[/emph] — they sent word ahead: a [emph]telegraphic transfer[/emph] of [emph]${p.amount} dollars[/emph] awaited me at the port. [pause]Exploration, it turns out, can pay for its own provisions.`
    },
    ferry: (p: TextParams) =>
      `I booked passage from ${en.places[p.from as string]} to ${en.places[p.to as string]}. [pause]${p.days} days at sea — [somber]the coast slid past like a slow panorama,[/somber] [excited]and I arrived rested, with dry boots for once.[/excited]`,
    valuableRevered: (p: TextParams) =>
      `No sooner had I entered the village than eyes turned to the [emph]${en.treasures[p.treasure as keyof typeof en.treasures].toLowerCase()}[/emph] in my hand. [excited]Murmurs of awe followed me through the lanes —[pause] the ${PEOPLES[p.people as string]} revere what I carry.[/excited]`,
    valuableRejected: (p: TextParams) =>
      `[fear]A mistake to carry it openly![/fear] The ${PEOPLES[p.people as string]} shrank back from the [emph]${en.treasures[p.treasure as keyof typeof en.treasures].toLowerCase()}[/emph] in my hand as from an ill omen. [somber]Doors closed;[pause] mothers pulled their children inside.[/somber]`,
    friendPledge: (p: TextParams) =>
      `[awe]The chief of the ${PEOPLES[p.people as string]} rose and laid both hands upon my shoulders.[/awe] Before the assembled village he named me [emph]Honored Friend[/emph] of his people. [excited]"Wherever our villages stand," he pledged, "our people shall watch over you."[/excited] [breath][somber]I bowed deeply.[pause] Such a gift weighs more than gold.[/somber]`,
    friendRescue: (p: TextParams) => {
      const animal = en.animals[p.animal as keyof typeof en.animals]
      const hurt = p.result === 'light' ? ' [somber]I was only lightly injured.[/somber]' : ' [excited]I escaped unharmed.[/excited]'
      return `[fear]I was attacked by ${animal}![/fear] [excited]A group of the ${PEOPLES[p.people as string]} rushed to my aid at once and drove the beast away.[/excited]${hurt} [pause][somber]I owe these people my life.[/somber]`
    },
    friendRescueRobbers: (p: TextParams) =>
      `[fear]Robbers blocked my path —[/fear] [excited]but men of the ${PEOPLES[p.people as string]} appeared from the bush with spears raised, and the bandits scattered like startled birds.[/excited] [somber]The chief's pledge is worth more than any rifle.[/somber]`,
    friendAid: (p: TextParams) =>
      `[weary]I could go no farther;[pause] the land swam before my eyes.[/weary] [somber]Then hands lifted me —[/somber] [excited]people of the ${PEOPLES[p.people as string]} had found me.[/excited] They brought water, food and bitter medicine, and stayed until my strength returned. [pause][awe]I am alive because I am their friend.[/awe]`,
    friendSupplies: (p: TextParams) =>
      `In the village of the ${PEOPLES[p.people as string]} I was received like family: [excited]they filled my packs with provisions and pressed medicine into my hands,[/excited] and no one would hear of payment. [pause][somber]The friendship of this region is my safest possession.[/somber]`,
    robberyCommitted: (p: TextParams) =>
      `[somber]I have done a thing that cannot be undone.[/somber] [fear]With the rifle raised I emptied the hut of the ${PEOPLES[p.people as string]} and fled the village.[/fear] [breath][weary]The haul: ${p.money} dollars, ${p.gifts} trade goods and ${p.food} days of provisions.[pause] Behind me: screams, and a silence worse than the screams.[pause] No hut of this region will ever open to me again.[/weary]`,
    campLooted:
      '[somber]I found my camp torn apart —[pause] the poles thrown down, the ground churned by strange feet.[/somber] [weary]Everything I had left behind is gone.[/weary] [fear]Nothing in this wilderness is safe that is not carried or guarded.[/fear]',
  },
}
