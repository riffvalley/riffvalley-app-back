// Contexto opcional pasado por el trigger que dispara la evaluación.
// `genreId` limita la evaluación de logros DISTINCT_ARTISTS_IN_GENRE al género
// del disco votado; `discId` permite que CONTROVERSIAL_DISC_VOTE se calcule
// sobre el disco concreto que se acaba de votar (en vez de recorrer todos).
export interface EvaluationContext {
  discId?: string;
  genreId?: string;
}
