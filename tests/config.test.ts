/**
 * config.ts 단위 테스트
 * - getDefaultConfig()가 올바른 기본값을 반환하는지 확인
 * - 설정 로드/저장은 파일 I/O가 포함되므로 통합 테스트에 가까움
 */
import { describe, it, expect } from 'vitest';
import { getDefaultConfig } from '../src/config';

describe('getDefaultConfig', () => {
  it('should return valid default config with required fields', () => {
    const config = getDefaultConfig();

    expect(config._config_version).toBe(3);
    expect(config.credentials).toBeDefined();
    expect(config.plan.speed_mbps).toBe(1000);
    expect(config.schedule.timezone).toBe('Asia/Seoul');
    expect(config.headless).toBe(true);
  });

  it('should have schedule with multi-attempt defaults', () => {
    const config = getDefaultConfig();

    expect(config.schedule.max_attempts).toBeGreaterThan(1);
    expect(config.schedule.retry_interval_minutes).toBeGreaterThan(0);
    expect(config.schedule.stop_on_complaint_success).toBe(true);
  });
});
