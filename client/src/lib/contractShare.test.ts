// Run with: npm test  (node --test --experimental-strip-types)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contractShare } from './contractShare.ts';

test('share and cumulative of contract', () => {
  assert.deepEqual(contractShare('100000', '500000', '0'), {
    share: '0.200000',
    cumulative: '0.200000',
    exceeds: false,
  });
  // POR16513: 20% DP + 30% PB already paid, next 30% PB
  assert.deepEqual(contractShare('444900', '1483000', '741500'), {
    share: '0.300000',
    cumulative: '0.800000',
    exceeds: false,
  });
});

test('decimals stay exact', () => {
  assert.equal(contractShare('333.33', '1000', '0')?.share, '0.333330');
  assert.equal(contractShare('0.1', '0.3', '0.2')?.cumulative, '1.000000');
  assert.equal(contractShare('0.1', '0.3', '0.2')?.exceeds, false);
});

test('flags a payment that takes the PO past 100%', () => {
  assert.equal(contractShare('100.01', '1000', '900')?.exceeds, true);
});

test('nothing to show for missing or invalid input', () => {
  for (const amount of ['', '-', 'abc', '0', '-5', 'NaN', 'Infinity']) {
    assert.equal(contractShare(amount, '1000', '0'), null, `amount ${JSON.stringify(amount)}`);
  }
  assert.equal(contractShare('100', '0', '0'), null);
  assert.equal(contractShare('100', '', '0'), null);
});
