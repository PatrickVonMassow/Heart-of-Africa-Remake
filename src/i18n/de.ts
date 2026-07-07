// German language file (default game language, design.md §17). All player-
// visible German text lives here; identifiers and comments stay English.

import type { Strings, TextParams } from './types'

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
  buildings: {
    shop: 'Laden', weapons: 'Waffenhütte', tools: 'Geräte-Hütte',
    market: 'Markthütte', chief: 'Chefhütte',
  },
  sketches: {
    palm: 'Skizze: Palme', acacia: 'Skizze: Akazie', bird: 'Skizze: Vogel',
    mountain: 'Skizze: Berg', antelope: 'Skizze: Antilope', hut: 'Skizze: Hütte',
    harbor: 'Skizze: Hafen', compass: 'Skizze: Kompass', face: 'Skizze: Gesicht',
    grave: 'Skizze: Grab',
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
    journalToggle: 'Tagebuch (T)',
    mapToggle: 'Karte (M)',
    handTooltip: 'In die Hand nehmen / weglegen',
    webglFallback: 'Grafik-Hinweis: WebGPU ist nicht verfügbar — das Spiel läuft im WebGL-2-Kompatibilitätsmodus.',
    webglFallbackDismiss: 'Verstanden',
    fps: (fps) => `${fps} FPS`,
  },

  prompts: {
    enterPlace: (name) => `E — ${name} betreten`,
    digHere: 'G — Hier graben',
    interact: (label) => `E — ${label}`,
  },

  labels: {
    talkToElder: 'Mit dem Alten sprechen',
    oldMan: 'Alter Mann',
    leavePlace: 'Ort verlassen',
    graveDebug: 'Grab (Debug)',
  },

  journalPanel: {
    title: 'Tagebuch',
    close: 'Schließen (T)',
    readAloud: 'Vorlesen',
    stopReading: 'Vorlesen stoppen',
    voiceLoading: 'Stimme wird geladen …',
    voiceError: 'Die Vorlesestimme konnte nicht geladen werden.',
  },

  mapOverlay: {
    title: 'Karte',
    explored: (region, percent) => `${region}: ${percent} % erkundet`,
    close: 'Schließen (M)',
  },

  toasts: {
    oceanBlocked: 'Der Ozean ist unpassierbar — ich kann den Kontinent nicht verlassen.',
    boughtFood: 'Eine Woche Proviant gekauft.',
    bought: (name) => `${name} gekauft.`,
    inHand: (name) => `${name} in die Hand genommen.`,
    handsFree: 'Hände frei.',
    notEnoughMoney: 'Nicht genug Geld.',
    digNoShovel: 'Ohne Schaufel in der Hand kann ich nicht graben.',
    villagerNod: 'Der Alte nickt mir freundlich zu.',
  },

  dialogs: {
    tradeGreeting: '„Willkommen, Reisender! Sieh dich um — beste Ware, ehrliche Preise."',
    cash: 'Geld',
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
  },

  overlays: {
    title: 'Das Herz von Afrika',
    victoryText: (days) =>
      `Du hast das Grab des großen Königs gefunden und geborgen. Nach ${days} Tagen Reise durch Wüste und Wildnis ist die Expedition vollendet. Dein Name wird in einem Atemzug mit den großen Entdeckern genannt werden.`,
    newExpedition: 'Neue Expedition',
    checkpointFound: 'Ein früherer Spielstand (Checkpoint der letzten Hafenstadt) wurde gefunden.',
    loadCheckpoint: 'Checkpoint laden',
  },

  debug: {
    title: 'Debug-Menü (F1)',
    language: 'Sprache',
    travelSpeed: 'Tempo außerorts',
    walkSpeed: 'Tempo innerorts',
    mouseSensitivity: 'Maus-Empfindlichkeit (Ego-Sicht)',
    ambienceVolume: 'Ambiente-Rauschen (Lautstärke)',
    foodPerDay: 'Nahrungsverbrauch/Tag (0 = ewig)',
    daysPerUnit: 'Tage pro Wegeinheit',
    digRadius: 'Grabe-Radius',
    goodwillForHint: 'Wohlwollen für Hinweis',
    randomEvents: 'Zufallsereignisse (POC: keine implementiert)',
    showHidden: 'Versteckte Objekte anzeigen',
    fpsCounter: 'FPS-Anzeige',
    wheelZoom: 'Mausrad-Zoom (Vogelperspektive)',
    cash: 'Kontostand ($)',
    foodDays: 'Nahrung (Tage)',
    jumpTo: 'Springe zu:',
    choose: 'auswählen …',
    grave: 'Grab',
    addEquipment: 'Ausrüstung hinzufügen:',
    addGift: 'Gabe hinzufügen:',
  },

  journal: {
    titles: {
      departure: 'Aufbruch',
      region: (p: TextParams) => `Region: ${de.regions[p.region as keyof typeof de.regions]}`,
      arrival: (p: TextParams) => `Ankunft in ${PLACES[p.place as string]}`,
      village: (p: TextParams) => PLACES[p.place as string],
      audience: 'Audienz beim Oberhaupt',
      mistake: 'Ein schwerer Fehler',
      chiefHint: 'Der Hinweis des Oberhaupts',
      language: 'Die Sprache des Nordens',
      victory: 'Das Herz von Afrika',
      foodLow: 'Proviant knapp',
      foodOut: 'Proviant aufgebraucht',
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
    villageFirstVisit: (p: TextParams) =>
      `Ich habe das ${PLACES[p.place as string]} erreicht. Einfache Hütten aus Lehm und Schilf ducken sich ans Ufer, Kinder laufen mir neugierig entgegen. [pause]Das Oberhaupt residiert in der großen Hütte in der Mitte des Dorfes. [somber]Wenn ich sein Wohlwollen gewinne,[pause] wird es mir vielleicht den Weg weisen.[/somber]`,
    giftRevered: (p: TextParams) =>
      `Ich überreichte dem Oberhaupt der ${PEOPLES[p.people as string]} meine Gabe. [excited]Seine Augen leuchteten auf —[pause] ich habe getroffen, was sein Volk verehrt![/excited] Er neigte das Haupt und hieß mich willkommen. [pause][excited]Das Wohlwollen wächst.[/excited]`,
    giftNeutral:
      'Das Oberhaupt nahm meine Gabe mit höflichem Nicken entgegen. [somber]Kein Leuchten in den Augen —[pause] es war wohl nicht das, was sein Volk verehrt.[/somber] [pause]Aber ein Anfang ist gemacht.',
    giftRejected: (p: TextParams) =>
      `[fear]Ein schwerer Fehler![/fear] Kaum sah das Oberhaupt der ${PEOPLES[p.people as string]} meine Gabe, verfinsterte sich seine Miene. [somber]Was ich anbot, gilt seinem Volk als Unglücksbringer.[pause] Man führte mich wortlos hinaus.[/somber] [breath][weary]Ich muss dieses Misstrauen erst wieder abtragen.[/weary]`,
    languageHint:
      'Ein alter Mann am Feuer sprach lange mit mir, mit Händen und Worten. Immer wieder sagte er [emph]„Nivera"[/emph] und wies dorthin, woher nachts der kalte Wind weht — [pause]nach Mitternacht. [breath][excited]Ich begreife:[pause] In der Sprache des Nordens bedeutet [emph]„Nivera" Norden![/emph][/excited]',
    chiefHint: (p: TextParams) =>
      'Das Oberhaupt beugte sich vor und sprach mit leiser Stimme: [whisper]„Du suchst das Grab des großen Königs. ' +
      'Geh von unserem Dorf gen Nivera, immer dem großen Fluss entgegen der Strömung fern. ' +
      `Wo die Breite ${dec(p.lat as number)} Grad gen Mitternacht zählt und die Länge ${dec(p.lon as number)} Grad gen Sonnenaufgang, ` +
      '[pause]dort ruht er unter dem Sand. Nimm die Schaufel, und der Sand wird ihn freigeben."[/whisper] — ' +
      '[breath][somber]Nivera …[pause] ich muss herausfinden, was das bedeutet,[/somber] [excited]dann kenne ich die Richtung.[/excited]',
    digNothing: '[weary]Ich grub an dieser Stelle, doch der Sand gab nichts preis als Steine und alte Wurzeln.[/weary]',
    victory: (p: TextParams) =>
      `${de.formatDate(p.day as number, 1890)}. [excited]Meine Schaufel stieß auf Stein —[pause] behauenen Stein![/excited] [breath]Mit zitternden Händen legte ich die Grabkammer frei. [awe]Gold glänzt im Licht der Fackel, und auf dem Sarkophag ruht die Maske des großen Königs.[/awe] [breath][awe]Ich habe es gefunden.[pause] Das Herz von Afrika.[/awe] [pause][somber]Die Reise war jeden Schritt wert.[/somber]`,
    foodLow:
      '[somber]Mein Proviant geht zur Neige.[/somber] Ich muss bald eine Stadt oder ein Dorf erreichen, [pause]sonst wird der Hunger mein ständiger Begleiter.',
    foodOut:
      '[weary]Der letzte Proviant ist aufgezehrt.[pause] Der Hunger nagt an mir; jeder Schritt fällt schwerer.[/weary] [fear]Ich muss dringend Nachschub finden.[/fear]',
  },
}
