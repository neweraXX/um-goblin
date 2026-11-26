import { buildHabitCandidates, drillFor, habitDescription, strongestHabit } from './habits.mjs';

const IMPERATIVE = /^(pause|replace|take|breathe|finish|wait|say|name|leave|hold|start|count|practice|restart|stop|begin|slow|mark|use|drop|skip|put|give|try|let)\b/i;
const GOBLIN_LINE = /\bums?\b/i;
const FOOD_OR_HUNGER = /(feed|fed|snack|eat|ate|eating|hungry|starv|feast|munch|belly)/i;

export function validateCoach(value, { fillerIndexes, candidateIds } = {}) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const { habit, habit_id, evidence, drill, covered_points, verdict, goblin_line } = value;
  if (typeof habit !== 'string' || typeof habit_id !== 'string' || !Array.isArray(evidence) || !evidence.every(Number.isInteger) ||
      typeof drill !== 'string' || drill.split(/\s+/).filter(Boolean).length > 25 || !IMPERATIVE.test(drill.trim()) ||
      typeof covered_points !== 'boolean' || !['fed', 'starving', 'not_a_win'].includes(verdict) ||
      typeof goblin_line !== 'string' || goblin_line.split(/\s+/).filter(Boolean).length > 15 ||
      !GOBLIN_LINE.test(goblin_line) || !FOOD_OR_HUNGER.test(goblin_line)) return null;
  if (candidateIds && !candidateIds.includes(habit_id)) return null;
  const allowed = fillerIndexes ? new Set(fillerIndexes) : null;
  const safeEvidence = [...new Set(evidence)].filter((index) => !allowed || allowed.has(index));
  return { habit, habit_id, evidence: safeEvidence, drill: drill.trim(), covered_points, verdict, goblin_line: goblin_line.trim() };
}

export function fallbackCoach(words, covered = false, candidates = buildHabitCandidates(words)) {
  const selected = strongestHabit(candidates);
  const indexes = selected?.fillerIndexes || words.filter((word) => word.filler).map((word) => word.index);
  const hasFillers = indexes.length > 0;
  return {
    habit: habitDescription(selected),
    habit_id: selected?.id || 'none',
    evidence: indexes,
    drill: drillFor(selected),
    covered_points: covered,
    verdict: covered ? (hasFillers ? 'fed' : 'starving') : 'not_a_win',
    goblin_line: covered ? (hasFillers ? 'Those ums were delicious; my goblin belly demands seconds!' : 'No “um” snacks? This goblin is starving!') : 'No answer means no “um” snacks; this goblin stays hungry!',
  };
}

export function stubCoach(words, covered, candidates = buildHabitCandidates(words)) {
  return fallbackCoach(words, covered, candidates);
}
