// What the Trader says. All of it written for this game.

export type LineKind = 'greet' | 'buy' | 'sell' | 'broke' | 'full' | 'upgrade' | 'repair' | 'leave' | 'idle' | 'refuse';

const LINES: Record<LineKind, string[]> = {
  greet: [
    'Lantern is lit. Come closer, don’t be shy.',
    'Quiet out there. It won’t last. Look quick.',
    'Coins on the counter and I won’t ask what they were for.',
    'You’re still breathing. That’s good for business.',
  ],
  buy: [
    'A fine choice. Try to die with it used up.',
    'Mind the edges on that one.',
    'It has a history. Mostly good.',
    'Yours now. No refunds from the grave.',
  ],
  sell: [
    'Hm. I can find a use for that.',
    'Dead men’s things. The best kind.',
    'Done. Don’t ask where it goes.',
    'Shiny. Shinier than you deserve.',
  ],
  broke: ['Pockets want filling first.', 'Short again. Always short.', 'Bring me more coins, then we talk.'],
  full: ['Your case is stuffed. Make some room.', 'Where would I put it? Clear a corner.'],
  upgrade: ['Better. Sharper. Meaner.', 'I opened her up and gave her a little more bite.', 'She’ll sing for you now.'],
  repair: ['A little oil, a little stone. Good as new.', 'There. It’ll bite again.'],
  leave: ['They’re coming. Go on.', 'Live. It’s cheaper than dying.', 'The dark is hungry. Off you go.'],
  idle: ['Take your time. They won’t.', 'Hm hm. Look all you like.', 'The night is long. My prices are short.'],
  refuse: ['I can’t help you with that one.', 'No. Not that.'],
};

let last: Partial<Record<LineKind, number>> = {};

/** A line of that kind, never the same one twice in a row. */
export function traderLine(kind: LineKind): string {
  const list = LINES[kind];
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last[kind]) i = (i + 1) % list.length;
  last[kind] = i;
  return list[i];
}

export function resetTraderLines(): void {
  last = {};
}
