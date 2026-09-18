// Timezone fijo para calcular límites de "día" en rachas (VOTE_STREAK).
// Explícito y documentado para no depender del timezone implícito del servidor
// (ver bug histórico de criterios de fecha mezclados en rates-stats: commit ef8670f).
export const ACHIEVEMENT_STREAK_TIMEZONE = 'Europe/Madrid';
