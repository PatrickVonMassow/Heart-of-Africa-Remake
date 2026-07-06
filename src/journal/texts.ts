// German journal text templates (design.md §15): vivid, first-person diary
// prose. Game-visible strings are German by requirement; identifiers English.

import type { RegionId } from '../world/geo'

export const REGION_ENTRY_TEXTS: Record<RegionId, string> = {
  north:
    'Die Wüste! Ein Meer aus Sand und Licht, so weit das Auge reicht. Die Hitze flimmert über den Dünen, und doch spüre ich eine seltsame Erhabenheit. Man sagt, die Völker des Nordens lesen die Richtung im Ursprung des Windes. Ich muss ihre Worte erst verstehen lernen.',
  west:
    'Endlose Savanne, golden im Abendlicht. Schirmakazien stehen wie Wächter in der Weite, und in der Ferne wandern Herden. Der Westen empfängt mich mit einem Gefühl von Freiheit — und der Ahnung, dass hier andere Worte für die Himmelsrichtungen gelten.',
  central:
    'Der Dschungel hat mich verschluckt. Grünes Dämmerlicht, das Kreischen der Vögel, feuchte Luft, die sich wie ein nasses Tuch auf die Brust legt. Ohne Machete komme ich hier kaum einen Schritt voran. Alles ist Leben, und alles ist Gefahr.',
  east:
    'Berge und Seen, so klar, dass sich der Himmel darin spiegelt. Im Osten ragen schneebedeckte Gipfel über die Wolken — welch ein Anblick mitten in Afrika! Die Völker hier messen die Welt an Orten, die sie „Odabi" nennen.',
  south:
    'Das Hochplateau des Südens. Kühle, klare Luft nach all der Hitze, weites Grasland unter einem gewaltigen Himmel. Die Menschen hier, so heißt es, sprechen von Jahreszeiten, wenn sie Richtungen meinen. Was für ein wunderliches Land.',
}

export const TEXTS = {
  gameStart:
    'Kairo, im Januar 1890. Heute beginnt meine Expedition. Mit 250 Dollar in der Tasche, einem Bündel Tauschgaben und mehr Hoffnung als Verstand will ich das Herz von Afrika finden — das sagenumwobene Grab des großen Königs. Möge das Glück mit mir sein.',
  portCheckpoint: (port: string) =>
    `Ich habe ${port} erreicht. Der Lärm des Hafens, die Rufe der Händler, der Geruch von Salz und Gewürzen — hier kann ich Vorräte auffrischen und Kräfte sammeln. Meine Aufzeichnungen habe ich in Sicherheit gebracht. (Checkpoint gespeichert)`,
  villageFirstVisit: (village: string) =>
    `Ich habe das ${village} erreicht. Einfache Hütten aus Lehm und Schilf ducken sich ans Ufer, Kinder laufen mir neugierig entgegen. Das Oberhaupt residiert in der großen Hütte in der Mitte des Dorfes. Wenn ich sein Wohlwollen gewinne, wird es mir vielleicht den Weg weisen.`,
  giftRevered: (people: string) =>
    `Ich überreichte dem Oberhaupt der ${people} meine Gabe. Seine Augen leuchteten auf — ich habe getroffen, was sein Volk verehrt! Er neigte das Haupt und hieß mich willkommen. Das Wohlwollen wächst.`,
  giftNeutral:
    'Das Oberhaupt nahm meine Gabe mit höflichem Nicken entgegen. Kein Leuchten in den Augen — es war wohl nicht das, was sein Volk verehrt. Aber ein Anfang ist gemacht.',
  giftRejected: (people: string) =>
    `Ein schwerer Fehler! Kaum sah das Oberhaupt der ${people} meine Gabe, verfinsterte sich seine Miene. Was ich anbot, gilt seinem Volk als Unglücksmetall. Man führte mich wortlos hinaus. Ich muss dieses Misstrauen erst wieder abtragen.`,
  languageHint:
    'Ein alter Mann am Feuer sprach lange mit mir, mit Händen und Worten. Immer wieder sagte er „Nivera" und wies dorthin, woher nachts der kalte Wind weht — nach Mitternacht. Ich begreife: In der Sprache des Nordens bedeutet „Nivera" Norden!',
  digNothing:
    'Ich grub an dieser Stelle, doch der Sand gab nichts preis als Steine und alte Wurzeln.',
  victory: (dateStr: string) =>
    `${dateStr}. Meine Schaufel stieß auf Stein — behauenen Stein! Mit zitternden Händen legte ich die Grabkammer frei. Gold glänzt im Licht der Fackel, und auf dem Sarkophag ruht die Maske des großen Königs. Ich habe es gefunden. Das Herz von Afrika. Die Reise war jeden Schritt wert.`,
  foodLow:
    'Mein Proviant geht zur Neige. Ich muss bald eine Stadt oder ein Dorf erreichen, sonst wird der Hunger mein ständiger Begleiter.',
  foodOut:
    'Der letzte Proviant ist aufgezehrt. Der Hunger nagt an mir; jeder Schritt fällt schwerer. Ich muss dringend Nachschub finden.',
}

/** Hint text from the chief (design.md §13.1: landmark + direction + coordinates). */
export function chiefHintText(latDeg: string, lonDeg: string): string {
  return (
    'Das Oberhaupt beugte sich vor und sprach mit leiser Stimme: „Du suchst das Grab des großen Königs. ' +
    'Geh von unserem Dorf gen Nivera, immer dem großen Fluss entgegen der Strömung fern. ' +
    `Wo die Breite ${latDeg} Grad gen Mitternacht zählt und die Länge ${lonDeg} Grad gen Sonnenaufgang, ` +
    'dort ruht er unter dem Sand. Nimm die Schaufel, und der Sand wird ihn freigeben." — ' +
    'Nivera … ich muss herausfinden, was das bedeutet, dann kenne ich die Richtung.'
  )
}
