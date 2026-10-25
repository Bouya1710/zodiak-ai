import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  toApiError,
  describeError,
  buildQuery,
  fillTemplate,
  templateVariableNames,
  missingVariables,
  isTerminal,
} from '../public/js/lib.js';

test('toApiError lit le corps { error, code, reason }', () => {
  const e = toApiError(422, { error: 'refusé', code: 'blocked', reason: 'contenu interdit' });
  assert.ok(e instanceof ApiError);
  assert.equal(e.status, 422);
  assert.equal(e.code, 'blocked');
  assert.equal(e.reason, 'contenu interdit');
});

test('toApiError déduit le code du statut HTTP quand le corps est absent', () => {
  assert.equal(toApiError(402, null).code, 'insufficient_credits');
  assert.equal(toApiError(401, {}).code, 'unauthorized');
  assert.equal(toApiError(404, undefined).code, 'not_found');
  assert.equal(toApiError(429, 'x').code, 'rate_limited');
  assert.equal(toApiError(500, null).code, 'http_error');
});

test('describeError : messages français avec motif', () => {
  assert.match(describeError(toApiError(422, { code: 'blocked', reason: 'mineur' })), /refusée.*Motif : mineur/);
  assert.match(describeError(toApiError(422, { code: 'consent_required' })), /Consentement requis/);
  assert.match(describeError(toApiError(422, { code: 'invalid', reason: 'durée > 5' })), /Demande invalide\. Motif : durée > 5/);
  assert.match(describeError(toApiError(402, { code: 'insufficient_credits' })), /Crédits insuffisants/);
  assert.match(describeError(new ApiError(0, 'network', 'x')), /Impossible de joindre/);
  assert.equal(describeError(new Error('boum')), 'boum');
  assert.match(describeError('???'), /inattendue/);
});

test('buildQuery ignore les valeurs vides', () => {
  assert.equal(buildQuery({ a: 1, b: '', c: undefined, d: 'x y' }), '?a=1&d=x+y');
  assert.equal(buildQuery({}), '');
});

test('fillTemplate remplace {{x}} et {x}', () => {
  assert.equal(fillTemplate('Un {{sujet}} dans {lieu}', { sujet: 'chat', lieu: 'la neige' }), 'Un chat dans la neige');
});

test('fillTemplate nettoie les variables vides', () => {
  assert.equal(fillTemplate('Un {{sujet}}, {{style}}, au soleil', { sujet: 'chat' }), 'Un chat, au soleil');
  assert.equal(fillTemplate('{{a}} , {{b}} !', { a: '', b: '  ' }), '!');
});

test('templateVariableNames et missingVariables', () => {
  const tpl = '{{a}} et {b} et {{a}}';
  assert.deepEqual(templateVariableNames(tpl), ['a', 'b']);
  assert.deepEqual(missingVariables(tpl, { a: 'x' }), ['b']);
});

test('isTerminal', () => {
  assert.ok(isTerminal('done') && isTerminal('blocked'));
  assert.ok(!isTerminal('running') && !isTerminal('queued'));
});
