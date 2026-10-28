import test from 'node:test';
import assert from 'node:assert/strict';
import { storeProfileInput, publicProfile } from '../services/store_profile.js';

const valid = {
  expectedVersion: 1, displayName: 'Loja Modelo', tagline: 'Produtos selecionados', description: '',
  logoUrl: 'https://res.cloudinary.com/demo/logo.png', bannerUrl: '', primaryColor: '#12aa34',
  supportEmail: 'Contato@Exemplo.com', supportPhone: '11999998888',
  instagramUrl: '', privacyUrl: 'https://example.com/privacy',
  termsUrl: 'https://example.com/terms', returnsUrl: 'https://example.com/returns',
};
test('perfil valida e normaliza campos públicos', () => {
  const value = storeProfileInput.parse(valid);
  assert.equal(value.primaryColor, '#12AA34');
  assert.equal(value.supportEmail, 'contato@exemplo.com');
  assert.equal(value.bannerUrl, null);
});
test('rejeita URL sem HTTPS, cor inválida, telefone inválido e campo secreto', () => {
  assert.equal(storeProfileInput.safeParse({...valid, logoUrl: 'http://inseguro.com/logo'}).success, false);
  assert.equal(storeProfileInput.safeParse({...valid, primaryColor: '#FFF'}).success, false);
  assert.equal(storeProfileInput.safeParse({...valid, supportPhone: '123'}).success, false);
  assert.equal(storeProfileInput.safeParse({...valid, mercadoPagoToken: 'segredo'}).success, false);
});
test('prepara apenas metadados públicos da loja, sem versão ou credenciais', () => {
  const profile = publicProfile({primary_color:'#123456',tagline:'Olá',version:7,
    provider_secret:'NÃO_PUBLICAR', support_email:'a@b.com'});
  assert.equal(profile.primaryColor, '#123456');
  assert.equal((profile as Record<string, unknown>)['provider_secret'], undefined);
  assert.equal((profile as Record<string, unknown>)['version'], undefined);
});
