import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculate, searchLauncher, validateLauncherPatch } from '../src/shared/launcher'

test('launcher arithmetic has precedence, unary signs and percentages without evaluating code', () => {
  for (const [input, expected] of [['(128 + 32) / 4', '40'], ['2+3*4', '14'], ['-.5 * 10', '-5'], ['0.1+0.2', '0.3'], ['200 * 15%', '30'], ['= 6 × 7', '42']]) assert.equal(calculate(input), expected)
  for (const input of ['', '1/0', '1..2', '2(3)', '(1+2', 'process.exit()', 'globalThis.secret', '1;alert(1)', '2**4', '-'.repeat(100) + '1', '9'.repeat(257)]) assert.equal(calculate(input), undefined)
})
test('launcher search and settings enforce enabled categories and known actions', () => {
  assert.equal(searchLauncher('uuid', ['copy'])[0].id, 'copy:uuid')
  assert.equal(searchLauncher('uuid', ['tools']).length, 0)
  assert.equal(searchLauncher('剪贴板', ['desktop'])[0].id, 'widget:clipboard')
  assert.equal(searchLauncher('time', ['tools'])[0].id, 'page:time-tools')
  assert.deepEqual(validateLauncherPatch({ enabled: true, groups: [] }), { enabled: true, groups: [] })
  for (const patch of [{ enabled: 'yes' }, { groups: ['shell'] }, { groups: ['web', 'web'] }, { command: 'cmd' }]) assert.throws(() => validateLauncherPatch(patch))
})
