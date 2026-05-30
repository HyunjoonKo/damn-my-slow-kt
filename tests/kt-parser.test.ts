/**
 * kt.ts 결과 파싱 단위 테스트
 * - Windows에서 KT 측정 프로그램 결과가 DOM에 전달되지 않는 경우 0Mbps PASS로 오판하지 않아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { parseMbpsValue, summarizeSlaResults } from '../src/kt';

describe('parseMbpsValue', () => {
  it('extracts Mbps values from formatted text', () => {
    expect(parseMbpsValue('123.4 Mbps')).toBe(123.4);
    expect(parseMbpsValue('1,234.5')).toBe(1234.5);
  });

  it('returns null when there is no numeric speed', () => {
    expect(parseMbpsValue('')).toBeNull();
    expect(parseMbpsValue('측정값 없음')).toBeNull();
  });
});

describe('summarizeSlaResults', () => {
  it('does not mark empty round speeds as PASS with 0Mbps', () => {
    const summary = summarizeSlaResults({
      rounds: [],
      satisfyCount: 0,
      failCount: 1,
      totalCount: 1,
      fullText: '테스트 횟수 1 번 중 SLA만족 횟수는 0 번, 미달 횟수는 1 번 입니다.',
    });

    expect(summary.downloadMbps).toBe(0);
    expect(summary.slaResult).toBe('unknown');
    expect(summary.error).toContain('회차별 다운로드 속도');
    expect(summary.rawData).toMatchObject({
      total: 1,
      satisfy: 0,
      fail: 1,
      rounds: [],
      parsed_speed_count: 0,
    });
  });

  it('does not use text fallback when no speed values were parsed', () => {
    const summary = summarizeSlaResults({
      rounds: [],
      satisfyCount: 0,
      failCount: 0,
      totalCount: 0,
      fullText: 'SLA만족 횟수는 5 번 입니다.',
    });

    expect(summary.downloadMbps).toBe(0);
    expect(summary.slaResult).toBe('unknown');
    expect(summary.error).toContain('요약 정보');
  });

  it('keeps partially completed rounds as unknown instead of final SLA result', () => {
    const summary = summarizeSlaResults({
      rounds: [
        { speed: '100 Mbps', slaRef: '500 Mbps', result: '미달', date: '1' },
        { speed: '200 Mbps', slaRef: '500 Mbps', result: '미달', date: '2' },
        { speed: '300 Mbps', slaRef: '500 Mbps', result: '미달', date: '3' },
        { speed: '600 Mbps', slaRef: '500 Mbps', result: '만족', date: '4' },
      ],
      satisfyCount: 1,
      failCount: 3,
      totalCount: 4,
      fullText: '테스트 횟수 4 번 중 SLA만족 횟수는 1 번, 미달 횟수는 3 번 입니다.',
    });

    expect(summary.downloadMbps).toBe(300);
    expect(summary.slaResult).toBe('unknown');
    expect(summary.error).toBe('SLA 측정이 4/5회만 기록되어 완료되지 않았습니다.');
  });

  it('stores inferred plan speed from KT SLA reference', () => {
    const summary = summarizeSlaResults({
      rounds: [
        { speed: '481.6 Mbps', slaRef: '250 Mbps', result: '만족', date: '1' },
        { speed: '477.7 Mbps', slaRef: '250 Mbps', result: '만족', date: '2' },
      ],
      satisfyCount: 2,
      failCount: 0,
      totalCount: 2,
      fullText: '테스트 횟수 2 번 중 SLA만족 횟수는 2 번, 미달 횟수는 0 번 입니다.',
    });

    expect(summary.rawData).toMatchObject({
      sla_ref_mbps: 250,
      inferred_plan_mbps: 500,
    });
  });

  it('uses text fallback for fail when speeds exist but summary counts are missing', () => {
    const summary = summarizeSlaResults({
      rounds: [{ speed: '120 Mbps', slaRef: '500 Mbps', result: '', date: '1' }],
      satisfyCount: 0,
      failCount: 0,
      totalCount: 0,
      fullText: '미달 횟수는 3 번 입니다.',
    });

    expect(summary.downloadMbps).toBe(120);
    expect(summary.slaResult).toBe('fail');
    expect(summary.error).toBe('');
  });

  it('uses text fallback for pass when speeds exist but summary counts are missing', () => {
    const summary = summarizeSlaResults({
      rounds: [{ speed: '800 Mbps', slaRef: '500 Mbps', result: '', date: '1' }],
      satisfyCount: 0,
      failCount: 0,
      totalCount: 0,
      fullText: 'SLA만족 횟수는 5 번 입니다.',
    });

    expect(summary.downloadMbps).toBe(800);
    expect(summary.slaResult).toBe('pass');
    expect(summary.error).toBe('');
  });

  it('does not use total test count as fallback fail count', () => {
    const summary = summarizeSlaResults({
      rounds: [{ speed: '800 Mbps', slaRef: '500 Mbps', result: '', date: '1' }],
      satisfyCount: 0,
      failCount: 0,
      totalCount: 0,
      fullText: '테스트 횟수 5 번 중 SLA만족 횟수는 5 번, 미달 횟수는 0 번 입니다.',
    });

    expect(summary.downloadMbps).toBe(800);
    expect(summary.slaResult).toBe('pass');
    expect(summary.error).toBe('');
  });

  it('averages completed round speeds and marks SLA fail on three failures', () => {
    const summary = summarizeSlaResults({
      rounds: [
        { speed: '100 Mbps', slaRef: '500 Mbps', result: '미달', date: '1' },
        { speed: '200 Mbps', slaRef: '500 Mbps', result: '미달', date: '2' },
        { speed: '300 Mbps', slaRef: '500 Mbps', result: '미달', date: '3' },
        { speed: '600 Mbps', slaRef: '500 Mbps', result: '만족', date: '4' },
        { speed: '700 Mbps', slaRef: '500 Mbps', result: '만족', date: '5' },
      ],
      satisfyCount: 2,
      failCount: 3,
      totalCount: 5,
      fullText: '',
    });

    expect(summary.downloadMbps).toBe(380);
    expect(summary.slaResult).toBe('fail');
    expect(summary.error).toBe('');
  });
});
