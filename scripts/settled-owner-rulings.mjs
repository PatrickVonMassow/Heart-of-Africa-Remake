// The single tracked register of owner decisions that must not be put back to
// the owner. Keep the record as data: both board admission and the Stop guard
// consume it through settled-ruling-core.mjs, and the repository test below
// checks the fields that make an entry reviewable rather than mnemonic.

export const SETTLED_OWNER_RULINGS = Object.freeze([
  Object.freeze({
    id: 'documentation-ceiling-increases',
    date: '2026-08-10',
    ruling:
      'Do not ask the owner whether a measured documentation or instruction ceiling should be increased.',
    ownerWords: 'Frage mich in Zukunft allgemein nicht mehr bzgl. Anhebungen',
    authorisedAction:
      'Shorten or merge existing guidance first. If genuinely new guidance still cannot fit, independently make the smallest measured ceiling increase as the last resort and record the reason in the commit.',
    terms: Object.freeze([
      Object.freeze({
        name: 'documentation ceiling',
        anchor: true,
        anyOf: Object.freeze([
          'Anleitungs-Obergrenze',
          'Anleitungsobergrenze',
          'Dokumentations-Obergrenze',
          'Dokumentationsobergrenze',
          'Dokument-Budget',
          'Dokumentbudget',
          'Doc-Budget',
          'Wortbudget',
          'documentation ceiling',
          'guidance ceiling',
          'instruction ceiling',
          'word budget',
        ]),
      }),
      Object.freeze({
        name: 'increase',
        anyOf: Object.freeze([
          'Anhebung',
          'anheben',
          'angehoben',
          'Erhöhung',
          'erhöhen',
          'erhöht',
          'increase',
          'increasing',
          'raise',
          'raising',
          'higher limit',
        ]),
      }),
    ]),
  }),
])
