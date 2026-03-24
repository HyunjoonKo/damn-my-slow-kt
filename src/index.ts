#!/usr/bin/env node
/**
 * damn-my-slow-kt - CLI 엔트리포인트
 */

import { buildCli } from './cli';

const program = buildCli();
program.parseAsync(process.argv).catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(error.message);
  process.exit(1);
});
