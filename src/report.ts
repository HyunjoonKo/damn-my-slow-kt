/**
 * 측정 이력 리포트 생성
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import { SpeedRecord, Stats } from './db';

export function printHistory(records: SpeedRecord[]): void {
  if (records.length === 0) {
    console.log(chalk.yellow('측정 이력이 없습니다.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('일시'),
      chalk.cyan('ISP'),
      chalk.cyan('다운로드'),
      chalk.cyan('업로드'),
      chalk.cyan('Ping'),
      chalk.cyan('SLA'),
      chalk.cyan('이의신청'),
    ],
    colWidths: [20, 6, 14, 14, 10, 10, 10],
    style: { 'padding-left': 1, 'padding-right': 1 },
  });

  for (const r of records) {
    const slaIcon =
      r.sla_result === 'pass' ? chalk.green('✅') : r.sla_result === 'fail' ? chalk.red('❌') : '⚠️';
    const complaintIcon =
      r.complaint_result === 'success'
        ? chalk.green('✅')
        : r.complaint_result === 'failed'
        ? chalk.red('❌')
        : '-';

    table.push([
      r.measured_at.slice(0, 16),
      r.isp.toUpperCase(),
      `${r.download_mbps.toFixed(1)} Mbps`,
      `${r.upload_mbps.toFixed(1)} Mbps`,
      `${r.ping_ms.toFixed(0)} ms`,
      slaIcon,
      complaintIcon,
    ]);
  }

  console.log('\n📊 인터넷 속도 측정 이력');
  console.log(table.toString());
}

export function printStats(stats: Stats): void {
  if (stats.total === 0) {
    console.log(chalk.yellow('측정 데이터가 없습니다.'));
    return;
  }

  console.log('\n' + chalk.bold('📈 요약 리포트'));
  console.log(`  전체 측정: ${stats.total}회`);
  console.log(`  SLA 통과: ${chalk.green(`${stats.sla_pass}회`)}`);
  console.log(`  SLA 미달: ${chalk.red(`${stats.sla_fail}회`)}`);
  console.log(`  이의신청: ${stats.complaints_filed}회`);
  console.log(`  평균 다운로드: ${stats.avg_download_mbps.toFixed(1)} Mbps`);
  console.log(`  평균 업로드: ${stats.avg_upload_mbps.toFixed(1)} Mbps`);

  if (stats.sla_fail > 0) {
    const failRate = ((stats.sla_fail / stats.total) * 100).toFixed(1);
    console.log(`\n  ${chalk.bold.red(`⚠️ SLA 미달률: ${failRate}%`)}`);
  }
}
