// English language file (design.md §17). Texts are written for their
// context — a Victorian-era explorer's diary and period UI — rather than
// being literal translations of the German originals.

import type { Strings, TextParams } from './types'

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
  'bombara-village': 'Bombara Village',
  'hausa-village': 'Hausa Village',
  'mandingo-village': 'Mandingo Village',
  'fang-village': 'Fang Village',
  'mongo-village': 'Mongo Village',
  'pygmy-village': 'Pygmy Village',
  'banda-village': 'Banda Village',
  'bambundu-village': 'Bambundu Village',
  'lunda-village': 'Lunda Village',
  'masai-village': 'Masai Village',
  'swahili-village': 'Swahili Village',
  'somali-village': 'Somali Village',
  'sidamo-village': 'Sidamo Village',
  'uganda-village': 'Uganda Village',
  'batwa-village': 'Batwa Village',
  'bemba-village': 'Bemba Village',
  'bantu-village': 'Bantu Village',
  'zulu-village': 'Zulu Village',
  'bushmen-village': 'Bushman Village',
}

const PEOPLES: Record<string, string> = {
  masai: 'Masai', bantu: 'Bantu', zulu: 'Zulu', bushmen: 'Bushmen',
  batwa: 'Batwa', lunda: 'Lunda', pygmies: 'Pygmies', swahili: 'Swahili',
  somali: 'Somali', hausa: 'Hausa', mongo: 'Mongo', sidamo: 'Sidamo',
  banda: 'Banda', nubians: 'Nubians', tuareg: 'Tuareg', berbers: 'Berbers',
  bombara: 'Bombara', mandingo: 'Mandingo', bemba: 'Bemba',
  bambundu: 'Bambundu', uganda: 'Uganda', fang: 'Fang',
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
  'kabalega-falls': 'Kabalega Falls',
  'victoria-falls': 'Victoria Falls',
  'augrabies-falls': 'Augrabies Falls',
  'elephant-graveyard': 'Elephant Graveyard',
}

const RIVERS: Record<string, string> = {
  nile: 'Nile', 'white-nile': 'White Nile', 'blue-nile': 'Blue Nile',
  jubba: 'Jubba', ruvuma: 'Ruvuma', zambezi: 'Zambezi', limpopo: 'Limpopo',
  vaal: 'Vaal', orange: 'Orange', sankuru: 'Sankuru', kasai: 'Kasai',
  ubangi: 'Ubangi', congo: 'Congo', benue: 'Benue', volta: 'Volta',
  niger: 'Niger', senegal: 'Senegal',
}

