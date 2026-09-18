export interface LevelThreshold {
  level: number;
  minPoints: number;
  name: string;
}

// Umbrales estáticos: un nivel/rango por rango de puntos acumulados.
// No es una entidad de BD a propósito (ver plan): simplicidad primero,
// se puede migrar a una tabla configurable si algún día hace falta.
export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, minPoints: 0, name: 'Oyente novato' },
  { level: 2, minPoints: 50, name: 'Oyente habitual' },
  { level: 3, minPoints: 150, name: 'Crítico aficionado' },
  { level: 4, minPoints: 300, name: 'Crítico experimentado' },
  { level: 5, minPoints: 600, name: 'Veterano de sala' },
  { level: 6, minPoints: 1000, name: 'Leyenda del riff' },
];

export interface LevelSummary {
  level: number;
  levelName: string;
  totalPoints: number;
  nextLevel: { level: number; name: string; minPoints: number } | null;
  pointsToNextLevel: number;
}

export function resolveLevel(totalPoints: number): LevelSummary {
  let current = LEVEL_THRESHOLDS[0];
  let next: LevelThreshold | null = null;

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalPoints >= LEVEL_THRESHOLDS[i].minPoints) {
      current = LEVEL_THRESHOLDS[i];
      next = LEVEL_THRESHOLDS[i + 1] ?? null;
    }
  }

  return {
    level: current.level,
    levelName: current.name,
    totalPoints,
    nextLevel: next
      ? { level: next.level, name: next.name, minPoints: next.minPoints }
      : null,
    pointsToNextLevel: next ? Math.max(next.minPoints - totalPoints, 0) : 0,
  };
}
