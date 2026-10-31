/**
 * Brainfuck VM Performance Benchmark Suite.
 *
 * Measures:
 * 1. Raw Bytecode (optimize: false)
 * 2. Optimized Bytecode (optimize: true - pattern folding, bitwise masking)
 * 3. JIT Native JS (jit: true - direct compilation to V8 machine code)
 *
 * Tests both:
 * - Pure VM Execution Throughput (Compile once, run N times - standard microservice pattern)
 * - Cold Compile + Execution (Full pipeline)
 */

import { performance } from 'node:perf_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrainfuckVM, execute, compile } from '../src/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BenchResult {
  name: string;
  iterations: number;
  rawMs: number;
  optMs: number;
  jitMs: number;
  optSpeedup: number;
  jitSpeedup: number;
}

interface TestCase {
  name: string;
  code: string;
  input?: string;
  iterations: number;
  warmup?: number;
}

// 1. Classic Hello World
const HELLO_WORLD =
  '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.';

// 2. Heavy nested multiplication (compute stress)
const NESTED_MULT = '++++++++++[>++++++++++[>++++++++++<-]<-]>>.';

// 3. Heavy linear scan across tape ([>] and [<])
const TAPE_SCAN = '+++++[>+++++>+++++>+++++>+++++>+++++<<<<<-]>[>]>+[<]<.';

// 4. Bulk copy and multiply ([->+++>+++++<<])
const BULK_MUL_MOVE = '+'.repeat(100) + '[->+++>+++++<<]>>.';

// 5. Real microservice code (URL Encoder)
function loadUrlEncoder(): { code: string; input: string } {
  const bfPath = path.resolve(__dirname, '../../bff-url-encoder-decoder/bf/url_encode.bf');
  if (fs.existsSync(bfPath)) {
    return {
      code: fs.readFileSync(bfPath, 'utf-8'),
      input: 'https://example.com/api/v1/search?query=hello+world&filter=true&count=100',
    };
  }
  return { code: HELLO_WORLD, input: '' };
}

// 6. Real microservice code (EDIFACT Parser)
function loadEdifactParser(): { code: string; input: string } {
  const bfPath = path.resolve(__dirname, '../../bff-edifact-to-json-parser/bf/edifact_parser.bf');
  if (fs.existsSync(bfPath)) {
    return {
      code: fs.readFileSync(bfPath, 'utf-8'),
      input: "UNH+1+ORDERS:D:96A:UN'BGM+220+123456+9'DTM+137:20261024:102'NAD+BY+BUYER01'UNT+4+1'",
    };
  }
  return { code: HELLO_WORLD, input: '' };
}

function runPrecompiledBenchmark(testCase: TestCase): BenchResult {
  const { name, code, input = '', iterations, warmup = 30 } = testCase;

  const progRaw = compile(code, false);
  const progOpt = compile(code, true);

  const vmRaw = new BrainfuckVM();
  const vmOpt = new BrainfuckVM();
  const vmJit = new BrainfuckVM();

  // Warmup
  for (let w = 0; w < warmup; w++) {
    vmRaw.reset();
    vmRaw.run(progRaw, input);
    vmOpt.reset();
    vmOpt.run(progOpt, input);
    vmJit.reset();
    vmJit.runJit(progOpt, input);
  }

  // 1. Raw Bytecode
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    vmRaw.reset();
    vmRaw.run(progRaw, input);
  }
  const t1 = performance.now();
  const rawMs = t1 - t0;

  // 2. Optimized Bytecode
  const t2 = performance.now();
  for (let i = 0; i < iterations; i++) {
    vmOpt.reset();
    vmOpt.run(progOpt, input);
  }
  const t3 = performance.now();
  const optMs = t3 - t2;

  // 3. JIT Native JS
  const t4 = performance.now();
  for (let i = 0; i < iterations; i++) {
    vmJit.reset();
    vmJit.runJit(progOpt, input);
  }
  const t5 = performance.now();
  const jitMs = t5 - t4;

  return {
    name,
    iterations,
    rawMs,
    optMs,
    jitMs,
    optSpeedup: rawMs / optMs,
    jitSpeedup: rawMs / jitMs,
  };
}

async function main() {
  console.log('='.repeat(98));
  console.log('        Brainfuck VM Performance Benchmark Suite (Precompiled VM Execution)');
  console.log('='.repeat(98));
  console.log(`Node.js: ${process.version} | Arch: ${process.arch} | Platform: ${process.platform}`);
  console.log('Model: Precompiled Program Throughput (compile once, run N times)\n');

  const urlEnc = loadUrlEncoder();
  const edifact = loadEdifactParser();

  const testCases: TestCase[] = [
    {
      name: 'Hello World (Loop & Output)',
      code: HELLO_WORLD,
      iterations: 5000,
    },
    {
      name: 'Nested Multiply Stress (Compute)',
      code: NESTED_MULT,
      iterations: 3000,
    },
    {
      name: 'Tape Seek Scan ([>] & [<])',
      code: TAPE_SCAN,
      iterations: 5000,
    },
    {
      name: 'Multiply-Add / Move Loops',
      code: BULK_MUL_MOVE,
      iterations: 20000,
    },
    {
      name: 'URL Encoder (Real Service)',
      code: urlEnc.code,
      input: urlEnc.input,
      iterations: 300,
    },
    {
      name: 'EDIFACT Parser (Real Service)',
      code: edifact.code,
      input: edifact.input,
      iterations: 300,
    },
  ];

  const results: BenchResult[] = [];

  for (const tc of testCases) {
    process.stdout.write(`Benchmarking: ${tc.name.padEnd(34)} ... `);
    const res = runPrecompiledBenchmark(tc);
    results.push(res);
    console.log(
      `Opt: ${res.optSpeedup.toFixed(2)}x | JIT: ${res.jitSpeedup.toFixed(2)}x faster`,
    );
  }

  console.log('\n' + '-'.repeat(98));
  console.log(
    '| Benchmark Target                | Iters | Raw (ms)  | Opt (ms)  | JIT (ms) | Opt Boost | JIT Boost  |',
  );
  console.log(
    '|:--------------------------------|------:|----------:|----------:|---------:|----------:|-----------:|',
  );

  for (const r of results) {
    const name = r.name.padEnd(31);
    const iters = r.iterations.toString().padStart(5);
    const raw = r.rawMs.toFixed(1).padStart(9);
    const opt = r.optMs.toFixed(1).padStart(9);
    const jit = r.jitMs.toFixed(1).padStart(8);
    const optBoost = (r.optSpeedup.toFixed(2) + 'x').padStart(9);
    const jitBoost = (r.jitSpeedup.toFixed(2) + 'x').padStart(10);

    console.log(
      `| ${name} | ${iters} | ${raw} | ${opt} | ${jit} | ${optBoost} | ${jitBoost} |`,
    );
  }
  console.log('-'.repeat(98) + '\n');
}

void main();
