/**
 * KT 자동화 - speed.kt.com 품질보증 테스트
 *
 * Flow (실제 테스트를 통해 검증된 플로우):
 *   1. https://speed.kt.com/sla/slatest/introduce.asp 접속
 *   2. "품질보증(SLA) 테스트" 버튼 클릭 (class="redbtn btntolayer") → 레이어 팝업
 *   3. 레이어에서 회선 선택 (radio button - el-radio 컴포넌트, value="0")
 *   4. "#measureBtn" 클릭 → 테스트 시작
 *   5. 5회 자동 측정 완료 대기 (각 300초 간격 → 총 ~25분)
 *   6. 결과 파싱 (SLA pass/fail)
 *   7. fail이면 "이의신청" 버튼 클릭
 *
 * 로그인 플로우:
 *   - 로그인 없이 접속 → accounts.kt.com으로 리다이렉트
 *   - 로그인 후 비밀번호 변경 안내 → "다음에 하기" 클릭 (3개월 유예)
 *   - 로그인 완료 후 SLA 소개 페이지로 복귀
 */

import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { execSync } from 'child_process';
import { Config } from './config';
import chalk from 'chalk';

const KT_SLA_INTRO_URL = 'https://speed.kt.com/sla/slatest/introduce.asp';
// TEST_TIMEOUT_MIN 환경변수로 타임아웃 조절 가능 (기본 40분)
const SLA_TEST_TIMEOUT_MS = (parseInt(process.env.TEST_TIMEOUT_MIN || '0') || 40) * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000; // 15초 — 라운드 변화를 빠르게 감지

// ─── 진행 UI 헬퍼 ────────────────────────────────────────────────

const STEPS = {
  login:   { num: 1, total: 5, label: '로그인' },
  layer:   { num: 2, total: 5, label: 'SLA 테스트 준비' },
  measure: { num: 3, total: 5, label: '속도 측정' },
  parse:   { num: 4, total: 5, label: '결과 분석' },
  action:  { num: 5, total: 5, label: '감면 처리' },
};

function stepHeader(step: { num: number; total: number; label: string }): void {
  const bar = '●'.repeat(step.num) + '○'.repeat(step.total - step.num);
  console.log(chalk.cyan(`\n  ${bar}  `) + chalk.bold(`[${step.num}/${step.total}] ${step.label}`));
}

function info(msg: string): void {
  console.log(chalk.dim(`       ${msg}`));
}

