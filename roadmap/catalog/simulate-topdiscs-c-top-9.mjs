#!/usr/bin/env node

// Reproducible synthetic C-TOP-9 comparison. No application imports or database access.
import assert from 'node:assert/strict';

const AS_OF = '2026-10-28';

function makeRatings(discId, values) {
  return values.map((rate, index) => ({
    id: `${discId}-rate-${String(index + 1).padStart(3, '0')}`,
    userId: `${discId}-user-${String(index + 1).padStart(3, '0')}`,
    rate,
    updatedAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

function makeDisc(id, name, values, releaseDate, genre, country, pinned = false) {
  return {
    id,
    name,
    rates: makeRatings(id, values),
    releaseDate,
    year: Number(releaseDate.slice(0, 4)),
    month: releaseDate.slice(0, 7),
    genre,
    country,
    pinned,
  };
}

const discs = [
  makeDisc('A', '1 voto de 10', [10], '2024-01-12', 'rock', 'US'),
  makeDisc('B', '3 votos, media 10', [10, 10, 10], '2024-02-09', 'rock', 'US'),
  makeDisc('C', '5 votos, media 9.5', [10, 10, 10, 9, 8.5], '2024-02-16', 'rock', 'US'),
  makeDisc('D', '10 votos, media 9', Array(10).fill(9), '2024-03-15', 'rock', 'US'),
  makeDisc('E', '20 votos, media 8.5', Array(20).fill(8.5), '2023-05-05', 'metal', 'UK'),
  makeDisc('F', '50 votos, media 8', Array(50).fill(8), '2022-06-17', 'metal', 'UK'),
  makeDisc('G', '100 votos, media 7.5', Array(100).fill(7.5), '2021-07-23', 'alternative', 'ES'),
  makeDisc('H', '20 votos divididos 0/10', [...Array(10).fill(0), ...Array(10).fill(10)], '2024-05-10', 'alternative', 'UK'),
  makeDisc('I', '50 votos divididos 2/8', [...Array(25).fill(2), ...Array(25).fill(8)], '2025-08-22', 'rock', 'ES'),
  makeDisc('J', '10 votos bajos', Array(10).fill(2), '2023-09-01', 'metal', 'US'),
  makeDisc('K', '3 votos de cero', [0, 0, 0], '2024-11-08', 'rock', 'ES'),
  makeDisc('L', 'Pinned sin votos', [], '2024-02-02', 'rock', 'US', true),
  makeDisc('FUT', 'Votos de disco futuro', [10, 10, 10], '2027-01-15', 'rock', 'US'),
];

const publishedDiscs = discs.filter((disc) => disc.releaseDate <= AS_OF);

function rawValidRates(disc) {
  return disc.rates
    .map(({ rate }) => rate)
    .filter((rate) => rate !== null && rate !== undefined);
}

function canonicalCurrentRates(disc) {
  const latestByUser = new Map();
  for (const rate of disc.rates) {
    const current = latestByUser.get(rate.userId);
    if (
      !current ||
      rate.updatedAt > current.updatedAt ||
      (rate.updatedAt === current.updatedAt && rate.id > current.id)
    ) {
      latestByUser.set(rate.userId, rate);
    }
  }
  return [...latestByUser.values()];
}

function stableValidRates(disc) {
  return canonicalCurrentRates(disc)
    .map(({ rate }) => rate)
    .filter((rate) =>
      typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 10,
    );
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function currentParameters(universe) {
  const perDiscMeans = universe.map((disc) => average(rawValidRates(disc)) ?? 0);
  const medianCount = median(universe.map((disc) => rawValidRates(disc).length)) ?? 0;
  return {
    prior: average(perDiscMeans) ?? 0,
    k: Math.trunc(medianCount) || 1,
    sqlMedian: medianCount,
  };
}

function globalVotePrior(universe) {
  return average(universe.flatMap(stableValidRates)) ?? 0;
}

function votedDiscMeanPrior(universe) {
  const votedMeans = universe
    .map(stableValidRates)
    .filter((rates) => rates.length > 0)
    .map((rates) => average(rates));
  return average(votedMeans) ?? 0;
}

function discMean(disc, model) {
  const rates = model === 'current' ? rawValidRates(disc) : stableValidRates(disc);
  return average(rates) ?? 0;
}

function discVoteCount(disc, model) {
  return model === 'current'
    ? rawValidRates(disc).length
    : stableValidRates(disc).length;
}

function score(disc, model, parameters) {
  const mean = discMean(disc, model);
  const votes = discVoteCount(disc, model);
  if (model === 'arithmetic') return mean;
  return ((mean * votes) + (parameters.prior * parameters.k)) /
    (votes + parameters.k);
}

function eligible(universe) {
  return universe.filter((disc) => discVoteCount(disc, 'current') > 0 || disc.pinned);
}

function rank(universe, model, parameters) {
  return [...eligible(universe)]
    .map((disc) => ({ ...disc, score: score(disc, model, parameters) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((disc, index) => ({ ...disc, rank: index + 1 }));
}

const current = currentParameters(publishedDiscs);
const votePrior = globalVotePrior(publishedDiscs);
const discPrior = votedDiscMeanPrior(publishedDiscs);
const models = [
  { id: 'arithmetic', label: 'Media aritmética', parameters: {} },
  { id: 'current', label: 'Bayes actual', parameters: { prior: current.prior, k: current.k } },
  ...[3, 5, 10, 15, 20].map((k) => ({
    id: `vote-k${k}`,
    label: `Prior por voto, k=${k}`,
    parameters: { prior: votePrior, k },
  })),
  {
    id: 'disc-k10',
    label: 'Prior media de discos votados, k=10',
    parameters: { prior: discPrior, k: 10 },
  },
];

function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} != ${expected}`);
}

// Formula, scale, missing-vote, duplicate, and future-release invariants.
assertNear((10 * 1 + 6 * 3) / 4, 7, 'closed-form sanity check');
assert.ok(votePrior >= 0 && votePrior <= 10, 'vote prior must stay on the rating scale');
assert.ok(discPrior >= 0 && discPrior <= 10, 'disc prior must stay on the rating scale');
assertNear(globalVotePrior([...publishedDiscs, makeDisc('EMPTY', 'No votes', [], '2020-01-01', 'rock', 'US')]), votePrior, 'empty disc must not affect vote prior');
assertNear(globalVotePrior(publishedDiscs),
  publishedDiscs.flatMap(stableValidRates).reduce((sum, rate) => sum + rate, 0) /
    publishedDiscs.flatMap(stableValidRates).length,
  'global C must equal SUM(valid musical votes) / COUNT(valid musical votes)');
assert.ok(!publishedDiscs.some((disc) => disc.id === 'FUT'), 'future-release disc must be outside the as-of universe');

const duplicateAndInvalidFixture = {
  id: 'duplicate-fixture',
  rates: [
    { id: 'r1', userId: 'same-user', rate: 8, updatedAt: '2025-01-01T00:00:00.000Z' },
    { id: 'r2', userId: 'same-user', rate: 6, updatedAt: '2025-02-01T00:00:00.000Z' },
    { id: 'r3', userId: 'zero-user', rate: 0, updatedAt: '2025-02-01T00:00:00.000Z' },
    { id: 'r4', userId: 'invalid-low', rate: -1, updatedAt: '2025-02-01T00:00:00.000Z' },
    { id: 'r5', userId: 'invalid-high', rate: 10.5, updatedAt: '2025-02-01T00:00:00.000Z' },
    { id: 'r6', userId: 'null-user', rate: null, updatedAt: '2025-02-01T00:00:00.000Z' },
  ],
};
assert.deepEqual(stableValidRates(duplicateAndInvalidFixture), [6, 0], 'dedupe user/disc, retain zero, exclude null and out-of-scale values');

for (const model of models) {
  const ordered = rank(publishedDiscs, model.id === 'arithmetic' ? 'arithmetic' : model.id === 'current' ? 'current' : 'stable', model.parameters);
  for (const row of ordered) {
    assert.ok(row.score >= 0 && row.score <= 10, `${model.label} score out of scale for ${row.id}: ${row.score}`);
  }
}

// A stable prior and k leave a disc's score unchanged across presentation filters.
const filterCases = [
  ['Todos', (disc) => true],
  ['Año 2024', (disc) => disc.year === 2024],
  ['Mes 2024-02', (disc) => disc.month === '2024-02'],
  ['Género rock', (disc) => disc.genre === 'rock'],
  ['País US', (disc) => disc.country === 'US'],
];
const target = publishedDiscs.find((disc) => disc.id === 'B');
const targetStableScores = new Map();
const targetCurrentScores = new Map();
for (const [label, predicate] of filterCases) {
  const subset = publishedDiscs.filter(predicate);
  assert.ok(subset.some((disc) => disc.id === target.id), `${label} must contain the target disc`);
  const stableScore = score(target, 'stable', { prior: votePrior, k: 10 });
  const local = currentParameters(subset);
  const filterSensitiveScore = score(target, 'current', local);
  targetStableScores.set(label, stableScore);
  targetCurrentScores.set(label, filterSensitiveScore);
}
for (const value of targetStableScores.values()) assertNear(value, targetStableScores.values().next().value, 'stable score must be filter invariant');
assert.ok(new Set([...targetCurrentScores.values()].map((value) => value.toFixed(8))).size > 1, 'current score should show filter sensitivity in this fixture');

// Repeated equally excellent votes move the score smoothly toward 10.
const excellentDisc = (count) => makeDisc(`N${count}`, `${count} tens`, Array(count).fill(10), '2024-02-01', 'rock', 'US');
const progression = [1, 3, 5, 10].map((count) =>
  score(excellentDisc(count), 'stable', { prior: votePrior, k: 10 }),
);
assert.ok(progression.every((value, index) => index === 0 || value > progression[index - 1]), 'excellent ratings should raise score smoothly as votes accrue');

const tiedDiscs = [
  makeDisc('TIE-B', 'Same mean and votes B', [8, 8, 8], '2024-01-01', 'rock', 'US'),
  makeDisc('TIE-A', 'Same mean and votes A', [8, 8, 8], '2024-01-01', 'rock', 'US'),
];
const tiedScores = rank(tiedDiscs, 'stable', { prior: votePrior, k: 10 });
assertNear(tiedScores[0].score, tiedScores[1].score, 'same mean and vote count should tie');
assert.equal(tiedScores[0].id, 'TIE-A', 'synthetic ID tie-break should be deterministic');

const baselineRanks = new Map(rank(publishedDiscs, 'current', { prior: current.prior, k: current.k }).map(({ id, rank: position }) => [id, position]));
const results = new Map(models.map((model) => [
  model.id,
  rank(
    publishedDiscs,
    model.id === 'arithmetic' ? 'arithmetic' : model.id === 'current' ? 'current' : 'stable',
    model.parameters,
  ),
]));

console.log(`Dataset: ${publishedDiscs.length} synthetic published discs; ${publishedDiscs.flatMap(stableValidRates).length} effective valid ratings.`);
console.log(`Current model: C=${current.prior.toFixed(4)} (unvoted discs contribute zero), SQL median=${current.sqlMedian}, m=${current.k}.`);
console.log(`Stable vote prior C=${votePrior.toFixed(4)}; alternative rated-disc mean C=${discPrior.toFixed(4)}; future-release disc excluded.`);
console.log('ID | Case | Votes | Mean | Mean arithmetic (score/rank/Δ) | Current Bayes (score/rank) | k=3 (score/rank/Δ) | k=5 (score/rank/Δ) | k=10 (score/rank/Δ) | k=15 (score/rank/Δ) | k=20 (score/rank/Δ) | Disc-mean k=10 (score/rank/Δ)');

const methodColumns = [
  ['arithmetic', 'Media aritmética'],
  ['current', 'Bayes actual'],
  ['vote-k3', 'k=3'],
  ['vote-k5', 'k=5'],
  ['vote-k10', 'k=10'],
  ['vote-k15', 'k=15'],
  ['vote-k20', 'k=20'],
  ['disc-k10', 'Discos k=10'],
];
const currentRanks = results.get('current');
const currentRows = new Map(currentRanks.map((row) => [row.id, row]));
for (const disc of discs.filter((item) => publishedDiscs.includes(item))) {
  const mean = average(rawValidRates(disc));
  const columns = methodColumns.map(([modelId]) => {
    const row = results.get(modelId).find((item) => item.id === disc.id);
    if (!row) return '—';
    const delta = modelId === 'current' ? null : (baselineRanks.get(disc.id) ?? row.rank) - row.rank;
    const base = `${row.score.toFixed(3)}/${row.rank}`;
    return modelId === 'current' ? base : `${base}/${delta >= 0 ? '+' : ''}${delta}`;
  });
  console.log(`${disc.id} | ${disc.name} | ${rawValidRates(disc).length} | ${mean === null ? '—' : mean.toFixed(2)} | ${columns.join(' | ')}`);
}

console.log('\nFiltro | Current C | Current m | Current score target B | Stable C | Stable k=10 score target B');
for (const [label] of filterCases) {
  const currentParametersForFilter = currentParameters(publishedDiscs.filter(filterCases.find(([name]) => name === label)[1]));
  console.log(`${label} | ${currentParametersForFilter.prior.toFixed(4)} | ${currentParametersForFilter.k} | ${targetCurrentScores.get(label).toFixed(4)} | ${votePrior.toFixed(4)} | ${targetStableScores.get(label).toFixed(4)}`);
}

console.log('\nAll simulator assertions passed: formula, scale, no-vote prior, zero votes, deduplication, future exclusion, filter stability, gradual excellent-vote progression, and deterministic tie-breaking.');
