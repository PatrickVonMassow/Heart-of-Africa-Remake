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
  meroe: 'Pyramids of Meroë',
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
  places: PLACES,
  peoples: PEOPLES,
  landmarks: LANDMARKS,
  equipment: {
    shovel: 'Shovel', rope: 'Rope', machete: 'Machete', rifle: 'Rifle',
    medicine: 'Medicine', canteen: 'Canteen', map: 'Map', canoe: 'Canoe',
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
  },

  prompts: {
    interact: (label) => `E — ${label}`,
    openCamp: 'C — Open camp',
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
  },

  mapOverlay: {
    title: 'Map',
    continent: 'Africa',
    subtitle: 'From the surveys of the expedition · 1890',
    scaleMiles: 'English Miles',
    explored: (region, percent) => `${region}: ${percent}% explored`,
    close: 'Close (M)',
  },

  loadMenu: {
    title: 'Port Visits',
    port: 'Port city',
    health: 'Health',
    resume: 'Continue',
    back: 'Back',
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
    journalDndOn: 'Journal interruptions off — entries appear silently.',
    journalDndOff: 'Journal interruptions on — new entries open the journal.',
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
    give: 'Offer',
    stock: (n) => `you have ${n}`,
    endAudience: 'End audience (Esc)',
    rob: 'Draw the rifle and rob',
    robConfirm:
      'Rob this village at rifle point? This antagonizes the whole region for good — no more audiences, hints or aid, and any "Honored Friend" standing is lost forever.',
    robConfirmYes: 'Yes, rob them',
    robCancel: 'No, stand down',
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
    renderer: 'Renderer',
    language: 'Language',
    travelSpeed: 'Travel speed (overland)',
    walkSpeed: 'Walk speed (in places)',
    strafeFactor: 'Strafe/backward factor',
    mouseSensitivity: 'Mouse sensitivity (first-person)',
    ambienceVolume: 'Ambience volume',
    foodPerDay: 'Food use per day (0 = infinite)',
    canteenDrain: 'Water use per day (land)',
    canteenDesertDrain: 'Water use per day (desert)',
    canteenCapacity: 'Canteen capacity',
    woundHealLight: 'Light wound heals (days)',
    woundHealSevere: 'Severe wound eases (days)',
    daysPerUnit: 'Days per travel unit',
    canoeSpeedup: 'Canoe speed factor (water)',
    junglePenalty: 'Jungle penalty factor (no machete)',
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
    showHidden: 'Show hidden objects',
    fpsCounter: 'FPS counter',
    traa: 'TRAA (temporal anti-aliasing)',
    ssr: 'SSR (screen-space reflections, WebGPU only)',
    health: 'Health',
    wheelZoom: "Allow zooming out beyond default (bird's-eye)",
    journalDnd: "Don't interrupt with journal entries (F2)",
    cash: 'Funds ($)',
    foodDays: 'Food (days)',
    jumpTo: 'Jump to:',
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
      village: (p: TextParams) => PLACES[p.place as string],
      audience: 'Audience with the Chief',
      mistake: 'A Grave Mistake',
      chiefHint: "The Chief's Words",
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
      landmarkDiscovered: 'A Discovery',
      discovery: 'A Grim Discovery',
      deadline1: 'A Letter from the Financiers',
      deadline2: 'The Final Warning',
      successor: 'A New Hand',
      treasure: 'A Treasure!',
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
    villageFirstVisit: (p: TextParams) => {
      const name = PLACES[p.place as string]
      // Each people's village reads like its ~1890 self (design.md §16).
      const texts: Record<string, string> = {
        tuareg: `I have reached the ${name} — a camp of the blue-veiled riders of the desert. [awe]Low tents of hide, camels couched in the sand, and men whose faces are wrapped in indigo cloth —[pause] among the Tuareg it is the men who go veiled, not the women.[/awe] Their salt caravans cross the emptiness for weeks. [somber]The chief receives strangers in the great tent.[/somber]`,
        berbers: `I have reached the ${name}, high against the Atlas. [awe]Flat-roofed houses of stone and clay climb the hillside in terraces,[pause] walnut groves stand along the stream,[/awe] and at the looms the women weave carpets brighter than any I could carry home. The headman's house sits above the terraces.`,
        nubians: `I have reached the ${name} on the great river. [awe]The houses are painted with bold patterns around their doors,[pause] date palms lean over the bank, and the waterwheel creaks as it lifts the Nile into the fields.[/awe] [somber]They say the pyramids of ancient kings stand not far from here —[pause] this land is older than my maps.[/somber]`,
        bombara: `I have reached the ${name}. [awe]Granaries of banked clay stand on stilts like great sealed jars,[pause] millet fields run to the horizon,[/awe] and over the doorways are carved antelope figures — the spirit, they tell me, that first taught men to farm. The chief's compound lies at the village heart.`,
        hausa: `I have reached the ${name}, a walled town of the Sahel. [excited]Dye pits full of indigo steam by the gate, leatherworkers cut and stamp their famous red hides,[pause] and horsemen in quilted armor clatter through a market that outshouts the birds.[/excited]`,
        mandingo: `I have reached the ${name}. [awe]From the shade rings the kora — twenty-one strings over a gourd —[pause] and a griot sings the lineage of kings entirely from memory.[/awe] Kola nuts pass from hand to hand in greeting; I was offered one, and took it gratefully.`,
        fang: `I have reached the ${name}, a clearing won from the forest. [awe]Long houses walled with sheets of bark stand in ordered rows,[pause] and the carvers here shape figures of dark wood whose calm gaze, they say, guards the relics of the ancestors.[/awe] [somber]Crossbows hang ready beside the doors.[/somber]`,
        mongo: `I have reached the ${name}, deep in the river forest. [awe]Cloth woven from raffia palm dries between the huts,[pause] fish weirs of plaited cane span the stream,[/awe] and gardens of plantain have been wrested from the jungle's edge. The elders gather by the chief's hearth.`,
        pygmies: `I have reached the ${name}, a camp of the forest people. [awe]Dome huts bent from saplings and broad leaves,[pause] hunting nets slung between the trees, and everywhere the smell of woodsmoke and wild honey.[/awe] [somber]They read this forest as I read my maps —[pause] and far better.[/somber]`,
        banda: `I have reached the ${name}. [awe]The ring of hammers carries from the furnaces — the smiths here draw fine iron from the ore of their hills —[pause] and by the meeting hall stand slit drums taller than a man, whose voices, they say, speak across the bush for miles.[/awe]`,
        bambundu: `I have reached the ${name}, gathered beneath a mighty baobab. [awe]Old trade paths run from this place down to the coast,[/awe] [somber]and the elders still tell of the warrior queen who defied the Portuguese for a whole lifetime.[/somber] The chief holds court in the shade of the great tree.`,
        lunda: `I have reached the ${name}. [awe]Courtly manners rule here:[pause] every greeting has its proper form, every rank its place on the mat.[/awe] They speak with reverence of the Mwata Yamvo, whose court lies far to the east, [pause]and crosses of copper pass through the market as money.`,
        masai: `I have reached the ${name} of the plains. [awe]Huts of branch and earth stand in a ring behind the thorn fence, and at its heart the cattle — wealth, food and pride in one.[/awe] [somber]Warriors wrapped in red stand watch with their long spears at rest;[pause] at dusk I saw the young men leap, straight as arrows, in their dance.[/somber]`,
        swahili: `I have reached the ${name} by the sea. [awe]Houses of coral stone line narrow lanes, their great doors carved with vines and script,[pause] and dhows lie drawn up on the beach with their lateen sails furled.[/awe] [excited]The trade winds have made this coast a crossroads of a dozen tongues.[/excited]`,
        somali: `I have reached the ${name}. [awe]Portable houses of bent boughs and woven mats stand ready to move with the herds,[pause] camels beyond counting kneel by the wells,[/awe] and the air carries frankincense from the hills. [somber]Their poets, I am told, carry whole wars and treaties in verse alone.[/somber]`,
        sidamo: `I have reached the ${name} in the highlands. [awe]Round houses with tall thatched roofs stand among groves of enset — the false banana that feeds this country —[pause] and bushes whose red berries they roast, pound and brew into a drink that would wake the dead.[/awe] [excited]I drank three cups.[/excited]`,
        uganda: `I have reached the ${name}. [awe]Banana groves stand in ordered rows, bark-cloth dries on frames, smooth as fine paper,[pause] and reed-fenced compounds line a swept road —[/awe] [somber]the Kabaka's kingdom keeps its order even this far from his hill.[/somber]`,
        batwa: `I have reached the ${name} at the forest edge. [awe]The Batwa are hunters of the high woods,[pause] yet it is their potters the neighboring farmers praise: ware so fine it is traded for grain across the hills.[/awe] The elder's hut stands under the first great trees.`,
        bemba: `I have reached the ${name}. [awe]Their fields are won by fire: branches cut and burned, and the millet sown into the warm ash —[pause] the forest gives a harvest, then rests.[/awe] [somber]The name of the Chitimukulu, their great chief in the east, is spoken here with bowed heads.[/somber]`,
        bantu: `I have reached the ${name}. [awe]Round huts of thatch stand about the cattle kraal, grain baskets ride on poles out of the mice's reach,[pause] and at dusk the herd boys whistle their cattle home through the dust.[/awe] The chief's hut is the greatest of the ring.`,
        zulu: `I have reached the ${name}. [awe]Beehive huts of woven grass stand in a perfect ring around the cattle kraal,[pause] hide shields lean stacked by the gate.[/awe] [somber]The discipline of the old regiments lives on in the way the young men hold themselves.[/somber]`,
        bushmen: `I have reached the ${name} at the desert's edge. [awe]Shelters of bent grass, slender bows with poisoned arrows, and water stored in ostrich-egg shells buried against the drought.[/awe] [somber]On the rocks nearby are paintings of eland and hunters,[pause] older, I think, than any memory alive.[/somber]`,
      }
      return (
        texts[p.people as string] ??
        `I have reached the ${name}. Simple huts of clay and reed huddle close to the water, and children run out to meet me, [pause]full of curiosity. The chief resides in the great hut at the center of the village. [somber]If I can win his goodwill,[pause] perhaps he will show me the way.[/somber]`
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
