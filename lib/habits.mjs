const FILLERS = new Set(['um', 'uh']);
const TRANSITIONS = new Set(['and', 'so', 'but', 'because']);

const CANDIDATE_COPY = {
  thought_start: {
    label: 'at the start of a thought',
    drill: 'Replace the opening “um” with one quiet breath before you begin.',
  },
  after_transition: {
    label: 'after a transition word',
    drill: 'Pause after “and,” “so,” or “but” before adding the next thought.',
  },
  before_detail: {
    label: 'before a number or name',
    drill: 'Pause before numbers or names; say each detail cleanly without an “um.”',
  },
  mid_phrase: {
    label: 'in the middle of a phrase',
    drill: 'Finish each phrase without interrupting it; pause between phrases instead.',
  },
  quick_repeat: {
    label: 'repeated within ten seconds',
    drill: 'Pause for one silent beat whenever a second “um” arrives within ten seconds.',
  },
};

function plain(word) {
  return String(word?.word ?? word?.text ?? '').toLowerCase().replace(/[^a-z0-9']/g, '');
}

function isBoundary(word) {
  return /[.!?]$/.test(String(word?.text ?? word?.punctuated_word ?? ''));
}

export function buildHabitCandidates(words) {
  const detected = words.filter((word) => word.filler ?? FILLERS.has(plain(word)));
  const grouped = new Map(Object.keys(CANDIDATE_COPY).map((id) => [id, new Set()]));

  for (const filler of detected) {
    const index = filler.index;
    const previous = words.find((word) => word.index === index - 1);
    const next = words.find((word) => word.index === index + 1);
    if (!previous || isBoundary(previous)) grouped.get('thought_start').add(index);
    if (previous && TRANSITIONS.has(plain(previous))) grouped.get('after_transition').add(index);

    const nextText = String(next?.text ?? '');
    const beforeNumber = /\d/.test(nextText);
    const beforeName = (/^[A-Z][a-z]/.test(nextText) || /^[A-Z]{2,}$/.test(nextText)) && index > 1 && !isBoundary(previous);
    if (next && (beforeNumber || beforeName)) grouped.get('before_detail').add(index);

    if (previous && next && !isBoundary(previous) && !TRANSITIONS.has(plain(previous)) &&
        !TRANSITIONS.has(plain(next)) && !isBoundary(filler)) grouped.get('mid_phrase').add(index);
  }

  for (let i = 0; i < detected.length; i++) {
    for (let j = i + 1; j < detected.length; j++) {
      if (Math.abs(Number(detected[j].start) - Number(detected[i].start)) <= 10) {
        grouped.get('quick_repeat').add(detected[i].index);
        grouped.get('quick_repeat').add(detected[j].index);
      }
    }
  }

  return [...grouped.entries()]
    .filter(([, indexes]) => indexes.size)
    .map(([id, indexes]) => ({ id, label: CANDIDATE_COPY[id].label, count: indexes.size, fillerIndexes: [...indexes].sort((a, b) => a - b) }))
    .sort((a, b) => b.count - a.count || Object.keys(CANDIDATE_COPY).indexOf(a.id) - Object.keys(CANDIDATE_COPY).indexOf(b.id));
}

export function fillerContexts(words) {
  const detected = words.filter((word) => word.filler ?? FILLERS.has(plain(word)));
  return detected.map((filler) => {
    const position = words.findIndex((word) => word.index === filler.index);
    return {
      index: filler.index,
      filler: plain(filler),
      before: words.slice(Math.max(0, position - 3), position).map((word) => word.text),
      after: words.slice(position + 1, position + 4).map((word) => word.text),
    };
  });
}

export function strongestHabit(candidates = []) {
  return candidates[0] || null;
}

export function habitDescription(candidate) {
  return candidate ? `You often use “um” ${candidate.label}.` : 'You left space between your thoughts.';
}

export function drillFor(candidate) {
  return candidate ? CANDIDATE_COPY[candidate.id]?.drill : 'Pause for one quiet beat before your next sentence, then finish the thought in one breath.';
}
