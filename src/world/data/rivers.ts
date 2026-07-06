// All 17 rivers of design.md §4.3 as (lon, lat) polylines from source to
// mouth, anchored to real course waypoints (~1890 geography — no modern
// reservoirs such as Lake Volta, Kariba or Nasser). Each river names its
// source and mouth (design.md §4.3: basis of direction/location hints).

export interface RiverDef {
  name: string
  /** Named source location (German, shown in hints/journal). */
  sourceName: string
  /** Named mouth location (German, shown in hints/journal). */
  mouthName: string
  /** Course from source to mouth as (lon, lat). */
  points: Array<[number, number]>
}

export const RIVERS_DATA: RiverDef[] = [
  {
    name: 'Nil',
    sourceName: 'Zusammenfluss bei Khartum',
    mouthName: 'Rosette am Mittelmeer',
    points: [
      [32.49, 15.62], [32.55, 16.6], [33.55, 17.55], [33.98, 17.7], [33.32, 19.53],
      [31.8, 18.47], [30.95, 18.05], [30.48, 19.17], [30.5, 20.5], [31.35, 21.8],
      [32.2, 22.9], [32.9, 24.09], [32.87, 24.98], [32.64, 25.7], [32.72, 26.17],
      [32.0, 26.6], [31.18, 27.18], [30.75, 28.1], [31.1, 29.3], [31.23, 30.06],
      [30.9, 30.8], [30.42, 31.45],
    ],
  },
  {
    name: 'Weißer Nil',
    sourceName: 'Ripon-Fälle am Viktoriasee',
    mouthName: 'Zusammenfluss bei Khartum',
    points: [
      [33.2, 0.43], [32.9, 1.5], [32.5, 2.1], [31.68, 2.28], [31.45, 2.35],
      [32.05, 3.6], [31.6, 4.85], [31.55, 6.2], [30.45, 9.5], [31.65, 9.53],
      [32.1, 11.0], [32.5, 12.0], [32.66, 13.17], [32.49, 15.62],
    ],
  },
  {
    name: 'Blauer Nil',
    sourceName: 'Tanasee',
    mouthName: 'Zusammenfluss bei Khartum',
    points: [
      [37.35, 11.6], [37.58, 11.49], [37.9, 10.9], [38.1, 10.1], [37.0, 9.8],
      [36.0, 10.1], [35.1, 11.2], [34.5, 11.9], [33.9, 13.5], [33.15, 14.6],
      [32.49, 15.62],
    ],
  },
  {
    name: 'Djuba',
    sourceName: 'Zusammenfluss bei Dolo',
    mouthName: 'Goobweyn am Indischen Ozean',
    points: [
      [42.08, 4.17], [42.55, 3.3], [42.55, 2.5], [42.7, 1.8], [42.6, 1.0],
      [42.65, 0.2], [42.58, -0.3],
    ],
  },
  {
    name: 'Ruvuma',
    sourceName: 'Matagoro-Berge',
    mouthName: 'Kap Delgado am Indischen Ozean',
    points: [
      [35.4, -10.6], [35.4, -11.0], [36.5, -11.5], [37.5, -11.6], [38.5, -11.35],
      [39.3, -11.15], [40.0, -10.85], [40.44, -10.47],
    ],
  },
  {
    name: 'Sambesi',
    sourceName: 'Kalene-Hügel',
    mouthName: 'Chinde im Sambesi-Delta',
    points: [
      [24.3, -11.37], [23.1, -13.0], [22.7, -14.5], [23.1, -16.0], [23.35, -17.5],
      [25.5, -17.85], [25.86, -17.93], [27.0, -17.8], [28.8, -16.5], [30.4, -15.6],
      [32.7, -15.6], [33.6, -16.16], [34.5, -17.2], [35.3, -17.8], [36.3, -18.6],
    ],
  },
  {
    name: 'Limpopo',
    sourceName: 'Witwatersrand',
    mouthName: 'Xai-Xai am Indischen Ozean',
    points: [
      [28.0, -25.7], [27.5, -24.7], [26.9, -23.7], [27.7, -23.2], [29.0, -22.2],
      [30.5, -22.35], [31.6, -23.0], [32.5, -24.15], [33.55, -25.17],
    ],
  },
  {
    name: 'Vaal',
    sourceName: 'Drakensberge',
    mouthName: 'Zusammenfluss mit dem Oranje',
    points: [
      [30.1, -26.4], [29.0, -26.75], [28.1, -26.9], [26.8, -27.0], [25.6, -27.6],
      [24.8, -28.1], [24.0, -28.5], [23.8, -29.07],
    ],
  },
  {
    name: 'Oranje',
    sourceName: 'Drakensberge in Lesotho',
    mouthName: 'Alexanderbucht am Atlantik',
    points: [
      [28.8, -28.9], [27.5, -30.3], [26.0, -30.6], [24.5, -29.6], [23.8, -29.07],
      [22.5, -29.3], [20.34, -28.59], [18.8, -28.5], [17.5, -28.4], [16.45, -28.63],
    ],
  },
  {
    name: 'Sankuru',
    sourceName: 'Katanga-Hochland',
    mouthName: 'Zusammenfluss mit dem Kasai',
    points: [
      [24.0, -9.3], [23.6, -7.6], [23.4, -6.3], [23.3, -5.0], [22.5, -4.4],
      [21.3, -4.2], [20.25, -4.3],
    ],
  },
  {
    name: 'Kasai',
    sourceName: 'Bié-Hochland in Angola',
    mouthName: 'Kwamouth am Kongo',
    points: [
      [19.0, -11.7], [20.5, -10.5], [21.9, -9.5], [22.3, -8.0], [21.4, -6.5],
      [20.6, -5.4], [20.25, -4.3], [19.4, -3.8], [18.8, -3.3], [17.4, -3.2],
      [16.19, -3.2],
    ],
  },
  {
    name: 'Ubangi',
    sourceName: 'Zusammenfluss von Uele und Mbomou',
    mouthName: 'Irebu am Kongo',
    points: [
      [22.45, 4.08], [21.0, 4.35], [19.8, 4.35], [18.55, 4.36], [17.8, 3.6],
      [18.1, 2.5], [18.05, 1.5], [17.75, 0.5], [17.7, -0.6],
    ],
  },
  {
    name: 'Kongo',
    sourceName: 'Katanga (Lualaba)',
    mouthName: 'Banana am Atlantik',
    points: [
      [25.5, -11.7], [25.47, -10.5], [25.9, -9.4], [26.9, -8.2], [27.0, -6.9],
      [25.9, -5.9], [25.5, -4.6], [25.2, -3.3], [25.9, -2.0], [25.9, -1.0],
      [25.2, 0.5], [24.2, 0.9], [23.0, 1.5], [21.5, 2.0], [20.0, 2.1],
      [19.0, 1.8], [18.3, 1.2], [17.9, 0.3], [17.7, -0.6], [16.9, -1.7],
      [16.19, -3.2], [15.6, -4.0], [15.3, -4.3], [14.7, -4.9], [14.35, -5.15],
      [13.8, -5.55], [13.05, -5.87], [12.3, -6.05],
    ],
  },
  {
    name: 'Benue',
    sourceName: 'Adamaua-Hochland',
    mouthName: 'Lokoja am Niger',
    points: [
      [13.75, 7.45], [13.5, 8.6], [13.4, 9.3], [12.5, 9.35], [11.3, 9.25],
      [10.0, 8.9], [9.0, 8.2], [8.53, 7.73], [7.6, 7.75], [6.77, 7.8],
    ],
  },
  {
    name: 'Volta',
    sourceName: 'Hochland von Bobo-Dioulasso',
    mouthName: 'Ada am Golf von Guinea',
    points: [
      [-3.0, 12.8], [-2.85, 11.5], [-2.6, 10.0], [-2.3, 8.85], [-1.55, 8.5],
      [-0.8, 7.9], [-0.25, 7.2], [0.05, 6.6], [0.63, 5.78],
    ],
  },
  {
    name: 'Niger',
    sourceName: 'Bergland von Guinea (Tembakounda)',
    mouthName: 'Nigerdelta am Golf von Guinea',
    points: [
      [-10.75, 9.08], [-10.0, 10.0], [-9.0, 10.8], [-8.0, 11.4], [-7.0, 12.2],
      [-5.9, 13.2], [-4.9, 13.9], [-4.2, 14.5], [-3.5, 15.5], [-3.0, 16.72],
      [-1.9, 17.0], [-0.35, 16.97], [-0.05, 16.27], [0.5, 15.5], [1.2, 14.6],
      [2.1, 13.5], [3.0, 12.4], [3.35, 11.9], [4.75, 10.83], [4.83, 9.13],
      [5.5, 8.3], [6.77, 7.8], [6.78, 6.15], [6.45, 5.3], [6.07, 4.3],
    ],
  },
  {
    name: 'Senegal',
    sourceName: 'Fouta Djallon (Bafing)',
    mouthName: 'Saint-Louis am Atlantik',
    points: [
      [-10.3, 10.9], [-10.83, 13.8], [-11.44, 14.45], [-12.45, 14.9], [-13.25, 15.3],
      [-13.9, 15.9], [-14.97, 16.65], [-15.8, 16.5], [-16.5, 16.03],
    ],
  },
]
