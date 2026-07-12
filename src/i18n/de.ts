// German language file (default game language, design.md §17). All player-
// visible German text lives here; identifiers and comments stay English.

import type { Strings, TextParams } from './types'
import { DIRECTION_WORDS, GLOSSARY } from '../world/lore'
import { namesFromCsv } from './names'

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const dec = (v: number) => Math.abs(v).toFixed(1).replace('.', ',')

const PLACES: Record<string, string> = {
  cairo: 'Kairo',
  tangier: 'Tanger',
  khartoum: 'Khartum',
  'st-louis': 'St. Louis',
  timbuktu: 'Timbuktu',
  lagos: 'Lagos',
  boma: 'Boma',
  berbera: 'Berbera',
  zanzibar: 'Sansibar',
  capetown: 'Kapstadt',
  'tuareg-village': 'Dorf der Tuareg',
  'berber-village': 'Dorf der Berber',
  'nubian-village': 'Dorf der Nubier',
  'bombara-village': 'Dorf der Bombara',
  'hausa-village': 'Dorf der Hausa',
  'mandingo-village': 'Dorf der Mandingo',
  'fang-village': 'Dorf der Fang',
  'mongo-village': 'Dorf der Mongo',
  'pygmy-village': 'Dorf der Pygmäen',
  'banda-village': 'Dorf der Banda',
  'bambundu-village': 'Dorf der Bambundu',
  'lunda-village': 'Dorf der Lunda',
  'masai-village': 'Dorf der Masai',
  'swahili-village': 'Dorf der Suaheli',
  'somali-village': 'Dorf der Somali',
  'sidamo-village': 'Dorf der Sidamo',
  'uganda-village': 'Dorf der Uganda',
  'batwa-village': 'Dorf der Batwa',
  'bemba-village': 'Dorf der Bemba',
  'bantu-village': 'Dorf der Bantu',
  'zulu-village': 'Dorf der Zulu',
  'bushmen-village': 'Dorf der Buschmänner',
}

const PEOPLES: Record<string, string> = {
  masai: 'Masai', bantu: 'Bantu', zulu: 'Zulu', bushmen: 'Buschmänner',
  batwa: 'Batwa', lunda: 'Lunda', pygmies: 'Pygmäen', swahili: 'Suaheli',
  somali: 'Somali', hausa: 'Hausa', mongo: 'Mongo', sidamo: 'Sidamo',
  banda: 'Banda', nubians: 'Nubier', tuareg: 'Tuareg', berbers: 'Berber',
  bombara: 'Bombara', mandingo: 'Mandingo', bemba: 'Bemba',
  bambundu: 'Bambundu', uganda: 'Uganda', fang: 'Fang',
}

const LANDMARKS: Record<string, string> = {
  'lake-chad': 'Tschadsee',
  'lake-tana': 'Tanasee',
  'lake-albert': 'Albertsee',
  'lake-edward': 'Edwardsee',
  'lake-victoria': 'Viktoriasee',
  'lake-rudolf': 'Rudolfsee',
  'lake-tanganyika': 'Tanganjikasee',
  'lake-nyasa': 'Njassasee',
  toubkal: 'Toubkal',
  'emi-koussi': 'Emi Koussi',
  kilimanjaro: 'Kilimandscharo',
  'mount-kenya': 'Kenia',
  elgon: 'Elgon',
  'ras-dashen': 'Ras Daschan',
  'mount-cameroon': 'Kamerunberg',
  tahat: 'Tahat',
  rwenzori: 'Ruwenzori',
  meru: 'Meru',
  'thabana-ntlenyana': 'Thabana Ntlenyana',
  'stanley-falls': 'Stanley-Fälle',
  'livingstone-falls': 'Livingstone-Fälle',
  'kabalega-falls': 'Kabalega-Fälle',
  'victoria-falls': 'Victoria-Fälle',
  'augrabies-falls': 'Augrabies-Fälle',
  'elephant-graveyard': 'Elefantenfriedhof',
  meroe: 'Pyramiden von Meroë',
  'great-zimbabwe': 'Groß-Simbabwe',
  lalibela: 'Lalibela',
  kilwa: 'Kilwa',
}

const RIVERS: Record<string, string> = {
  nile: 'Nil', 'white-nile': 'Weißer Nil', 'blue-nile': 'Blauer Nil',
  jubba: 'Djuba', ruvuma: 'Ruvuma', zambezi: 'Sambesi', limpopo: 'Limpopo',
  vaal: 'Vaal', orange: 'Oranje', sankuru: 'Sankuru', kasai: 'Kasai',
  ubangi: 'Ubangi', congo: 'Kongo', benue: 'Benue', volta: 'Volta',
  niger: 'Niger', senegal: 'Senegal',
}

