import { resolveLevel } from './level-thresholds';

describe('resolveLevel', () => {
  it('asigna el nivel 1 a un usuario sin puntos', () => {
    expect(resolveLevel(0)).toEqual({
      level: 1,
      levelName: 'Oyente novato',
      totalPoints: 0,
      nextLevel: { level: 2, name: 'Oyente habitual', minPoints: 50 },
      pointsToNextLevel: 50,
    });
  });

  it('sube de nivel exactamente en el umbral (frontera inclusiva)', () => {
    const result = resolveLevel(50);
    expect(result.level).toBe(2);
    expect(result.levelName).toBe('Oyente habitual');
  });

  it('se mantiene en el nivel anterior justo antes del umbral', () => {
    const result = resolveLevel(49);
    expect(result.level).toBe(1);
  });

  it('calcula los puntos que faltan para el siguiente nivel', () => {
    const result = resolveLevel(75);
    expect(result.level).toBe(2);
    expect(result.nextLevel).toEqual({
      level: 3,
      name: 'Crítico aficionado',
      minPoints: 150,
    });
    expect(result.pointsToNextLevel).toBe(75);
  });

  it('en el nivel máximo no hay siguiente nivel y pointsToNextLevel es 0', () => {
    const result = resolveLevel(1000);
    expect(result.level).toBe(6);
    expect(result.levelName).toBe('Leyenda del riff');
    expect(result.nextLevel).toBeNull();
    expect(result.pointsToNextLevel).toBe(0);
  });

  it('por encima del nivel máximo se queda anclado en el último nivel', () => {
    const result = resolveLevel(999999);
    expect(result.level).toBe(6);
    expect(result.nextLevel).toBeNull();
  });
});
