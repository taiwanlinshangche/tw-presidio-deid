import { test, expect } from '@playwright/test';
import { expandMatches } from '../frontend/entity-matches.js';

test('重複比對把正規表示式符號當成原文字元', () => {
  const text = 'a+b@example.invalid aaab@exampleXinvalid a+b@example.invalid';
  const matches = expandMatches(text, [{ start: 0, end: 19, type: 'EMAIL_ADDRESS', score: .9 }]);
  expect(matches.map(e => text.slice(e.start, e.end))).toEqual(['a+b@example.invalid', 'a+b@example.invalid']);
});

test('較長完整標籤優先，不拆開不同實體', () => {
  const text = '新北市。新北市青年局。新北市青年局';
  const matches = expandMatches(text, [{ start: 0, end: 3, type: 'LOCATION' }, { start: 4, end: 10, type: 'ORGANIZATION' }]);
  expect(matches.map(e => text.slice(e.start, e.end))).toEqual(['新北市', '新北市青年局', '新北市青年局']);
});

test('展開超過上限時拒絕而非截斷', () => {
  expect(() => expandMatches('甲'.repeat(1201), [{ start: 0, end: 1, type: 'PERSON' }])).toThrow('1,200');
});

test('不同起點的短地名不吞掉已辨識的完整機構', () => {
  const text = '新北市。新北市立聯合醫院。市立聯合醫院';
  const matches = expandMatches(text, [{ start: 0, end: 3, type: 'LOCATION' }, { start: 6, end: 12, type: 'ORGANIZATION' }]);
  expect(matches.map(e => [e.start, e.end, text.slice(e.start, e.end)])).toEqual([[0, 3, '新北市'], [6, 12, '市立聯合醫院'], [13, 19, '市立聯合醫院']]);
});
