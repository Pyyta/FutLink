/**
 * Variante es-MX. Solo se declaran las cadenas que cambian; i18next completa
 * el resto con el fallback es-CO.
 */
const esMX = {
  auth: {
    loginSubtitle: 'Regresa a la cancha y encuentra tu próximo partido.',
    registerSubtitle: 'Únete a la comunidad de fútbol amateur de Bogotá.',
    hasAccount: '¿Ya tienes cuenta?',
  },
  home: {
    subtitle: 'Tu comunidad de fútbol amateur, a un toque.',
    heroBody:
      'Busca partidos y jugadores cerca de ti, y gestiona tus solicitudes desde un solo lugar.',
  },
  search: {
    subtitle: 'Encuentra jugadores y partidos cerca de ti.',
  },
} as const;

export default esMX;
