/**
 * Variante es-AR. Solo se declaran las cadenas que cambian; i18next completa
 * el resto con el fallback es-CO.
 */
const esAR = {
  auth: {
    loginSubtitle: 'Volvé a la cancha y encontrá tu próximo partido.',
    registerSubtitle: 'Sumate a la comunidad de fútbol amateur de Bogotá.',
    completeProfileSubtitle:
      'Necesitamos tus datos deportivos antes de mostrarte la app.',
    noAccount: '¿Todavía no tenés cuenta?',
    hasAccount: '¿Ya tenés cuenta?',
  },
  home: {
    subtitle: 'Tu comunidad de fútbol amateur, a un toque.',
    heroBody:
      'Buscá partidos y jugadores cerca de vos, y gestioná tus solicitudes desde un solo lugar.',
  },
  search: {
    subtitle: 'Encontrá jugadores y partidos cerca de vos.',
  },
  completeProfile: {
    body: 'Contanos cómo jugás para que otros jugadores puedan encontrarte.',
  },
  editProfile: {
    subtitle: 'Actualizá tus datos deportivos y de contacto.',
  },
  publicProfile: {
    phonePrivateHint:
      'Solo se muestra cuando hay una solicitud aceptada entre ambos.',
  },
} as const;

export default esAR;