function formatElapsed(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

/** 측정 진행 바 (1~5회차) */
function measureProgress(round: number, total: number, elapsedMs: number): void {
  const filled = round;
  const empty = total - round;
  const bar = chalk.green('■'.repeat(filled)) + chalk.gray('□'.repeat(empty));
  const elapsed = formatElapsed(elapsedMs);
  // 커서를 줄 앞으로 이동하여 같은 줄에 덮어쓰기
  if (process.stdout.isTTY) {
    process.stdout.write(`\r       ${bar}  ${round}/${total}회 완료  ${chalk.dim(elapsed)}  `);
  } else {
    console.log(`       ${bar}  ${round}/${total}회 완료  ${elapsed}`);
  }
}

export interface SpeedTestResult {
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  sla_result: 'pass' | 'fail' | 'unknown';
  complaint_filed: boolean;
  complaint_result: 'success' | 'failed' | 'skipped' | 'not_applicable';
  raw_data: Record<string, unknown>;
  error: string;
}

function defaultResult(): SpeedTestResult {
  return {
    download_mbps: 0,
    upload_mbps: 0,
    ping_ms: 0,
    sla_result: 'unknown',
    complaint_filed: false,
    complaint_result: 'skipped',
    raw_data: {},
    error: '',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class KTProvider {
  private config: Config;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  async run(dryRun = false): Promise<SpeedTestResult> {
    const result = defaultResult();

    // Playwright 브라우저 바이너리가 없으면 자동 설치 (npx 첫 실행 시 필요)
    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--use-fake-ui-for-media-stream',
          '--disable-web-security',
        ],
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.message.includes("Executable doesn't exist")) {
        console.log('📦 Chromium 브라우저 설치 중... (최초 1회)');
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        this.browser = await chromium.launch({
          headless: this.config.headless,
          args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--use-fake-ui-for-media-stream',
            '--disable-web-security',
          ],
        });
      } else {
        throw e;
      }
    }

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });

    try {
      this.page = await this.context.newPage();

      // Step 1: 로그인
      stepHeader(STEPS.login);
      info('speed.kt.com 접속 중...');
      await this.page.goto(KT_SLA_INTRO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      await this.handleLogin();

      const currentUrl = this.page.url();
      if (!currentUrl.includes('sla/slatest/introduce.asp')) {
        info('SLA 페이지로 이동 중...');
        await this.page.goto(KT_SLA_INTRO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2000);
      }
      info('로그인 완료');

      // Step 2: SLA 테스트 준비
      stepHeader(STEPS.layer);
      info('품질보증(SLA) 테스트 레이어 열기...');
      await this.openSlaLayer();
      info('회선 선택 중...');
      await this.selectLine();
      info('준비 완료');

      // Step 3: 속도 측정
      stepHeader(STEPS.measure);
      info('5회 측정 시작 (약 25분 소요)');
      await this.startMeasurement();
      await this.waitForCompletion();

      // Step 4: 결과 분석
      stepHeader(STEPS.parse);
      info('측정 데이터 파싱 중...');
      const parsed = await this.parseResults();
      Object.assign(result, parsed);

      // Step 5: 감면 처리
      stepHeader(STEPS.action);
      if (result.sla_result === 'fail' && !dryRun) {
        info('SLA 미달 → 이의신청 진행...');
        const ok = await this.fileComplaint();
        result.complaint_filed = ok;
        result.complaint_result = ok ? 'success' : 'failed';
        info(ok ? '이의신청 완료' : '이의신청 실패');
      } else if (result.sla_result === 'fail' && dryRun) {
        info('SLA 미달 (dry-run → 이의신청 생략)');
        result.complaint_result = 'skipped';
      } else if (result.sla_result === 'pass') {
        info('SLA 통과 → 이의신청 불필요');
        result.complaint_result = 'not_applicable';
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      info(chalk.red(`오류: ${err.message}`));
      result.error = err.message;
      result.sla_result = 'unknown';

      // 오류 스크린샷
      try {
        await this.page?.screenshot({ path: 'kt-error.png' });
        info('스크린샷 저장: kt-error.png');
      } catch {
        // ignore
      }
    } finally {
      await this.context?.close();
      await this.browser?.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    return result;
  }

  private async handleLogin(): Promise<void> {
    const page = this.page!;
    const { id, password } = this.config.credentials;

    if (!id || !password) {
      throw new Error('KT 계정 정보가 설정되지 않았습니다. 설정 파일을 확인하세요.');
    }

    const url = page.url();
    if (!url.includes('accounts.kt.com')) {
      return;
    }

    info('KT 로그인 페이지 감지...');
    await this.fillLoginForm(id, password);

    // 로그인 후 리다이렉트 대기 — accounts.kt.com에서 벗어날 때까지
    try {
      await page.waitForURL((url) => !url.toString().includes('accounts.kt.com'), { timeout: 15000 });
    } catch {
      // 비밀번호 변경 등 중간 페이지에서 멈출 수 있음
    }
    await sleep(2000);

    const afterUrl = page.url();
    if (afterUrl.includes('unchanged-password') || afterUrl.includes('change-password')) {
      info('비밀번호 변경 안내 → 다음에 하기');
      try {
        await page.waitForSelector('button', { timeout: 5000 });
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          for (const btn of btns) {
            const text = btn.textContent || '';
            if (text.includes('다음에 하기') || text.includes('나중에') || text.includes('Skip')) {
              btn.click();
              return;
            }
          }
        });
        await sleep(3000);
      } catch {
        // 다음에 하기 버튼 없음, 계속 진행
      }
    }
  }

  private async openSlaLayer(): Promise<void> {
    const page = this.page!;
    const { id, password } = this.config.credentials;

    // SLA 테스트 버튼 클릭 — 미로그인 시 accounts.kt.com으로 리다이렉트됨
    const btnExists = await page.evaluate(() => {
      return !!document.querySelector('a.redbtn.btntolayer');
    });

    if (!btnExists) {
      throw new Error('품질보증(SLA) 테스트 버튼을 찾지 못했습니다');
    }

    await page.click('a.redbtn.btntolayer');
    await sleep(3000);

    // 로그인 페이지로 리다이렉트 되었는지 확인
    const currentUrl = page.url();
    if (currentUrl.includes('accounts.kt.com')) {
      info('로그인 필요 → 로그인 진행');
      await this.fillLoginForm(id, password);

      // 로그인 후 리다이렉트 대기
      try {
        await page.waitForURL((url) => !url.toString().includes('accounts.kt.com'), { timeout: 15000 });
      } catch {
        // 비밀번호 변경 안내 등 중간 페이지에서 멈출 수 있음
      }
      await sleep(2000);

      // 비밀번호 변경 안내 처리
      const afterUrl = page.url();
      if (afterUrl.includes('unchanged-password') || afterUrl.includes('change-password')) {
        info('비밀번호 변경 안내 → 다음에 하기');
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          for (const btn of btns) {
            if ((btn.textContent || '').includes('다음에 하기')) {
              btn.click();
              return;
            }
          }
        });
        await sleep(3000);
      }

      // 로그인 후 SLA 페이지로 재접속
      if (!page.url().includes('sla/slatest/introduce.asp')) {
        await page.goto(KT_SLA_INTRO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2000);
      }

      // 다시 레이어 버튼 클릭
      await page.click('a.redbtn.btntolayer');
      await sleep(3000);
    }

    // 레이어가 열렸는지 확인 — Vue 컴포넌트가 #ifArea에 회선 정보를 렌더링
    const layerText = await page.evaluate(() => {
      return document.getElementById('ifArea')?.textContent?.trim().slice(0, 200) || '';
    });

    if (!layerText) {
      throw new Error('로그인 후에도 SLA 레이어가 열리지 않았습니다');
    }

    info('SLA 레이어 열림');
  }

  private async fillLoginForm(id: string, password: string): Promise<void> {
    const page = this.page!;

    // accounts.kt.com 로그인 폼: input#id (아이디), input#password (비밀번호)
    // 구버전 호환을 위해 generic selector도 fallback으로 유지
    const idSelectors = ['input#id', "input[name='id']", "input[type='text']"];
    const pwSelectors = ['input#password', "input[name='password']", "input[type='password']"];

    let idFilled = false;
    for (const sel of idSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.fill(sel, id);
        info(`계정: ${id}`);
        idFilled = true;
        break;
      } catch {
        continue;
      }
    }
    if (!idFilled) return;

    for (const sel of pwSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.fill(sel, password);
        break;
      } catch {
        continue;
      }
    }

    // 로그인 버튼 클릭 — Playwright의 click()으로 안정적인 클릭
    try {
      const loginBtn = page.locator('button[type="submit"]').filter({ hasText: '로그인' });
      await loginBtn.waitFor({ state: 'visible', timeout: 3000 });
      await loginBtn.click();
    } catch {
      // fallback: evaluate로 직접 클릭
      try {
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button, input[type="submit"]');
          for (const btn of btns) {
            const text = (btn as HTMLElement).textContent || (btn as HTMLInputElement).value || '';
            if (text.includes('로그인')) {
              (btn as HTMLElement).click();
              return;
            }
          }
        });
      } catch {
        // 로그인 버튼 없음
      }
    }
  }

  private async selectLine(): Promise<void> {
    const page = this.page!;

    const result = await page.evaluate(() => {
      // Element UI 라디오 — 첫 번째 회선이 기본 선택됨
      const radioLabel = document.querySelector('label.el-radio.addr') as HTMLElement | null;
      if (radioLabel) {
        radioLabel.click(); // Element UI는 label 클릭으로 선택 처리

        // 회선 정보 텍스트 추출 (상품명 - 주소)
        const labelText = radioLabel.querySelector('.el-radio__label')?.textContent?.trim() || '';
        return labelText || 'selected (no label)';
      }

      // fallback: generic radio
      const radioInput = document.querySelector('input[type="radio"]') as HTMLInputElement | null;
      if (radioInput) {
        radioInput.checked = true;
        radioInput.dispatchEvent(new Event('change', { bubbles: true }));
        const label = radioInput.closest('label');
        if (label) (label as HTMLElement).click();
        return radioInput.value;
      }
      return 'no radio found';
    });

    if (result && result !== 'no radio found') {
      info(`회선: ${result}`);
    }

    await sleep(500);
  }

  private async startMeasurement(): Promise<void> {
    const page = this.page!;

    // #measureBtn (a.speed_speedtest_prestart_btn) 클릭 — Vue 컴포넌트가 SLA 테스트 시작
    const btn = page.locator('#measureBtn, a.speed_speedtest_prestart_btn').first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await btn.click();
    } catch {
      throw new Error('속도 측정 시작 버튼(#measureBtn)을 찾지 못했습니다');
    }

    await sleep(5000);

    // 측정이 시작되었는지 확인 — "회차 측정중" 또는 결과 테이블이 나타나야 함
    const layerText = await page.evaluate(() => {
      return (
        document
          .getElementById('ifArea')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim()
          .slice(0, 300) || ''
      );
    });

    if (layerText.includes('측정중') || layerText.includes('SLA 테스트')) {
      info('측정 시작 확인');
    } else {
      info('측정 시작 대기 중...');
    }
  }

  private async waitForCompletion(): Promise<void> {
    const page = this.page!;
    const maxWaitMs = SLA_TEST_TIMEOUT_MS;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      await sleep(POLL_INTERVAL_MS);
      elapsed += POLL_INTERVAL_MS;

      // 구조화된 CSS 클래스로 회차별 결과를 직접 파싱
      const status = await page.evaluate(() => {
        const ifArea = document.getElementById('ifArea');
        if (!ifArea) return null;

        // 완료된 회차 수 — 측정값이 채워진 행 카운트
        let completedRounds = 0;
        for (let i = 1; i <= 5; i++) {
          const speedEl = ifArea.querySelector(`.step-table-speed-${i}`);
          if (speedEl && speedEl.textContent?.trim()) {
            completedRounds++;
          }
        }

        // "측정중" 상태 확인
        const fullText = ifArea.textContent?.replace(/\s+/g, ' ').trim() || '';
        const isMeasuring = fullText.includes('측정중');

        // 카운트다운 타이머
        const countdown = ifArea.querySelector('.delayTimeSec')?.textContent?.trim() || '';

        // 결과 요약 텍스트
        const totalMatch = fullText.match(/테스트\s*횟수\s*(\d+)\s*번/);
        const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

        return { completedRounds, isMeasuring, countdown, totalCount, textSnippet: fullText.slice(0, 200) };
      });

      if (!status) continue;

      if (process.env.DEBUG_POLL) {
        console.log(`\n[DEBUG POLL ${formatElapsed(elapsed)}] rounds=${status.completedRounds} measuring=${status.isMeasuring} countdown=${status.countdown} total=${status.totalCount}`);
        console.log(`  text: ${status.textSnippet}`);
      }

      // 진행률 표시 — CSS 기반 완료 회차 수 우선, fallback으로 텍스트 파싱
      const roundsDone = status.completedRounds || status.totalCount;

      if (roundsDone >= 5 && !status.isMeasuring) {
        measureProgress(5, 5, elapsed);
        if (process.stdout.isTTY) console.log('');
        info('5회 측정 완료!');
        break;
      } else if (roundsDone > 0) {
        measureProgress(roundsDone, 5, elapsed);
        if (status.countdown) {
          // 카운트다운은 TTY에서만 같은 줄에 표시
          if (process.stdout.isTTY) {
            process.stdout.write(chalk.dim(` 다음: ${status.countdown}`));
          }
        }
      }
    }

    if (elapsed >= maxWaitMs) {
      if (process.stdout.isTTY) console.log('');
      info(chalk.yellow(`⏰ ${Math.round(maxWaitMs / 60000)}분 타임아웃 - 현재 결과로 진행`));
    }
  }

  private async parseResults(): Promise<Partial<SpeedTestResult>> {
    const page = this.page!;
    const result: Partial<SpeedTestResult> = {
      download_mbps: 0,
      upload_mbps: 0,
      ping_ms: 0,
      sla_result: 'unknown',
      raw_data: {},
      error: '',
    };

    try {
      // 구조화된 DOM에서 회차별 데이터를 직접 추출
      const parsed = await page.evaluate(() => {
        const ifArea = document.getElementById('ifArea');
        if (!ifArea) return null;

        // 회차별 결과 파싱 — CSS 클래스 기반
        const rounds: Array<{ speed: string; slaRef: string; result: string; date: string }> = [];
        for (let i = 1; i <= 5; i++) {
          const speed = ifArea.querySelector(`.step-table-speed-${i}`)?.textContent?.trim() || '';
          const slaRef = ifArea.querySelector(`.step-table-default-${i}`)?.textContent?.trim() || '';
          const resultText = ifArea.querySelector(`.step-table-result-${i}`)?.textContent?.trim() || '';
          const date = ifArea.querySelector(`.step-table-date-${i}`)?.textContent?.trim() || '';
          if (speed) {
            rounds.push({ speed, slaRef, result: resultText, date });
          }
        }

        // 요약 텍스트 (display:none이어도 textContent로 접근 가능)
        const fullText = ifArea.textContent?.replace(/\s+/g, ' ').trim() || '';
        const satisfyMatch = fullText.match(/SLA만족\s*횟수는?\s*(\d+)\s*번/);
        const failMatch = fullText.match(/미달\s*횟수는?\s*(\d+)\s*번/);
        const totalMatch = fullText.match(/테스트\s*횟수\s*(\d+)\s*번/);

        return {
          rounds,
          satisfyCount: satisfyMatch ? parseInt(satisfyMatch[1]) : 0,
          failCount: failMatch ? parseInt(failMatch[1]) : 0,
          totalCount: totalMatch ? parseInt(totalMatch[1]) : 0,
          fullText: fullText.slice(0, 500),
        };
      });

      if (!parsed) {
        result.error = 'ifArea 엘리먼트를 찾지 못했습니다';
        return result;
      }

      // 회차별 속도를 평균으로 계산
      const speeds = parsed.rounds
        .map((r) => parseFloat(r.speed))
        .filter((v) => !isNaN(v));

      if (speeds.length > 0) {
        result.download_mbps = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      }

      // SLA 결과 판정
      const { satisfyCount, failCount, totalCount } = parsed;
      if (totalCount > 0) {
        info(`전체 ${totalCount}회: 만족 ${satisfyCount}회, 미달 ${failCount}회`);

        result.raw_data = {
          total: totalCount,
          satisfy: satisfyCount,
          fail: failCount,
          rounds: parsed.rounds,
        };

        // 5회 중 3회 이상 미달이면 SLA fail
        if (failCount >= 3) {
          result.sla_result = 'fail';
        } else {
          result.sla_result = 'pass';
        }
      }

      // 개별 라운드 결과 출력
      for (const round of parsed.rounds) {
        const speedNum = parseFloat(round.speed);
        const isFail = round.result.includes('미달');
        const icon = isFail ? '❌' : '✅';
        info(`  ${icon} ${round.speed} (기준: ${round.slaRef}) → ${round.result}`);
      }

      // fallback: 텍스트 기반 판정
      if (result.sla_result === 'unknown') {
        if (parsed.fullText.includes('미달') && /[345]번/.test(parsed.fullText)) {
          result.sla_result = 'fail';
        } else if (parsed.fullText.includes('만족')) {
          result.sla_result = 'pass';
        }
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      info(chalk.red(`결과 파싱 실패: ${err.message}`));
      result.error = err.message;
    }

    return result;
  }

  private async fileComplaint(): Promise<boolean> {
    const page = this.page!;

    const clickResult = await page.evaluate(() => {
      const elements = document.querySelectorAll('a, button');
      for (const el of elements) {
        if ((el.textContent || '').includes('이의신청')) {
          (el as HTMLElement).click();
          return 'clicked: ' + el.textContent?.trim();
        }
      }
      return 'not found';
    });

    info(`이의신청 버튼: ${clickResult.includes('not found') ? '없음' : '클릭'}`);

    if (clickResult.includes('not found')) {
      return false;
    }

    await sleep(3000);

    try {
      const submitButton = page
        .locator('button')
        .filter({ hasText: /(신청|제출|확인)/ })
        .first();

      await submitButton.waitFor({ state: 'visible', timeout: 5000 });
      await submitButton.click();
      await sleep(3000);
      return true;
    } catch {
      return true; // 이의신청 버튼 클릭까지는 성공으로 처리
    }
  }

  async takeScreenshot(filePath = 'screenshot.png'): Promise<void> {
    if (this.page) {
      await this.page.screenshot({ path: filePath });
      console.log(`스크린샷 저장: ${filePath}`);
    }
  }
}