export const de: Strings = {
  lang: 'de',
  languageName: 'Deutsch',
  months: MONTHS,

  formatDate(day, startYear) {
    const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
    return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  },
  formatLatLon(lat, lon) {
    const latDir = lat >= 0 ? 'Nord' : 'Süd'
    const lonDir = lon >= 0 ? 'Ost' : 'West'
    return `Breite ${dec(lat)} Grad ${latDir} · Länge ${dec(lon)} Grad ${lonDir}`
  },
  formatDecimal: dec,

  regions: { north: 'Norden', west: 'Westen', central: 'Zentral', east: 'Osten', south: 'Süden' },
  animals: { lion: 'Löwen', cheetah: 'ein Gepard', leopard: 'ein Leopard', hyena: 'Hyänen', snake: 'eine Schlange', crocodile: 'ein Krokodil' },
  places: PLACES,
  peoples: PEOPLES,
  landmarks: LANDMARKS,
  rivers: RIVERS,
  equipment: {
    shovel: 'Schaufel', rope: 'Seil', machete: 'Machete', rifle: 'Gewehr',
    medicine: 'Medizin', canteen: 'Feldflasche', map: 'Karte', canoe: 'Kanu',
  },
  gifts: {
    gold: 'Goldschmuck', silver: 'Silberschmuck', emerald: 'Smaragd',
    copper: 'Kupferarmband', ivory: 'Elfenbeinschnitzerei',
  },
  treasures: {
    gold: 'Gold', silver: 'Silber', emerald: 'Smaragde',
    copper: 'Kupfer', ivory: 'Elfenbein', statue: 'Goldene Statue',
  },
  buildings: {
    shop: 'Laden', weapons: 'Waffenhütte', tools: 'Geräte-Hütte',
    market: 'Markthütte', bazaar: 'Basar', agency: 'Reisebüro', chief: 'Chefhütte',
  },
  sketches: {
    palm: 'Skizze: Palme', acacia: 'Skizze: Akazie', bird: 'Skizze: Vogel',
    mountain: 'Skizze: Berg', antelope: 'Skizze: Antilope', hut: 'Skizze: Hütte',
    harbor: 'Skizze: Hafen', compass: 'Skizze: Kompass', face: 'Skizze: Gesicht',
    grave: 'Skizze: Grab',
  },

  health: {
    states: { healthy: 'gesund', weakened: 'geschwächt', poor: 'in schlechter Verfassung' },
    fever: 'Fieber',
    dehydration: 'Dehydrierung',
    sunblind: 'Sonnenblindheit',
    woundsLight: 'leichte Wunden',
    woundsSevere: 'schwere Wunden',
    report: (state, afflictions) =>
      afflictions.length > 0 ? `Ich fühle mich ${state} (${afflictions.join(', ')}).` : `Ich fühle mich ${state}.`,
  },

  status: {
    date: 'Datum',
    cash: 'Geld',
    provisions: 'Proviant',
    provisionsWeeks: (weeks) => `${weeks} Wochen`,
    gifts: 'Gaben',
    hand: 'In der Hand',
    handEmpty: '—',
    region: 'Region',
  },

  hud: {
    journalToggle: 'Tagebuch (Tab)',
    campToggle: 'Lager (C)',
    useTooltip: 'Anklicken, um es hier einzusetzen',
    passiveTooltip: 'Wirkt automatisch, solange du es dabei hast',
    canteenTooltip: 'Füllstand der Feldflasche — füllt sich an Süßwasser wieder',
    presentTooltip: 'Einem Dorf zeigen (löst eine Reaktion aus)',
    webglFallback: 'Grafik-Hinweis: WebGPU ist nicht verfügbar — das Spiel läuft im WebGL-2-Kompatibilitätsmodus.',
    webglFallbackDismiss: 'Verstanden',
    fps: (fps) => `${fps} FPS`,
    healthBar: 'Gesundheit',
    movementPenalty: {
      jungle: 'Der dichte Dschungel bremst — mit einer Machete im Gepäck geht es schneller voran.',
      water: 'Schwimmen ist langsam und gefährlich — mit einem Kanu käme ich schneller und sicherer übers Wasser.',
      mountain: 'Der steile Fels bremst den Aufstieg — mit einem Seil geht es sicherer und schneller.',
      canoeOnLand: 'Das Kanu ist an Land totes Gewicht und bremst mich — für lange Landwege lasse ich es besser im Lager.',
    },
  },

  prompts: {
    interact: (label) => `E — ${label}`,
    openCamp: 'C — Lager öffnen',
  },

  labels: {
    talkToElder: 'Mit dem Alten sprechen',
    oldMan: 'Alter Mann',
    graveDebug: 'Grab (Debug)',
    camp: 'Lager',
  },

  journalPanel: {
    title: 'Tagebuch',
    close: 'Schließen (Tab)',
    readAloud: 'Vorlesen',
    stopReading: 'Vorlesen stoppen',
    voiceLoading: 'Stimme wird geladen …',
    voiceError: 'Die Vorlesestimme konnte nicht geladen werden.',
  },

  mapOverlay: {
    title: 'Karte',
    continent: 'Afrika',
    explored: (region, percent) => `${region}: ${percent} % erkundet`,
    close: 'Schließen (M)',
  },

  loadMenu: {
    title: 'Hafenbesuche',
    port: 'Hafenstadt',
    health: 'Gesundheit',
    resume: 'Fortsetzen',
    back: 'Zurück',
  },

  toasts: {
    oceanBlocked: 'Der Ozean ist unpassierbar — ich kann den Kontinent nicht verlassen.',
    mountainNoRopeWarn: 'Ohne Seil wird der Aufstieg gefährlich — ein Fehltritt, und ich stürze. Langsam und vorsichtig!',
    penaltyJungle: 'Der Dschungel bremst mich — eine Machete im Gepäck bahnte den Weg.',
    penaltyWater: 'Kein Kanu — ich muss hinüberschwimmen, langsam und durchnässt.',
    penaltyCanoeLand: 'Das Kanu bremst mich an Land — für Landwege besser im Lager lassen.',
    valuableAlreadyShown: 'Dieses Dorf hat den Schatz bereits gesehen.',
    boughtFood: 'Eine Woche Proviant gekauft.',
    bought: (name) => `${name} gekauft.`,
    notEnoughMoney: 'Nicht genug Geld.',
    digNoShovel: 'Ohne Schaufel in der Hand kann ich nicht graben.',
    villagerNod: 'Der Alte nickt mir freundlich zu.',
    journalDndOn: 'Tagebuch-Unterbrechungen aus — Einträge erscheinen still.',
    journalDndOff: 'Tagebuch-Unterbrechungen an — neue Einträge öffnen das Tagebuch.',
    debugLoadout: 'Debug: Volle Ausstattung — alles im Gepäck, Geld und Proviant randvoll, kerngesund.',
    debugCanoeOn: 'Debug: Kanu ins Gepäck genommen.',
    debugCanoeOff: 'Debug: Kanu abgelegt.',
    noMedicine: 'Ich habe keine Medizin mehr.',
    medicineNotNeeded: 'Weder Fieber noch Wunden — ich hebe die Medizin auf.',
    inventoryFull: 'Mein Gepäck ist voll — mehr kann ich nicht tragen.',
    discovered: (name) => `Entdeckt: ${name}. Die Geographische Gesellschaft wird diesen Bericht bezahlen.`,
    sold: (name, amount) => `${name} für ${amount} $ verkauft.`,
    soldForGifts: (name, count) => `${name} für ${count} ${count === 1 ? 'Gabe' : 'Gaben'} verkauft.`,
    notEnoughGifts: 'Nicht genug Gaben — hier zählt kein Geld.',
    bazaarRejected: (name) => `Der Händler winkt ab — mit ${name} wird hier nicht gehandelt.`,
    graveyardEmpty: 'Die gebleichten Knochen geben kein Elfenbein mehr her.',
    chiefHostile: 'Das Dorf hat meinen Fehltritt nicht vergessen. Das Oberhaupt empfängt mich nicht.',
    regionShunned: 'Die Kunde von meinem Raub hat sich verbreitet — keine Hütte dieser Region öffnet sich mir mehr.',
    campPitched: 'Lager aufgeschlagen — ein X auf meiner Karte markiert die Stelle.',
    campNeedsFriend: 'Nur ein Ehrenfreund dieser Region darf seine Habe im Dorf zurücklassen.',
    positionReport: (coords, region) => `Nach meiner Rechnung: ${coords} — Region ${region}.`,
    orientationGained: 'Zum Dank für die Gabe zeigt man mir die wichtigen Gebäude.',
  },

  dialogs: {
    tradeGreeting: '„Willkommen, Reisender! Sieh dich um — beste Ware, ehrliche Preise."',
    tradeGreetingVillage: '„Sei gegrüßt, Fremder. Bei uns zählt kein Geld — biete Gaben, so handeln wir."',
    cash: 'Geld',
    giftsHeld: 'Gaben',
    priceGifts: (n) => `${n} ${n === 1 ? 'Gabe' : 'Gaben'}`,
    sellHeader: 'Ausrüstung verkaufen:',
    sell: 'Verkaufen',
    buy: 'Kaufen',
    leave: 'Verlassen (Esc)',
    foodItem: 'Proviant (1 Woche)',
    gift: (name) => `Gabe: ${name}`,
    audienceTitle: (people) => `Audienz beim Oberhaupt der ${people}`,
    audienceIntro: (mood) => `Im Halbdunkel der Chefhütte sitzt das Oberhaupt auf geschnitzten Hölzern. ${mood}`,
    moodHigh: 'Das Oberhaupt betrachtet dich mit großem Wohlwollen.',
    moodMid: 'Das Oberhaupt wirkt dir gegenüber freundlich gesinnt.',
    moodLow: 'Das Oberhaupt mustert dich abwartend.',
    chiefDone: '„Ich habe dir gesagt, was ich weiß. Möge dein Weg gesegnet sein."',
    give: 'Überreichen',
    stock: (n) => `Vorrat: ${n}`,
    endAudience: 'Audienz beenden (Esc)',
    rob: 'Gewehr ziehen und rauben',
    robConfirm:
      'Dieses Dorf mit vorgehaltenem Gewehr ausrauben? Das verfeindet die ganze Region für immer — keine Audienzen, Hinweise oder Hilfe mehr, und ein etwaiger Status als "Geehrter Freund" ist unwiederbringlich verloren.',
    robConfirmYes: 'Ja, ausrauben',
    robCancel: 'Nein, ablassen',
    bazaarGreeting: '„Schätze, Effendi! Zeig her, was die Wildnis hergab — oder nimm selbst ein Stück mit heim."',
    bazaarSell: 'Einen Fund anbieten:',
    bazaarBuy: 'Zum Verkauf:',
    offer: 'Anbieten',
    bid: (name, amount) => `Der Händler bietet ${amount} $ für ${name}.`,
    accept: 'Annehmen',
    decline: 'Ablehnen',
    agencyGreeting: '„Passagen in jeden Hafen des Kontinents — schnelle Schiffe, ehrliche Preise."',
    passage: (dest, days) => `Passage nach ${dest} (~${days} Tage)`,
    book: 'Buchen',
    campTitle: 'Lager',
    villageCampTitle: 'Dorflager',
    campHint: 'Was hier bleibt, macht das Gepäck leichter — doch ein unbewachtes Lager kann geplündert werden.',
    villageCampHint: 'Die Dorfbewohner hüten diese Habe wie ihre eigene. Was hier lagert, geht nie verloren.',
    campPack: 'In meinem Gepäck:',
    campContents: 'Hier gelagert:',
    campEmpty: 'Hier ist nichts gelagert.',
    campStore: 'Ablegen',
    campTake: 'Nehmen',
  },

  overlays: {
    title: 'Das Herz von Afrika',
    victoryText: (days) =>
      `Du hast das Grab des großen Königs gefunden und geborgen. Nach ${days} Tagen Reise durch Wüste und Wildnis ist die Expedition vollendet. Dein Name wird in einem Atemzug mit den großen Entdeckern genannt werden.`,
    remainsReport: (cause, days) =>
      `Eine Karawane hat die Überreste des Forschers gefunden — ein grausiger Anblick. Alles deutet darauf hin, dass ${cause}. Das Tagebuch, ${days} Tage voller Hoffnungen und Strapazen, endet hier.`,
    deathCauses: {
      starvation: 'der Hunger ihn zermürbte, bis er nicht mehr weiterkonnte',
      fever: 'das Fieber ihn fern jeder Hilfe verzehrte',
      dehydration: 'er unter der Wüstensonne verdurstete',
      sunblind: 'er sonnenblind im Kreis irrte, bis die Wüste ihn nahm',
      wounds: 'er seinen Wunden erlag',
      eaten: 'wilde Tiere ihn überwältigten — es blieb wenig zu begraben',
    },
    deadlineExpired: (days) =>
      `Die Geduld der Geldgeber ist erschöpft: Nach ${days} Tagen ohne das Grab wird die Expedition zurückgerufen. Das Herz von Afrika behält sein Geheimnis.`,
    successor: 'Ein Nachfolger übernimmt',
    newExpedition: 'Neue Expedition',
    checkpointFound: 'Ein früherer Spielstand (Checkpoint der letzten Hafenstadt) wurde gefunden.',
    loadCheckpoint: 'Checkpoint laden',
  },

  debug: {
    title: 'Debug-Menü (F1)',
    renderer: 'Renderer',
    language: 'Sprache',
    travelSpeed: 'Tempo außerorts',
    walkSpeed: 'Tempo innerorts',
    strafeFactor: 'Seitwärts/Rückwärts-Faktor',
    mouseSensitivity: 'Maus-Empfindlichkeit (Ego-Sicht)',
    ambienceVolume: 'Ambiente-Lautstärke',
    foodPerDay: 'Nahrungsverbrauch/Tag (0 = ewig)',
    canteenDrain: 'Wasserverbrauch/Tag (Land)',
    canteenDesertDrain: 'Wasserverbrauch/Tag (Wüste)',
    canteenCapacity: 'Kapazität der Trinkflasche',
    woundHealLight: 'Leichte Wunde heilt (Tage)',
    woundHealSevere: 'Schwere Wunde bessert sich (Tage)',
    daysPerUnit: 'Tage pro Wegeinheit',
    canoeSpeedup: 'Kanu-Tempofaktor (Wasser)',
    junglePenalty: 'Malusfaktor Dschungel (ohne Machete)',
    mountainPenalty: 'Malusfaktor Gebirge (ohne Seil)',
    foodUnitDays: 'Proviant pro Nahrungseinheit (Tage)',
    oceanSwimMargin: 'Schwimmbares Küstenband (°)',
    digRadius: 'Grabe-Radius',
    goodwillForHint: 'Wohlwollen für Hinweis',
    randomEvents: 'Zufallsereignisse',
    triggerEvent: 'Ereignis auslösen:',
    eventNames: {
      lionAttack: 'Löwenangriff', cheetahAttack: 'Gepardenangriff', leopardAttack: 'Leopardenangriff',
      hyenaAttack: 'Hyänenangriff', snakeBite: 'Schlangenbiss',
      robberAttack: 'Räuber', crocodileAttack: 'Krokodil', fever: 'Fieber',
      sunblindness: 'Sonnenblindheit', sandstorm: 'Sandsturm', waterfallSweep: 'Über die Fälle gerissen',
      findRemains: 'Überreste finden',
    },
    showHidden: 'Versteckte Objekte anzeigen',
    fpsCounter: 'FPS-Anzeige',
    traa: 'TRAA (zeitliche Kantenglättung)',
    ssr: 'SSR (Bildraum-Spiegelungen, nur WebGPU)',
    health: 'Gesundheit',
    wheelZoom: 'Weiter rauszoomen erlauben (Vogelperspektive)',
    journalDnd: 'Nicht durch Tagebuch unterbrechen (F2)',
    cash: 'Kontostand ($)',
    foodDays: 'Nahrung (Tage)',
    jumpTo: 'Springe zu:',
    choose: 'auswählen …',
    grave: 'Grab',
    addEquipment: 'Ausrüstung hinzufügen:',
    addGift: 'Gabe hinzufügen:',
    addTreasure: 'Schatz hinzufügen:',
    giftsTotal: 'Gaben (Anzahl)',
    inventoryCapacity: 'Inventar-Kapazität',
  },

  journal: {
    titles: {
      departure: 'Aufbruch',
      region: (p: TextParams) => `Region: ${de.regions[p.region as keyof typeof de.regions]}`,
      arrival: (p: TextParams) => `Ankunft in ${PLACES[p.place as string]}`,
      village: (p: TextParams) => PLACES[p.place as string],
      audience: 'Audienz beim Oberhaupt',
      mistake: 'Ein schwerer Fehler',
      chiefHint: 'Die Worte des Oberhaupts',
      decoded: 'Entschlüsselt!',
      unspecific: 'Unbestimmtes Gemurmel',
      giftLore: 'Was das Volk verehrt',
      language: (p: TextParams) => {
        const names: Record<string, string> = {
          north: 'Die Sprache des Nordens', west: 'Die Sprache des Westens',
          central: 'Die Sprache des Dschungels', east: 'Die Sprache des Ostens',
          south: 'Die Sprache des Südens',
        }
        return names[p.region as string]
      },
      victory: 'Das Herz von Afrika',
      foodLow: 'Proviant knapp',
      foodOut: 'Proviant aufgebraucht',
      dehydration: 'Durst',
      recovery: 'Genesung',
      healthPoor: 'Am Ende meiner Kräfte',
      attack: 'Angriff!',
      robbery: 'Räuber',
      fever: 'Fieber',
      sunblind: 'Von der Sonne geblendet',
      sandstorm: 'Sandsturm',
      sweptAway: 'Fortgerissen',
      mountainClimb: 'Ohne Seil ins Gebirge',
      penaltyJungle: 'Kampf durch den Dschungel',
      penaltyWater: 'Ins Wasser',
      penaltyCanoeLand: 'Das Kanu an Land',
      dangerUnarmed: 'Wildnis ohne Gewehr',
      dangerDesert: 'Die Glut der Wüste',
      dangerWater: 'Lauernde Krokodile',
      dangerWetland: 'Fieberdunst im Dickicht',
      mountainFall: 'Ein Sturz',
      landmarkDiscovered: 'Eine Entdeckung',
      discovery: 'Ein düsterer Fund',
      deadline1: 'Ein Brief der Geldgeber',
      deadline2: 'Die letzte Warnung',
      successor: 'Eine neue Hand',
      treasure: 'Ein Schatz!',
      bounty: 'Der Lohn der Entdeckungen',
      ferry: 'Passage übers Meer',
      valuableReaction: 'Der Schatz in meiner Hand',
      friend: 'Ein Ehrenfreund',
      rescue: 'Von den Dorfbewohnern gerettet',
      friendSupplies: 'Gäste der Region',
      robberyCommitted: 'Eine Tat ohne Vergebung',
      campLooted: 'Das geplünderte Lager',
    },
    start:
      'Kairo, im Januar 1890. [excited]Heute beginnt meine Expedition.[/excited] Mit 250 Dollar in der Tasche, einem Bündel Tauschgaben und mehr Hoffnung als Verstand will ich das Herz von Afrika finden — [awe]das sagenumwobene Grab des großen Königs.[/awe] [breath][somber]Möge das Glück mit mir sein.[/somber]',
    regionEntry: (p: TextParams) => {
      const texts: Record<string, string> = {
        north:
          '[awe]Die Wüste![pause] Ein Meer aus Sand und Licht, so weit das Auge reicht.[/awe] Die Hitze flimmert über den Dünen, und doch spüre ich eine seltsame Erhabenheit. [pause]Man sagt, die Völker des Nordens lesen die Richtung im Ursprung des Windes. [somber]Ich muss ihre Worte erst verstehen lernen.[/somber]',
        west:
          'Endlose Savanne, [awe]golden im Abendlicht.[/awe] Schirmakazien stehen wie Wächter in der Weite, und in der Ferne wandern Herden. [excited]Der Westen empfängt mich mit einem Gefühl von Freiheit[/excited] — und der Ahnung, dass hier andere Worte für die Himmelsrichtungen gelten.',
        central:
          '[fear]Der Dschungel hat mich verschluckt.[/fear] Grünes Dämmerlicht, das Kreischen der Vögel, feuchte Luft, die sich wie ein nasses Tuch auf die Brust legt. [weary]Ohne Machete komme ich hier kaum einen Schritt voran.[/weary] [breath][somber]Alles ist Leben,[pause] und alles ist Gefahr.[/somber]',
        east:
          'Berge und Seen, so klar, dass sich der Himmel darin spiegelt. [awe]Im Osten ragen schneebedeckte Gipfel über die Wolken —[pause] welch ein Anblick mitten in Afrika![/awe] Die Völker hier messen die Welt an Orten, die sie [emph]„Odabi"[/emph] nennen.',
        south:
          'Das Hochplateau des Südens. [pause]Kühle, klare Luft nach all der Hitze, weites Grasland unter einem gewaltigen Himmel. Die Menschen hier, so heißt es, sprechen von Jahreszeiten, wenn sie Richtungen meinen. [pause][awe]Was für ein wunderliches Land.[/awe]',
      }
      return texts[p.region as string]
    },
    portArrival: (p: TextParams) =>
      `Ich habe ${PLACES[p.place as string]} erreicht. [excited]Der Lärm des Hafens, die Rufe der Händler, der Geruch von Salz und Gewürzen[/excited] — hier kann ich Vorräte auffrischen und Kräfte sammeln. [pause]Meine Aufzeichnungen habe ich in Sicherheit gebracht. [mute](Checkpoint gespeichert)[/mute]`,
    villageFirstVisit: (p: TextParams) => {
      const name = PLACES[p.place as string]
      // Jedes Dorf liest sich wie es selbst um 1890 (design.md §16).
      const texts: Record<string, string> = {
        tuareg: `Ich habe das ${name} erreicht — ein Lager der blau verschleierten Reiter der Wüste. [awe]Flache Zelte aus Häuten, Kamele im Sand gelagert, und Männer, deren Gesichter in Indigotuch gehüllt sind —[pause] bei den Tuareg verschleiern sich die Männer, nicht die Frauen.[/awe] Ihre Salzkarawanen durchqueren die Leere wochenlang. [somber]Der Häuptling empfängt Fremde im großen Zelt.[/somber]`,
        berbers: `Ich habe das ${name} erreicht, hoch am Atlas. [awe]Flachdächer aus Stein und Lehm staffeln sich den Hang hinauf,[pause] Walnusshaine säumen den Bach,[/awe] und an den Webstühlen entstehen Teppiche, bunter als alles, was ich heimtragen könnte. Das Haus des Ältesten thront über den Terrassen.`,
        nubians: `Ich habe das ${name} am großen Strom erreicht. [awe]Die Häuser tragen kühne Muster um die Türen,[pause] Dattelpalmen neigen sich über das Ufer, und das Wasserrad knarrt, während es den Nil auf die Felder hebt.[/awe] [somber]Man sagt, die Pyramiden alter Könige stünden nicht weit von hier —[pause] dieses Land ist älter als meine Karten.[/somber]`,
        bombara: `Ich habe das ${name} erreicht. [awe]Speicher aus gestampftem Lehm stehen auf Stelzen wie große versiegelte Krüge,[pause] Hirsefelder laufen bis zum Horizont,[/awe] und über den Türen sind Antilopenfiguren geschnitzt — der Geist, so erzählt man mir, der die Menschen das Ackern lehrte. Der Hof des Häuptlings liegt im Herzen des Dorfes.`,
        hausa: `Ich habe das ${name} erreicht, eine ummauerte Stadt des Sahel. [excited]Am Tor dampfen Färbergruben voll Indigo, Lederarbeiter schneiden und punzen ihre berühmten roten Häute,[pause] und Reiter in gesteppten Panzern klappern durch einen Markt, der die Vögel übertönt.[/excited]`,
        mandingo: `Ich habe das ${name} erreicht. [awe]Aus dem Schatten klingt die Kora — einundzwanzig Saiten über einem Kürbis —[pause] und ein Griot singt die Ahnenreihe der Könige ganz aus dem Gedächtnis.[/awe] Kolanüsse gehen zum Gruß von Hand zu Hand; auch mir wurde eine gereicht, und ich nahm sie dankbar.`,
        fang: `Ich habe das ${name} erreicht, eine dem Wald abgerungene Lichtung. [awe]Langhäuser mit Wänden aus Rindenbahnen stehen in geordneten Reihen,[pause] und die Schnitzer formen Figuren aus dunklem Holz, deren ruhiger Blick, so heißt es, die Reliquien der Ahnen bewacht.[/awe] [somber]Neben den Türen hängen Armbrüste bereit.[/somber]`,
        mongo: `Ich habe das ${name} erreicht, tief im Flusswald. [awe]Zwischen den Hütten trocknet Tuch aus Raffiapalme,[pause] Fischwehre aus geflochtenem Rohr spannen sich über den Bach,[/awe] und Pflanzgärten voller Kochbananen sind dem Dschungelrand abgetrotzt. Die Ältesten versammeln sich am Feuer des Häuptlings.`,
        pygmies: `Ich habe das ${name} erreicht, ein Lager des Waldvolkes. [awe]Kuppelhütten aus gebogenen Ruten und breiten Blättern,[pause] Jagdnetze zwischen den Bäumen, und überall der Geruch von Holzrauch und wildem Honig.[/awe] [somber]Sie lesen diesen Wald, wie ich meine Karten lese —[pause] und weit besser.[/somber]`,
        banda: `Ich habe das ${name} erreicht. [awe]Von den Öfen klingt das Hämmern — die Schmiede gewinnen hier feines Eisen aus dem Erz ihrer Hügel —[pause] und beim Versammlungshaus stehen Schlitztrommeln, höher als ein Mann, deren Stimmen meilenweit über den Busch sprechen.[/awe]`,
        bambundu: `Ich habe das ${name} erreicht, versammelt unter einem mächtigen Baobab. [awe]Alte Handelspfade führen von hier hinab zur Küste,[/awe] [somber]und die Alten erzählen noch von der Kriegerkönigin, die den Portugiesen ein ganzes Leben lang trotzte.[/somber] Der Häuptling hält Rat im Schatten des großen Baumes.`,
        lunda: `Ich habe das ${name} erreicht. [awe]Höfische Sitte regiert hier:[pause] jeder Gruß hat seine Form, jeder Rang seinen Platz auf der Matte.[/awe] Mit Ehrfurcht sprechen sie vom Mwata Yamvo, dessen Hof weit im Osten liegt, [pause]und Kreuze aus Kupfer gehen auf dem Markt als Geld um.`,
        masai: `Ich habe das ${name} der Ebenen erreicht. [awe]Hütten aus Geäst und Erde stehen im Ring hinter dem Dornenzaun, und in seiner Mitte das Vieh — Reichtum, Nahrung und Stolz in einem.[/awe] [somber]In Rot gehüllte Krieger halten Wache, die langen Speere ruhig;[pause] in der Dämmerung sah ich die jungen Männer springen, gerade wie Pfeile, in ihrem Tanz.[/somber]`,
        swahili: `Ich habe das ${name} am Meer erreicht. [awe]Häuser aus Korallenstein säumen enge Gassen, ihre großen Türen mit Ranken und Schriftzeichen beschnitzt,[pause] und Dhaus liegen mit gerefften Lateinersegeln am Strand.[/awe] [excited]Die Passatwinde haben diese Küste zu einer Kreuzung von einem Dutzend Sprachen gemacht.[/excited]`,
        somali: `Ich habe das ${name} erreicht. [awe]Tragbare Häuser aus gebogenen Ästen und geflochtenen Matten stehen bereit, mit den Herden zu ziehen,[pause] Kamele ohne Zahl knien an den Brunnen,[/awe] und die Luft trägt Weihrauch aus den Hügeln. [somber]Ihre Dichter, so sagt man mir, tragen ganze Kriege und Verträge allein im Vers.[/somber]`,
        sidamo: `Ich habe das ${name} im Hochland erreicht. [awe]Rundhäuser mit hohen Strohdächern stehen zwischen Hainen der Ensete — der falschen Banane, die dieses Land ernährt —[pause] und Sträuchern, deren rote Beeren sie rösten, stampfen und zu einem Trank brühen, der Tote wecken könnte.[/awe] [excited]Ich trank drei Tassen.[/excited]`,
        uganda: `Ich habe das ${name} erreicht. [awe]Bananenhaine stehen in geordneten Reihen, Rindenbasttuch trocknet auf Rahmen, glatt wie feines Papier,[pause] und schilfumzäunte Gehöfte säumen eine gefegte Straße —[/awe] [somber]das Reich des Kabaka wahrt seine Ordnung selbst so fern von seinem Hügel.[/somber]`,
        batwa: `Ich habe das ${name} am Waldrand erreicht. [awe]Die Batwa sind Jäger der hohen Wälder,[pause] doch es sind ihre Töpfer, die die Bauern der Nachbarschaft rühmen: Ware so fein, dass sie über die Hügel hinweg gegen Korn getauscht wird.[/awe] Die Hütte des Ältesten steht unter den ersten großen Bäumen.`,
        bemba: `Ich habe das ${name} erreicht. [awe]Ihre Felder gewinnen sie mit Feuer: Äste werden geschlagen und verbrannt, die Hirse in die warme Asche gesät —[pause] der Wald gibt eine Ernte, dann ruht er.[/awe] [somber]Der Name des Chitimukulu, ihres großen Häuptlings im Osten, wird hier mit gesenktem Kopf gesprochen.[/somber]`,
        bantu: `Ich habe das ${name} erreicht. [awe]Runde Strohhütten stehen um den Viehkraal, Kornkörbe reiten auf Pfählen außer Reichweite der Mäuse,[pause] und in der Dämmerung pfeifen die Hirtenjungen ihr Vieh durch den Staub nach Hause.[/awe] Die Hütte des Häuptlings ist die größte im Ring.`,
        zulu: `Ich habe das ${name} erreicht. [awe]Bienenkorbhütten aus geflochtenem Gras stehen im vollkommenen Ring um den Viehkraal,[pause] Lederschilde lehnen gestapelt am Tor.[/awe] [somber]Die Disziplin der alten Regimenter lebt fort in der Haltung der jungen Männer.[/somber]`,
        bushmen: `Ich habe das ${name} am Rand der Wüste erreicht. [awe]Schutzdächer aus gebogenem Gras, schlanke Bögen mit vergifteten Pfeilen, und Wasser, in Straußeneierschalen gegen die Dürre vergraben.[/awe] [somber]Auf den Felsen nahebei sind Elenantilopen und Jäger gemalt,[pause] älter, glaube ich, als jedes lebende Gedächtnis.[/somber]`,
      }
      return (
        texts[p.people as string] ??
        `Ich habe das ${name} erreicht. Einfache Hütten aus Lehm und Schilf drängen sich am Wasser, und Kinder laufen mir entgegen, [pause]voller Neugier. Der Häuptling residiert in der großen Hütte in der Dorfmitte. [somber]Wenn ich sein Wohlwollen gewinne,[pause] zeigt er mir vielleicht den Weg.[/somber]`
      )
    },
    giftRevered: (p: TextParams) =>
      `Ich überreichte dem Oberhaupt der ${PEOPLES[p.people as string]} meine Gabe. [excited]Seine Augen leuchteten auf —[pause] ich habe getroffen, was sein Volk verehrt![/excited] Er neigte das Haupt und hieß mich willkommen. [pause][excited]Das Wohlwollen wächst.[/excited]`,
    giftNeutral:
      'Das Oberhaupt nahm meine Gabe mit höflichem Nicken entgegen. [somber]Kein Leuchten in den Augen —[pause] es war wohl nicht das, was sein Volk verehrt.[/somber] [pause]Aber ein Anfang ist gemacht.',
    giftRejected: (p: TextParams) =>
      `[fear]Ein schwerer Fehler![/fear] Kaum sah das Oberhaupt der ${PEOPLES[p.people as string]} meine Gabe, verfinsterte sich seine Miene. [somber]Was ich anbot, gilt seinem Volk als Unglücksbringer.[pause] Man führte mich wortlos hinaus.[/somber] [breath][weary]Ich muss dieses Misstrauen erst wieder abtragen.[/weary]`,
    languageLesson: (p: TextParams) => {
      const texts: Record<string, string> = {
        north:
          'Ein alter Mann am Feuer sprach lange mit mir, mit Händen und Worten. Er nannte die Winde: [emph]„Nivera"[/emph], wo der kalte Nachtwind geboren wird — gen Mitternacht —, „Chamsina" für den heißen Atem des Mittags, „Levantra" für den Morgen, „Gharbia" für den Abend. [breath][excited]Ich begreife:[pause] Der Norden liest seine Richtungen am Ursprung des Windes, und [emph]„Nivera" bedeutet Norden![/emph][/excited]',
        west:
          'Ein Ältester zog vier Striche in den Staub und sprach bedächtig: [emph]„koko"[/emph] gen Mitternacht, [emph]„Katula"[/emph] gen Sonnenaufgang, „Phuthswama" gen Mittag, „Mimbumi" gen Sonnenuntergang. [breath][excited]Die Worte des Westens gehören nun mir:[pause] koko ist Norden, Katula ist Osten![/excited]',
        central:
          'Am Feuer wies ein Alter immer wieder auf den großen Fluss, den sein Volk [emph]„Utomba"[/emph] nennt — den Mongdamara. Alles liegt „wa-Utomba" oder „ka-Utomba": fort vom Fluss oder zu ihm hin, „lem-Utomba" zur Sonnenaufgangsseite, „mos-Utomba" zum Sonnenuntergang. [breath][excited]Der Wald misst die Welt an seinem Fluss![/excited]',
        east:
          'Ein alter Hirte hob den Stab zum leuchtenden Berg, den sein Volk [emph]„Odabi"[/emph] nennt — den Unumpara. Von ihm gehen die Richtungen aus: [emph]„Relolo"[/emph] jenseits von ihm gen Mitternacht, „Dethamee" gen Mittag, „Salewa" gen Sonnenaufgang, „Munjori" gen Sonnenuntergang. [breath][excited]Der Osten misst die Welt am heiligen Berg![/excited]',
        south:
          'Eine alte Frau lachte über meinen Kompass und deutete in den Himmel: Ihr Volk nennt die Richtungen nach den Jahreszeiten — [emph]gen Sommer[/emph] heißt gen Mitternacht, gen Winter gen Mittag, Frühling ist der Sonnenaufgang, Herbst der Sonnenuntergang. [breath][excited]Was für eine wunderliche, schöne Art, die Welt zu tragen![/excited]',
      }
      return texts[p.region as string]
    },
    hintRaw: (p: TextParams) => {
      const regionId = p.region as string
      const w = DIRECTION_WORDS[regionId as keyof typeof DIRECTION_WORDS]
      const seasonNorth = 'Sommer'
      const texts: Record<string, string> = {
        north:
          'Das Oberhaupt beugte sich vor und sprach mit leiser Stimme: [whisper]„Du suchst das Grab des großen Königs. ' +
          `Wo die Breite ${dec(p.lat as number)} Grad gen [emph]${w.north}[/emph] zählt, dort ruht er unter dem Sand."[/whisper] ` +
          `[breath][somber]${w.north} …[pause] ich muss lernen, was dieses Wort bedeutet;[/somber] [excited]dann weist mir diese Zahl den Weg.[/excited]`,
        east:
          'Das Oberhaupt wies mit dem Stab weit über die Ebene: [whisper]„Jenseits der großen Wüste, dorthin, wo Unumpara sich verbirgt — ' +
          `wo die Länge ${dec(p.lon as number)} Grad gen [emph]${w.east}[/emph] zählt, schläft der alte König."[/whisper] ` +
          `[breath][somber]${w.east} …[pause] wieder ein Wort, das ich entschlüsseln muss.[/somber]`,
        west:
          `Das Oberhaupt sprach von einem Land weit gen [emph]${w.north}[/emph], jenseits des großen Sandes, wo kein Gras mehr wächst: [whisper]„Dort, so heißt es, wurde einst ein König in die Erde gelegt."[/whisper] [somber]Wenn ${w.north} eine Richtung ist, engt das meine Suche ein.[/somber]`,
        central:
          `Das Oberhaupt murmelte: [whisper]„Geh [emph]${w.north}[/emph], fort vom ${GLOSSARY.congo}, bis die Bäume enden und der Sand beginnt — unter solchem Sand schlafen die alten Könige."[/whisper] [somber]Die Worte des Waldes verhüllen mir noch die Richtung.[/somber]`,
        south:
          `Das Oberhaupt blickte lange zum Horizont: [whisper]„Viele Monde gen [emph]${seasonNorth}[/emph], weiter als ${GLOSSARY.zambezi}, weiter als der große Wald — wo das Land nur noch Sand ist, liegt der große König."[/whisper] [somber]Gen ${seasonNorth} … eine Jahreszeit als Wegweiser?[/somber]`,
      }
      return texts[regionId]
    },
    hintDecoded: (p: TextParams) => {
      const regionId = p.region as string
      const texts: Record<string, string> = {
        north: `[excited]Entschlüsselt![/excited] Die Worte des Oberhaupts bedeuten: [emph]Das Grab liegt auf Breite ${dec(p.lat as number)} Grad Nord.[/emph] [somber]Nun fehlt mir noch seine Länge.[/somber]`,
        east: `[excited]Entschlüsselt![/excited] „Salewa" ist der Sonnenaufgang: [emph]Das Grab liegt auf Länge ${dec(p.lon as number)} Grad Ost.[/emph] [somber]Zusammen mit der Breite ist der Ort bestimmt.[/somber]`,
        west: '[excited]Nun verstehe ich das Oberhaupt des Westens:[/excited] Das Grab liegt [emph]im Norden, jenseits des Wüstenrands[/emph] — ein Land ohne Gras.',
        central: '[excited]Die Worte des Waldes öffnen sich:[/excited] Das Grab liegt [emph]im Norden, fort vom Kongo, wo der Sand beginnt[/emph].',
        south: '[excited]Die Jahreszeiten sprechen:[/excited] „Gen Sommer" heißt [emph]weit nach Norden[/emph] — jenseits des Sambesi, jenseits der Wälder, im großen Sand.',
      }
      return texts[regionId]
    },
    unspecific: (p: TextParams) =>
      `Das Oberhaupt nickte ernst, ruderte mit den Händen und sagte immer wieder nur [emph]„${p.word}"[/emph]. [somber]Was immer es weiß — es kann oder will es nicht in Worten sagen, die ich fasse.[/somber] [pause]Doch es wies beharrlich zu den Dörfern der [emph]${PEOPLES[p.people as string]}[/emph] — [excited]sie sollen mehr wissen.[/excited]`,
    giftLore: (p: TextParams) =>
      `Der Alte sprach von den Schätzen seines Landes: Was sein Volk über alles verehrt, ist [emph]${de.gifts[p.gift as keyof typeof de.gifts]}[/emph]. [pause]Ein damit geehrtes Oberhaupt öffnet sein Herz.`,
    digNothing: '[weary]Ich grub an dieser Stelle, doch der Sand gab nichts preis als Steine und alte Wurzeln.[/weary]',
    victory: (p: TextParams) =>
      `${de.formatDate(p.day as number, 1890)}. [excited]Meine Schaufel stieß auf Stein —[pause] behauenen Stein![/excited] [breath]Mit zitternden Händen legte ich die Grabkammer frei. [awe]Gold glänzt im Licht der Fackel, und auf dem Sarkophag ruht die Maske des großen Königs.[/awe] [breath][awe]Ich habe es gefunden.[pause] Das Herz von Afrika.[/awe] [pause][somber]Die Reise war jeden Schritt wert.[/somber]`,
    foodLow:
      '[somber]Mein Proviant geht zur Neige.[/somber] Ich muss bald eine Stadt oder ein Dorf erreichen, [pause]sonst wird der Hunger mein ständiger Begleiter.',
    foodOut:
      '[weary]Der letzte Proviant ist aufgezehrt.[pause] Der Hunger nagt an mir; jeder Schritt fällt schwerer.[/weary] [fear]Ich muss dringend Nachschub finden.[/fear]',
    dehydrationOn:
      '[weary]Die Zunge klebt mir am Gaumen.[pause] Ohne Feldflasche trinkt die Wüste mich aus;[/weary] [fear]meine Schritte beginnen zu taumeln.[/fear]',
    dehydrationOver:
      '[somber]Endlich Wasser.[/somber] Mit jedem Schluck kehren die Kräfte zurück, und mein Schritt ist wieder fest.',
    sunblindOver:
      '[somber]Das weiße Gleißen ist aus meinen Augen gewichen.[/somber] [excited]Ich kann wieder klar sehen![/excited]',
    woundHealed:
      '[somber]Heute wechselte ich den Verband und fand die Wunde endlich geschlossen.[/somber] [excited]Mein Körper hat sich selbst geheilt —[pause] ich bin wieder ganz.[/excited]',
    woundEased:
      '[somber]Die tiefe Wunde schließt sich.[/somber] [weary]Noch zieht sie bei jedem Schritt, doch das Schlimmste ist vorüber —[pause] mit Ruhe und Proviant heilt sie von allein.[/weary]',
    medicineUsed:
      'Ich habe die Medizin genommen. [pause][somber]Das Fieber bricht, die Wunden schließen sich;[/somber] [excited]bald bin ich wieder der Alte.[/excited]',
    healthPoor:
      '[weary]Ich bin am Ende meiner Kräfte.[pause] Die Hände zittern mir beim Schreiben dieser Zeilen.[/weary] [fear]Finde ich nicht bald Ruhe und Linderung, wird dieses Tagebuch mich überleben.[/fear]',
    animalAttack: (p: TextParams) => {
      const animal = de.animals[p.animal as keyof typeof de.animals]
      const openings: Record<string, string> = {
        lion: `[fear]Ich wurde von ${animal} angegriffen![/fear]`,
        cheetah: `[fear]In rasender Geschwindigkeit brach ${animal} aus dem Gras auf mich zu![/fear]`,
        leopard: `[fear]Aus dem Nichts war ${animal} über mir![/fear]`,
        hyena: `[fear]Mit schnappenden Kiefern kam ${animal} näher![/fear]`,
        snake: `[fear]Beinahe wäre ich auf ${animal} getreten![/fear]`,
        crocodile: `[fear]Das Wasser brach auf —[pause] ${animal}![/fear]`,
      }
      const results: Record<string, string> = {
        escaped: ' [excited]Ich bin entkommen.[/excited]',
        defended: ' [excited]Ich setzte meine Waffe ein und schlug das Tier in die Flucht.[/excited]',
        light: ' [somber]Ich wurde leicht verletzt.[/somber]',
        severe: ' [weary]Ich wurde schwer verwundet;[pause] jede Bewegung schmerzt.[/weary]',
      }
      return openings[p.animal as string] + results[p.result as string]
    },
    robbery: (p: TextParams) =>
      p.result === 'deterred'
        ? '[fear]Räuber verstellten mir den Weg —[/fear] [excited]doch ein Blick auf das Gewehr, und sie verschwanden im Busch.[/excited]'
        : `[fear]Räuber fielen über mich her![/fear] [somber]Sie nahmen ${p.money} Dollar, ehe ich fliehen konnte.[/somber]`,
    feverOn:
      '[weary]Ein Fieber brennt in mir.[pause] Das Land schwankt vor meinen Augen, und die Beine gehen, wohin sie wollen.[/weary] [fear]Ich muss Medizin finden, sonst wird dieses Sumpfland mein Grab.[/fear]',
    sunblindOn:
      '[fear]Das Wüstenlicht hat mir die Augen versengt![/fear] [weary]Die Welt ist ein weißes Gleißen;[pause] kaum erkenne ich die eigene Hand.[/weary] Nur fern der Wüste werden sie sich erholen.',
    sandstorm:
      '[fear]Ein Sandsturm verschluckte den Horizont![/fear] [weary]Stundenlang kauerte ich hinter meinem Gepäck, während die Welt zu heulendem Staub wurde.[/weary] Kostbare Zeit ist verloren.',
    sweptAway:
      '[fear]Die Strömung packte mich und riss mich über die Fälle![/fear] [weary]Zerschlagen und blutend zog ich mich ans Ufer —[pause] die Hälfte meiner Habe gehört nun dem Fluss.[/weary]',
    landmarkDiscovered: (p: TextParams) => {
      const name = de.landmarks[p.landmark as keyof typeof de.landmarks]
      const flavors: Record<string, string> = {
        mountain: `[awe]Da erhob er sich endlich vor mir —[pause] ${name}, seine Flanken gewaltig gegen den Himmel.[/awe] [excited]Ich habe ihn mit eigenen Augen gesehen, und mein Tagebuch soll es bezeugen.[/excited]`,
        falls: `[awe]Ein fernes Donnern rollte über das Land, lange bevor ich es sah:[pause] ${name}![/awe] [excited]Der Fluss stürzt sich in weißen Wänden in die Tiefe —[pause] ein Anblick, den ich nie vergessen werde.[/excited]`,
        lake: `[awe]Ein großes Wasser öffnete sich vor mir —[pause] ${name}, bis zum Horizont gedehnt wie ein Meer.[/awe] [somber]Ich habe sein Ufer auf meiner Karte vermerkt.[/somber]`,
        grave: `[whisper]Ich gehe zwischen gebleichten Knochen und mächtigen Stoßzähnen —[pause] der Friedhof der Elefanten.[/whisper] [awe]Die alten Geschichten haben also die Wahrheit gesagt.[/awe]`,
        pyramids: `[awe]Steile Pyramiden drängen sich am Ostufer des Nils —[pause] ${name}, die Königsstadt von Kusch.[/awe] [excited]Ein Reich, das diese Gräber errichtete und in eigener Schrift schrieb —[pause] ein afrikanisches Reich aus eigenem Recht, kein Schatten Ägyptens.[/excited]`,
        'stone-city': `[awe]Fugenlose Mauern aus behauenem Granit schwingen über den Hügel, überragt von einem großen Kegelturm —[pause] ${name}.[/awe] [somber]Afrikanische Hände errichteten diese Hauptstadt, was die Siedler daheim auch behaupten mögen.[/somber]`,
        'rock-churches': `[awe]In den lebenden Fels hinabgehauene Kirchen, Kreuz um Kreuz in den Stein gesenkt —[pause] ${name}.[/awe] [excited]Das Werk eines christlichen äthiopischen Königreichs,[pause] und noch heute knien Gläubige darin.[/excited]`,
        'coastal-ruins': `[somber]Mauern aus Korallenstein und geborstene Bögen stehen über der Flutlinie —[pause] ${name}.[/somber] [awe]Eine Suaheli-Stadt, die eigene Münzen prägte und über den ganzen Indischen Ozean handelte, lange vor jedem europäischen Segel.[/awe]`,
      }
      return flavors[p.kind as string] ?? flavors.mountain
    },
    mountainNoRope:
      '[weary]Kein Seil in der Hand, und doch führt kein Weg um dieses Gebirge herum.[/weary] [fear]Ich klettere langsam, Griff um Griff —[pause] ein Fehltritt hier, und der Fels wird mich nicht halten.[/fear]',
    penaltyJungle:
      '[weary]Der Dschungel schließt sich um mich, dicht von Ranken und Dornen.[/weary] [emph]Ohne Machete[/emph] muss ich jeden Schritt erzwingen —[pause] eine Klinge in der Hand bahnte den Weg.',
    penaltyWater:
      '[weary]Das Wasser versperrt mir den Weg, und ich habe kein Kanu.[/weary] Ich wate und schwimme hinüber, langsam und durchnässt;[pause] [emph]ein Kanu[/emph] trüge mich mühelos und sicher darüber.',
    penaltyCanoeLand:
      '[weary]Das Kanu auf meinem Rücken ist an Land eine schwere Last.[/weary] Es bremst jeden Schritt —[pause] [emph]für lange Wege über Land[/emph] lasse ich es besser in einem Lager zurück.',
    dangerUnarmed:
      '[somber]Ich brach in die Wildnis auf,[pause] und mir wurde bewusst, dass ich unbewaffnet bin.[/somber] [fear]Löwen, Leoparden und Schlangen lauern in diesem Land.[/fear] [emph]Ein Gewehr im Gepäck[/emph] ist der beste Schutz —[pause] besser noch als eine Machete.',
    dangerDesert:
      '[weary]Die Wüste glüht ohne Gnade.[/weary] [fear]Ohne Wasser drohen Verdursten und die Sonnenblindheit, die tödlich enden kann.[/fear] [emph]Eine gefüllte Trinkflasche[/emph] hält den Durst fern —[pause] doch gegen die Blindheit hilft nur, die Wüste zu verlassen.',
    dangerWater:
      '[fear]Im Wasser lauern Krokodile.[/fear] [weary]Ohne Kanu bin ich ihnen ausgeliefert, und mein Gewehr wird nass und nutzlos.[/weary] [emph]Ein Kanu[/emph] trägt mich sicher hinüber und hält die Waffe trocken;[pause] sonst hilft nur die Machete.',
    dangerWaterCanoe:
      '[fear]Im Wasser lauern Krokodile —[pause] ihre Augen stehen über der Oberfläche.[/fear] [somber]Gut, dass das Kanu mich trägt:[/somber] [emph]außerhalb ihrer Reichweite,[/emph] und das Gewehr bleibt an Bord trocken.',
    dangerWetland:
      '[somber]Feuchter Dunst hängt über dem Dickicht.[/somber] [fear]Hier brütet das Fieber, das den Verstand trübt und die Kräfte zehrt.[/fear] [emph]Medizin im Gepäck[/emph] heilt es —[pause] ich sollte stets welche bei mir tragen.',
    mountainFall:
      '[fear]Der Fels brach unter meinem Fuß, und ich stürzte![/fear] [weary]Zerschunden und benommen kam ich weiter unten zum Liegen —[pause] ohne Seil wäre dieser Aufstieg beinahe mein Ende gewesen.[/weary]',
    mountainFallItem:
      '[fear]Der Fels brach unter meinem Fuß, und ich stürzte![/fear] [weary]Zerschunden schleppte ich mich weiter —[pause] und beim Sturz riss sich ein Stück meiner Ausrüstung los und verschwand in der Tiefe.[/weary]',
    findRemains: (p: TextParams) =>
      `[somber]Ich stieß auf die Überreste eines Reisenden, der nicht weiterkam.[pause] Eine düstere Mahnung dieses Landes.[/somber] Zwischen den Knochen lag eine Börse mit ${p.money} Dollar — [whisper]mögen sie einem besseren Schicksal dienen.[/whisper]`,
    deadline1:
      '[somber]Ein Brief der Geldgeber hat mich erreicht.[pause] Ihre Geduld wird dünn: Mehr als die Hälfte der gewährten Zeit ist verstrichen, und ich habe kein Grab vorzuweisen.[/somber] [emph]Ich muss vorankommen.[/emph]',
    deadline2:
      '[fear]Die letzte Warnung![/fear] [somber]Die Geldgeber schreiben, die Expedition werde bald zurückgerufen.[pause] Finde ich das Grab jetzt nicht, war alles vergebens.[/somber]',
    successor:
      '[somber]Ich übernehme dieses Tagebuch aus den Händen meines Vorgängers, der alles dafür gab.[pause] Seine Aufzeichnungen sollen mich leiten.[/somber] [emph]Die Suche geht weiter, wo er sie ließ.[/emph]',
    treasureFound: (p: TextParams) =>
      `[excited]Meine Schaufel stieß auf etwas Hartes![/excited] [breath]Aus der Erde hob ich ein Versteck voll [emph]${de.treasures[p.treasure as keyof typeof de.treasures]}[/emph] — vor langer Zeit vergraben und von allen vergessen außer vom Sand. [awe]Das Glück lächelt dem geduldigen Gräber.[/awe]`,
    ivoryFound: (p: TextParams) =>
      `[awe]Der Elefantenfriedhof.[pause] Gebleichte Knochen ragen um mich auf wie die Rippen gestrandeter Schiffe.[/awe] [somber]Mit stiller Ehrfurcht löste ich ${p.count === 1 ? 'einen mächtigen Stoßzahn' : `${p.count} mächtige Stoßzähne`} aus dem Boden —[pause] Elfenbein von einer Reinheit, wie ich sie nie gesehen habe.[/somber]`,
    bounty: (p: TextParams) => {
      const names = [namesFromCsv(p.villages, PLACES), namesFromCsv(p.landmarks, LANDMARKS)].filter(Boolean).join(', ')
      return `[excited]Die Geographische Gesellschaft hat meine Berichte gewürdigt![/excited] Für ${p.count} ${Number(p.count) === 1 ? 'dokumentierte Entdeckung' : 'dokumentierte Entdeckungen'} — [emph]${names}[/emph] — ließ man mir vorab Nachricht zukommen: eine [emph]telegrafische Überweisung[/emph] über [emph]${p.amount} Dollar[/emph] erwartete mich im Hafen. [pause]Das Entdecken, so zeigt sich, bezahlt seinen eigenen Proviant.`
    },
    ferry: (p: TextParams) =>
      `Ich habe eine Passage von ${PLACES[p.from as string]} nach ${PLACES[p.to as string]} gebucht. [pause]${p.days} Tage auf See — [somber]die Küste zog vorbei wie ein langsames Panorama,[/somber] [excited]und ich kam ausgeruht an, ausnahmsweise mit trockenen Stiefeln.[/excited]`,
    valuableRevered: (p: TextParams) =>
      `Kaum betrat ich das Dorf, richteten sich alle Blicke auf [emph]${de.treasures[p.treasure as keyof typeof de.treasures]}[/emph] in meiner Hand. [excited]Ehrfürchtiges Raunen folgte mir durch die Gassen —[pause] die ${PEOPLES[p.people as string]} verehren, was ich trage.[/excited]`,
    valuableRejected: (p: TextParams) =>
      `[fear]Ein Fehler, es offen zu tragen![/fear] Die ${PEOPLES[p.people as string]} wichen vor [emph]${de.treasures[p.treasure as keyof typeof de.treasures]}[/emph] in meiner Hand zurück wie vor einem bösen Omen. [somber]Türen schlossen sich;[pause] Mütter zogen ihre Kinder ins Haus.[/somber]`,
    friendPledge: (p: TextParams) =>
      `[awe]Das Oberhaupt der ${PEOPLES[p.people as string]} erhob sich und legte mir beide Hände auf die Schultern.[/awe] Vor dem versammelten Dorf nannte es mich [emph]Ehrenfreund[/emph] seines Volkes. [excited]„Wo immer unsere Dörfer stehen", gelobte es, „werden unsere Leute über dich wachen."[/excited] [breath][somber]Ich verneigte mich tief.[pause] Ein solches Geschenk wiegt schwerer als Gold.[/somber]`,
    friendRescue: (p: TextParams) => {
      const animal = de.animals[p.animal as keyof typeof de.animals]
      const hurt = p.result === 'light' ? ' [somber]Ich wurde nur leicht verletzt.[/somber]' : ' [excited]Ich blieb unversehrt.[/excited]'
      return `[fear]Ich wurde von ${animal} angegriffen![/fear] [excited]Eine Gruppe der ${PEOPLES[p.people as string]} eilte mir sofort zu Hilfe und vertrieb das Tier.[/excited]${hurt} [pause][somber]Ich verdanke diesen Menschen mein Leben.[/somber]`
    },
    friendRescueRobbers: (p: TextParams) =>
      `[fear]Räuber verstellten mir den Weg —[/fear] [excited]doch Männer der ${PEOPLES[p.people as string]} traten mit erhobenen Speeren aus dem Busch, und die Banditen stoben auseinander wie aufgescheuchte Vögel.[/excited] [somber]Das Gelöbnis des Oberhaupts wiegt mehr als jedes Gewehr.[/somber]`,
    friendAid: (p: TextParams) =>
      `[weary]Ich konnte nicht mehr weiter;[pause] das Land verschwamm vor meinen Augen.[/weary] [somber]Dann hoben mich Hände auf —[/somber] [excited]Leute der ${PEOPLES[p.people as string]} hatten mich gefunden.[/excited] Sie brachten Wasser, Nahrung und bittere Medizin und blieben, bis meine Kräfte zurückkehrten. [pause][awe]Ich lebe, weil ich ihr Freund bin.[/awe]`,
    friendSupplies: (p: TextParams) =>
      `Im Dorf der ${PEOPLES[p.people as string]} empfing man mich wie Familie: [excited]Man füllte mein Gepäck mit Proviant und drückte mir Medizin in die Hände,[/excited] von Bezahlung wollte niemand hören. [pause][somber]Die Freundschaft dieser Region ist mein sicherster Besitz.[/somber]`,
    robberyCommitted: (p: TextParams) =>
      `[somber]Ich habe etwas getan, das sich nicht ungeschehen machen lässt.[/somber] [fear]Mit erhobenem Gewehr räumte ich die Hütte der ${PEOPLES[p.people as string]} aus und floh aus dem Dorf.[/fear] [breath][weary]Die Beute: ${p.money} Dollar, ${p.gifts} Handelswaren und ${p.food} Tage Proviant.[pause] Hinter mir: Schreie, und eine Stille, die schlimmer war als die Schreie.[pause] Keine Hütte dieser Region wird sich mir je wieder öffnen.[/weary]`,
    campLooted:
      '[somber]Ich fand mein Lager verwüstet vor —[pause] die Stangen umgerissen, der Boden von fremden Füßen zerwühlt.[/somber] [weary]Alles, was ich zurückgelassen hatte, ist fort.[/weary] [fear]Nichts ist sicher in dieser Wildnis, was nicht getragen oder bewacht wird.[/fear]',
  },
}
