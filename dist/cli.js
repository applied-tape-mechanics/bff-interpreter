#!/usr/bin/env node
/** Command-line interface for the BFF Brainfuck interpreter. */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BrainfuckVM, DEFAULT_MAX_STEPS, DEFAULT_TAPE_SIZE } from "./index.js";
const USAGE = `Usage: bff-interpreter [file.bf] [options]

  -c, --code <src>       Inline Brainfuck code (instead of a file)
  -i, --input <text>     Program input; use "-" to read it from stdin
      --tape-size <n>    Tape size in cells (default ${DEFAULT_TAPE_SIZE})
      --max-steps <n>    Step limit (default ${DEFAULT_MAX_STEPS})
      --no-optimize      Disable run-length / clear-loop collapsing
  -h, --help             Show this help
`;
function positiveInt(name, value, fallback) {
    if (value === undefined)
        return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
        throw new Error(`${name} must be a non-negative integer, got "${value}"`);
    }
    return n;
}
function main(argv = process.argv.slice(2)) {
    try {
        const { values, positionals } = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                code: { type: 'string', short: 'c' },
                input: { type: 'string', short: 'i' },
                'tape-size': { type: 'string' },
                'max-steps': { type: 'string' },
                'no-optimize': { type: 'boolean' },
                help: { type: 'boolean', short: 'h' },
            },
        });
        if (values.help) {
            process.stdout.write(USAGE);
            return 0;
        }
        if ((values.code === undefined) === (positionals.length === 0)) {
            process.stderr.write(`Error: provide either a file or -c <code>\n\n${USAGE}`);
            return 2;
        }
        const source = values.code ?? readFileSync(positionals[0], 'utf-8');
        const input = values.input === '-' ? readFileSync(0) : (values.input ?? '');
        const vm = new BrainfuckVM({
            tapeSize: positiveInt('--tape-size', values['tape-size'], DEFAULT_TAPE_SIZE),
            maxSteps: positiveInt('--max-steps', values['max-steps'], DEFAULT_MAX_STEPS),
        });
        const output = vm.execute(source, input, { optimize: !values['no-optimize'] });
        process.stdout.write(output);
        return 0;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        return 1;
    }
}
process.exitCode = main();
