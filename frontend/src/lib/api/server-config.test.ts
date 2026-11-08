import { beforeEach, describe, expect, it } from 'vitest';
import {
  API_URL_STORAGE_KEY,
  BUILD_API_URL,
  getApiBaseUrl,
  normalizeApiUrl,
  resetApiUrl,
  setApiUrl,
} from './server-config';

describe('normalizeApiUrl', () => {
  it('agrega /api cuando solo se indica el host', () => {
    expect(normalizeApiUrl('https://demo.trycloudflare.com')).toBe(
      'https://demo.trycloudflare.com/api',
    );
  });

  it('quita barras finales y conserva la ruta', () => {
    expect(normalizeApiUrl('https://demo.trycloudflare.com/api/')).toBe(
      'https://demo.trycloudflare.com/api',
    );
  });

  it('agrega http:// cuando falta el esquema', () => {
    expect(normalizeApiUrl('192.168.1.10:3000')).toBe(
      'http://192.168.1.10:3000/api',
    );
  });

  it('rechaza esquemas que no son HTTP', () => {
    expect(normalizeApiUrl('ftp://servidor/api')).toBeNull();
  });

  it('rechaza texto que no es una URL', () => {
    expect(normalizeApiUrl('no es una url')).toBeNull();
    expect(normalizeApiUrl('   ')).toBeNull();
  });
});

describe('getApiBaseUrl', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('usa la configuración guardada', () => {
    setApiUrl('https://mi-servidor.com/api');

    expect(getApiBaseUrl()).toBe('https://mi-servidor.com/api');
  });

  it('vuelve al valor de compilación al restaurar', () => {
    setApiUrl('https://mi-servidor.com/api');
    resetApiUrl();

    expect(getApiBaseUrl()).toBe(BUILD_API_URL);
    expect(window.localStorage.getItem(API_URL_STORAGE_KEY)).toBeNull();
  });
});