export const en: Strings = {
  lang: 'en',
  languageName: 'English',
  months: MONTHS,

  formatDate(day, startYear) {
    const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
  },
  formatLatLon(lat, lon) {
    const latDir = lat >= 0 ? 'North' : 'South'
    const lonDir = lon >= 0 ? 'East' : 'West'
    return `Latitude ${dec(lat)}° ${latDir} · Longitude ${dec(lon)}° ${lonDir}`
  },
  formatDecimal: dec,

  regions: { north: 'North', west: 'West', central: 'Central', east: 'East', south: 'South' },
  places: PLACES,
  peoples: PEOPLES,
  landmarks: LANDMARKS,
  rivers: RIVERS,
  equipment: {
    shovel: 'Shovel', rope: 'Rope', machete: 'Machete', rifle: 'Rifle',
    medicine: 'Medicine', canteen: 'Canteen', map: 'Map', canoe: 'Canoe',
  },
  gifts: {
    gold: 'Gold Jewelry', silver: 'Silver Jewelry', emerald: 'Emerald',
    copper: 'Copper Bangle', ivory: 'Ivory Carving',
  },
  buildings: {
    shop: 'General Store', weapons: 'Weapons Hut', tools: 'Tool Hut',
    market: 'Market Hut', chief: "Chief's Hut",
  },
  sketches: {
    palm: 'Sketch: palm tree', acacia: 'Sketch: acacia', bird: 'Sketch: bird',
    mountain: 'Sketch: mountain', antelope: 'Sketch: antelope', hut: 'Sketch: hut',
    harbor: 'Sketch: harbor', compass: 'Sketch: compass', face: 'Sketch: face',
    grave: 'Sketch: grave',
  },

  status: {
    date: 'Date',
    cash: 'Funds',
    provisions: 'Provisions',
    provisionsWeeks: (weeks) => `${weeks} weeks`,
    gifts: 'Gifts',
    hand: 'Holding',
    handEmpty: '—',
    region: 'Region',
  },

  hud: {
    journalToggle: 'Journal (T)',
    mapToggle: 'Map (M)',
    handTooltip: 'Take in hand / put away',
    webglFallback: 'Graphics notice: WebGPU is unavailable — the game is running in WebGL 2 compatibility mode.',
    webglFallbackDismiss: 'Got it',
    fps: (fps) => `${fps} FPS`,
  },

  prompts: {
    enterPlace: (name) => `E — Enter ${name}`,
    digHere: 'G — Dig here',
    interact: (label) => `E — ${label}`,
  },

  labels: {
    talkToElder: 'Talk to the elder',
    oldMan: 'Elder',
    leavePlace: 'Leave settlement',
    graveDebug: 'Grave (debug)',
  },

  journalPanel: {
    title: 'Journal',
    close: 'Close (T)',
    readAloud: 'Read aloud',
    stopReading: 'Stop reading',
    voiceLoading: 'Loading voice …',
    voiceError: 'The narration voice could not be loaded.',
  },

  mapOverlay: {
    title: 'Map',
    explored: (region, percent) => `${region}: ${percent}% explored`,
    close: 'Close (M)',
  },

  toasts: {
    oceanBlocked: 'The ocean is impassable — there is no leaving the continent.',
    boughtFood: 'Bought one week of provisions.',
    bought: (name) => `${name} purchased.`,
    inHand: (name) => `Now holding the ${name.toLowerCase()}.`,
    handsFree: 'Hands free.',
    notEnoughMoney: 'Not enough money.',
    digNoShovel: 'I cannot dig without a shovel in hand.',
    villagerNod: 'The old man gives me a friendly nod.',
  },

  dialogs: {
    tradeGreeting: '"Welcome, traveler! Have a look around — finest goods, honest prices."',
    cash: 'Funds',
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
    give: 'Offer',
    stock: (n) => `you have ${n}`,
    endAudience: 'End audience (Esc)',
  },

  overlays: {
    title: 'The Heart of Africa',
    victoryText: (days) =>
      `You have found the tomb of the great king and brought its treasure to light. After ${days} days of travel through desert and wilderness, the expedition is complete. Your name will be spoken in the same breath as the great explorers.`,
    newExpedition: 'New Expedition',
    checkpointFound: 'A saved game was found — your checkpoint from the last port city.',
    loadCheckpoint: 'Load checkpoint',
  },

  debug: {
    title: 'Debug Menu (F1)',
    language: 'Language',
    travelSpeed: 'Travel speed (overland)',
    walkSpeed: 'Walk speed (in places)',
    mouseSensitivity: 'Mouse sensitivity (first-person)',
    ambienceVolume: 'Ambience noise volume',
    foodPerDay: 'Food use per day (0 = infinite)',
    daysPerUnit: 'Days per travel unit',
    digRadius: 'Dig radius',
    goodwillForHint: 'Goodwill required for hint',
    randomEvents: 'Random events (POC: none implemented)',
    showHidden: 'Show hidden objects',
    fpsCounter: 'FPS counter',
    wheelZoom: "Mouse-wheel zoom (bird's-eye view)",
    cash: 'Funds ($)',
    foodDays: 'Food (days)',
    jumpTo: 'Jump to:',
    grave: 'Grave',
    addEquipment: 'Add equipment:',
    addGift: 'Add gift:',
  },

  journal: {
    titles: {
      departure: 'Departure',
      region: (p: TextParams) => `Region: ${en.regions[p.region as keyof typeof en.regions]}`,
      arrival: (p: TextParams) => `Arrival in ${PLACES[p.place as string]}`,
      village: (p: TextParams) => PLACES[p.place as string],
      audience: 'Audience with the Chief',
      mistake: 'A Grave Mistake',
      chiefHint: "The Chief's Clue",
      language: 'The Language of the North',
      victory: 'The Heart of Africa',
      foodLow: 'Provisions Running Low',
      foodOut: 'Provisions Exhausted',
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
    villageFirstVisit: (p: TextParams) =>
      `I have reached the ${PLACES[p.place as string]}. Simple huts of clay and reed huddle close to the water, and children run out to meet me, [pause]full of curiosity. The chief resides in the great hut at the center of the village. [somber]If I can win his goodwill,[pause] perhaps he will show me the way.[/somber]`,
    giftRevered: (p: TextParams) =>
      `I presented my gift to the chief of the ${PEOPLES[p.people as string]}. [excited]His eyes lit up —[pause] I have found the very thing his people revere![/excited] He bowed his head and bade me welcome. [pause][excited]My standing here grows.[/excited]`,
    giftNeutral:
      'The chief accepted my gift with a polite nod. [somber]No light came into his eyes —[pause] it was not, I think, what his people hold dear.[/somber] [pause]But a beginning has been made.',
    giftRejected: (p: TextParams) =>
      `[fear]A grave mistake![/fear] No sooner had the chief of the ${PEOPLES[p.people as string]} laid eyes on my gift than his face darkened. [somber]What I offered counts among his people as an ill omen.[pause] I was led out without a word.[/somber] [breath][weary]It will take time to wear down this mistrust.[/weary]`,
    languageHint:
      'An old man by the fire spoke with me at length, with hands as much as words. Again and again he said [emph]"Nivera"[/emph] and pointed to where the cold wind comes from at night — [pause]toward midnight. [breath][excited]Now I understand:[pause] in the language of the North, [emph]"Nivera" means north![/emph][/excited]',
    chiefHint: (p: TextParams) =>
      'The chief leaned close and spoke in a low voice: [whisper]"You seek the tomb of the great king. ' +
      'Go from our village toward Nivera, keeping always clear of the great river against its current. ' +
      `Where the latitude counts ${dec(p.lat as number)} degrees toward midnight and the longitude ${dec(p.lon as number)} degrees toward sunrise, ` +
      '[pause]there he rests beneath the sand. Take your shovel, and the sand will give him up."[/whisper] — ' +
      '[breath][somber]Nivera …[pause] I must find out what that word means;[/somber] [excited]then I shall know the direction.[/excited]',
    digNothing: '[weary]I dug at this spot, but the sand yielded nothing except stones and old roots.[/weary]',
    victory: (p: TextParams) =>
      `${en.formatDate(p.day as number, 1890)}. [excited]My shovel struck stone —[pause] hewn stone![/excited] [breath]With trembling hands I laid the burial chamber bare. [awe]Gold gleams in the torchlight, and upon the sarcophagus rests the mask of the great king.[/awe] [breath][awe]I have found it.[pause] The Heart of Africa.[/awe] [pause][somber]The journey was worth every step.[/somber]`,
    foodLow:
      '[somber]My provisions are running low.[/somber] I must reach a town or village soon, [pause]or hunger will become my constant companion.',
    foodOut:
      '[weary]The last of my provisions is gone.[pause] Hunger gnaws at me; every step comes harder than the one before.[/weary] [fear]I must find supplies,[pause] and quickly.[/fear]',
  },
}
