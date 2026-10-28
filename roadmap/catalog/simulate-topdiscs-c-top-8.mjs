#!/usr/bin/env node

// Deterministic synthetic ranking scenarios for C-TOP-8.
// This file is standalone and does not connect to PostgreSQL or application data.
const discs = [
  { id: 'A', name: 'Un voto excelente', rates: [10], pinned: false },
  { id: 'B', name: 'Tres votos excelentes', rates: [10, 10, 10], pinned: false },
  { id: 'C', name: 'Diez votos excelentes', rates: Array(10).fill(10), pinned: false },
  { id: 'D', name: 'Cincuenta votos buenos', rates: Array(50).fill(8), pinned: false },
  { id: 'E', name: 'Cien votos buenos', rates: Array(100).fill(8), pinned: false },
  {
    id: 'F',
    name: 'Cien votos divididos',
    rates: [...Array(50).fill(0), ...Array(50).fill(10)],
    pinned: false,
  },
  { id: 'G', name: 'Tres votos negativos', rates: [0, 0, 0], pinned: false },
  { id: 'H', name: 'Dos votos cero', rates: [0, 0], pinned: false },
  { id: 'I', name: 'Pinned sin votos', rates: [], pinned: true },
  { id: 'J', name: 'Veinte votos mixtos', rates: [...Array(10).fill(2), ...Array(10).fill(8)], pinned: false },
];

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentileContMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * 0.5;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * fraction;
}

function currentMedianVotes(values) {
  // Mirrors Number.parseInt(String(PERCENTILE_CONT(...)), 10) || 1.
  return Math.trunc(percentileContMedian(values) ?? 0) || 1;
}

function stats(items) {
  const perDiscMeans = items.map((disc) => average(disc.rates) ?? 0);
  return {
    mean: average(perDiscMeans) ?? 0,
    medianVotes: currentMedianVotes(items.map((disc) => disc.rates.length)),
  };
}

function score(disc, method, parameters) {
  const mean = average(disc.rates) ?? 0;
  const count = disc.rates.length;
  if (method === 'A') return mean;
  const { prior, confidence } = parameters;
  return ((mean * count) + (prior * confidence)) / (count + confidence);
}

function rank(items, method, parameters) {
  return [...items]
    .map((disc) => ({
      ...disc,
      mean: average(disc.rates),
      score: score(disc, method, parameters),
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((disc, index) => ({ ...disc, rank: index + 1 }));
}

const local = stats(discs);
const methods = [
  { id: 'A', label: 'Media aritmética', parameters: {} },
  { id: 'B', label: 'Bayes actual', parameters: { prior: local.mean, confidence: local.medianVotes } },
  { id: 'C', label: 'Bayes global estable, k=5', parameters: { prior: 6.5, confidence: 5 } },
  { id: 'D', label: 'Bayes global estable, k=10', parameters: { prior: 6.5, confidence: 10 } },
];

console.log(`Universo sintético actual: media global=${local.mean.toFixed(4)}, mediana SQL=${percentileContMedian(discs.map((disc) => disc.rates.length))}, k tras conversión=${local.medianVotes}`);
console.log('Método | ID | Disco | Votos | Media real | Puntuación | Posición | Δ puestos vs B');
const baseline = new Map(rank(discs, 'B', methods[1].parameters).map((disc) => [disc.id, disc.rank]));
for (const method of methods) {
  for (const disc of rank(discs, method.id, method.parameters)) {
    const difference = baseline.get(disc.id) - disc.rank;
    console.log(`${method.label} | ${disc.id} | ${disc.name} | ${disc.rates.length} | ${disc.mean === null ? '—' : disc.mean.toFixed(2)} | ${disc.score.toFixed(4)} | ${disc.rank} | ${difference >= 0 ? '+' : ''}${difference}`);
  }
}

console.log('\nSensibilidad de un mismo disco (tres votos de 10):');
const threeExcellent = discs.find((disc) => disc.id === 'B');
for (const [label, prior, confidence] of [
  [`Actual: prior ${local.mean}, k=${local.medianVotes}`, local.mean, local.medianVotes],
  ['Global fijo: prior 6.5, k=5', 6.5, 5],
  ['Global fijo: prior 6.5, k=10', 6.5, 10],
  ['Global fijo: prior 6.5, k=20', 6.5, 20],
]) {
  console.log(`${label} => ${score(threeExcellent, 'C', { prior, confidence }).toFixed(4)}`);
}

console.log('\nSensibilidad a filtros sobre el disco B (3 votos de 10):');
for (const [label, items] of [
  ['Universo completo', discs],
  ['Solo discos con votos', discs.filter((disc) => disc.rates.length > 0)],
  ['Solo grupo pequeño', discs.filter((disc) => ['A', 'B', 'G', 'H', 'I'].includes(disc.id))],
]) {
  const current = stats(items);
  console.log(`${label}: media global=${current.mean.toFixed(4)}, k=${current.medianVotes}, score B=${score(threeExcellent, 'C', { prior: current.mean, confidence: current.medianVotes }).toFixed(4)}`);
}
