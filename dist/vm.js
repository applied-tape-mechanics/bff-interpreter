/**
 * Brainfuck virtual machine.
 *
 * Semantics (identical in Node and the browser):
 * - Cells are 8-bit and wrap: `255 + 1 == 0`, `0 - 1 == 255`.
 * - The data pointer wraps around both ends of the tape (it never errors).
 * - `,` stores 0 in the cell once the input is exhausted (EOF = 0).
 * - Any character that is not one of `><+-.,[]` is a comment.
 * - A "step" is one executed source instruction. Collapsed operations (see
 *   `optimize`) count as the number of source instructions they replace, so
 *   `maxSteps` is enforced consistently with and without optimization. A
 *   clear loop (`[-]`) counts as 3 steps regardless of the cell value.
 */
import { BrainfuckSyntaxError, StepLimitExceededError } from "./errors.js";
export const DEFAULT_TAPE_SIZE = 65_536;
export const DEFAULT_MAX_STEPS = typeof process !== 'undefined' && process.env?.BFF_MAX_STEPS
    ? parseInt(process.env.BFF_MAX_STEPS, 10)
    : 1_000_000_000_000;
/** Opcodes of the intermediate representation. */
export const Op = {
    ADD: 0,
    SUB: 1,
    RIGHT: 2,
    LEFT: 3,
    OUTPUT: 4,
    INPUT: 5,
    JUMP_ZERO: 6,
    JUMP_NONZERO: 7,
    CLEAR: 8,
    SET: 9,
    SCAN_RIGHT: 10,
    SCAN_LEFT: 11,
    MUL_ADD: 12,
};
const BF_FILTER_REGEX = /[^><+\-.,[\]]/g;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** Strips every non-Brainfuck character from the source using native regex. */
export function cleanCode(raw) {
    return raw.replace(BF_FILTER_REGEX, '');
}
/** Compiles source into an IR program with bracket balance verification and loop folding. */
export function compile(raw, optimize = true) {
    const code = cleanCode(raw);
    const n = code.length;
    // Bracket matching and syntax verification
    const bracketMap = new Map();
    const bstack = [];
    for (let idx = 0; idx < n; idx++) {
        if (code[idx] === '[') {
            bstack.push(idx);
        }
        else if (code[idx] === ']') {
            const open = bstack.pop();
            if (open === undefined) {
                throw new BrainfuckSyntaxError(`Unmatched ']' at instruction ${idx}`, [idx]);
            }
            bracketMap.set(open, idx);
            bracketMap.set(idx, open);
        }
    }
    if (bstack.length > 0) {
        throw new BrainfuckSyntaxError(`Unmatched '[' at instruction(s): ${bstack.join(', ')}`, bstack);
    }
    const ops = [];
    const args = [];
    const costs = [];
    const mulTables = [];
    const emit = (op, arg, cost) => {
        ops.push(op);
        args.push(arg);
        costs.push(cost);
    };
    let i = 0;
    while (i < n) {
        const ch = code[i];
        if (optimize) {
            // Loop pattern optimizations
            if (ch === '[') {
                const closeIdx = bracketMap.get(i);
                const body = code.slice(i + 1, closeIdx);
                // 1. Clear loop: [-] or [+]
                if (body === '-' || body === '+') {
                    // Check if followed immediately by + or - runs -> SET constant
                    let next = closeIdx + 1;
                    let count = 0;
                    let setChar = '';
                    if (next < n && (code[next] === '+' || code[next] === '-')) {
                        setChar = code[next];
                        while (next < n && code[next] === setChar) {
                            count++;
                            next++;
                        }
                    }
                    if (count > 0) {
                        const val = setChar === '+' ? count & 0xff : (-count) & 0xff;
                        emit(Op.SET, val, 3 + count);
                        i = next;
                        continue;
                    }
                    emit(Op.CLEAR, 0, 3);
                    i = closeIdx + 1;
                    continue;
                }
                // 2. Scan loops: [>] or [<]
                if (body === '>') {
                    emit(Op.SCAN_RIGHT, 0, 3);
                    i = closeIdx + 1;
                    continue;
                }
                if (body === '<') {
                    emit(Op.SCAN_LEFT, 0, 3);
                    i = closeIdx + 1;
                    continue;
                }
                // 3. Multiply and Move loops: e.g. [->+<], [->++>+++<<], [<+>-]
                // Must contain only pointer moves and deltas, with no nested loops or I/O
                if (!body.includes('[') && !body.includes(']') && !body.includes('.') && !body.includes(',')) {
                    let offset = 0;
                    const deltas = new Map();
                    let valid = true;
                    for (let k = 0; k < body.length; k++) {
                        const bc = body[k];
                        if (bc === '>')
                            offset++;
                        else if (bc === '<')
                            offset--;
                        else if (bc === '+')
                            deltas.set(offset, (deltas.get(offset) || 0) + 1);
                        else if (bc === '-')
                            deltas.set(offset, (deltas.get(offset) || 0) - 1);
                        else {
                            valid = false;
                            break;
                        }
                    }
                    // Net pointer movement must return to starting cell, and starting cell must decrement by 1
                    if (valid && offset === 0 && deltas.get(0) === -1 && deltas.size > 1) {
                        const targets = [];
                        for (const [off, delta] of deltas.entries()) {
                            if (off !== 0) {
                                targets.push([off, delta]);
                            }
                        }
                        const tableIdx = mulTables.length;
                        mulTables.push(targets);
                        // cost is body length + 2 (for bracket checks)
                        emit(Op.MUL_ADD, tableIdx, body.length + 2);
                        i = closeIdx + 1;
                        continue;
                    }
                }
            }
            // Run-length encoding of arithmetic and pointer shifts
            if (ch === '+' || ch === '-' || ch === '>' || ch === '<') {
                let count = 0;
                while (i < n && code[i] === ch) {
                    count++;
                    i++;
                }
                if (ch === '+')
                    emit(Op.ADD, count & 0xff, count);
                else if (ch === '-')
                    emit(Op.SUB, count & 0xff, count);
                else if (ch === '>')
                    emit(Op.RIGHT, count, count);
                else
                    emit(Op.LEFT, count, count);
                continue;
            }
        }
        switch (ch) {
            case '+':
                emit(Op.ADD, 1, 1);
                break;
            case '-':
                emit(Op.SUB, 1, 1);
                break;
            case '>':
                emit(Op.RIGHT, 1, 1);
                break;
            case '<':
                emit(Op.LEFT, 1, 1);
                break;
            case '.':
                emit(Op.OUTPUT, 0, 1);
                break;
            case ',':
                emit(Op.INPUT, 0, 1);
                break;
            case '[':
                emit(Op.JUMP_ZERO, 0, 1);
                break;
            case ']':
                emit(Op.JUMP_NONZERO, 0, 1);
                break;
        }
        i++;
    }
    // Match remaining non-collapsed jump brackets
    const jumpStack = [];
    for (let idx = 0; idx < ops.length; idx++) {
        if (ops[idx] === Op.JUMP_ZERO) {
            jumpStack.push(idx);
        }
        else if (ops[idx] === Op.JUMP_NONZERO) {
            const start = jumpStack.pop();
            args[start] = idx;
            args[idx] = start;
        }
    }
    return {
        ops: Uint8Array.from(ops),
        args: Int32Array.from(args),
        costs: Int32Array.from(costs),
        mulTables: mulTables.length > 0 ? mulTables : undefined,
    };
}
function toBytes(input) {
    return typeof input === 'string' ? encoder.encode(input) : input;
}
/**
 * Compiles a Brainfuck program into an ultra-fast native JavaScript execution function.
 */
export function compileToJs(program, tapeSize = DEFAULT_TAPE_SIZE) {
    const { ops, args, costs, mulTables } = program;
    const isPow2 = (tapeSize & (tapeSize - 1)) === 0 && tapeSize > 0;
    const mask = isPow2 ? tapeSize - 1 : null;
    const size = tapeSize;
    const lines = [];
    lines.push('"use strict";');
    lines.push('let ptr = startPtr || 0;');
    lines.push('let inPtr = 0;');
    lines.push('let out = new Uint8Array(256);');
    lines.push('let outLen = 0;');
    lines.push('let steps = 0;');
    lines.push(`const limit = maxSteps ?? ${DEFAULT_MAX_STEPS};`);
    lines.push('const inputBytes = typeof input === "string" ? new TextEncoder().encode(input) : input;');
    lines.push('const inputLen = inputBytes.length;');
    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const arg = args[i];
        const cost = costs[i];
        switch (op) {
            case Op.ADD:
                lines.push(`tape[ptr] = (tape[ptr] + ${arg}) & 0xff; steps += ${cost};`);
                break;
            case Op.SUB:
                lines.push(`tape[ptr] = (tape[ptr] - ${arg}) & 0xff; steps += ${cost};`);
                break;
            case Op.RIGHT:
                lines.push(mask !== null ? `ptr = (ptr + ${arg}) & ${mask}; steps += ${cost};` : `ptr = (ptr + ${arg}) % ${size}; steps += ${cost};`);
                break;
            case Op.LEFT:
                lines.push(mask !== null ? `ptr = (ptr - ${arg}) & ${mask}; steps += ${cost};` : `ptr = (((ptr - ${arg}) % ${size}) + ${size}) % ${size}; steps += ${cost};`);
                break;
            case Op.CLEAR:
                lines.push(`tape[ptr] = 0; steps += ${cost};`);
                break;
            case Op.SET:
                lines.push(`tape[ptr] = ${arg}; steps += ${cost};`);
                break;
            case Op.SCAN_RIGHT:
                lines.push(mask !== null
                    ? `while (tape[ptr] !== 0) { ptr = (ptr + 1) & ${mask}; steps += 2; } steps += 1;`
                    : `while (tape[ptr] !== 0) { ptr = (ptr + 1) % ${size}; steps += 2; } steps += 1;`);
                break;
            case Op.SCAN_LEFT:
                lines.push(mask !== null
                    ? `while (tape[ptr] !== 0) { ptr = (ptr - 1) & ${mask}; steps += 2; } steps += 1;`
                    : `while (tape[ptr] !== 0) { ptr = (((ptr - 1) % ${size}) + ${size}) % ${size}; steps += 2; } steps += 1;`);
                break;
            case Op.MUL_ADD: {
                const table = mulTables[arg];
                lines.push(`if (tape[ptr] !== 0) {`);
                lines.push(`  const mult = tape[ptr];`);
                lines.push(`  tape[ptr] = 0;`);
                for (const [off, delta] of table) {
                    const target = mask !== null
                        ? `(ptr + (${off})) & ${mask}`
                        : `(((ptr + (${off})) % ${size}) + ${size}) % ${size}`;
                    lines.push(`  tape[${target}] = (tape[${target}] + mult * (${delta})) & 0xff;`);
                }
                lines.push(`  steps += mult * ${cost} + 1;`);
                lines.push(`} else { steps += 1; }`);
                break;
            }
            case Op.OUTPUT:
                lines.push(`if (outLen === out.length) { const g = new Uint8Array(out.length * 2); g.set(out); out = g; }`);
                lines.push(`out[outLen++] = tape[ptr]; steps += 1;`);
                break;
            case Op.INPUT:
                lines.push(`tape[ptr] = inPtr < inputLen ? inputBytes[inPtr++] : 0; steps += 1;`);
                break;
            case Op.JUMP_ZERO:
                lines.push(`while (tape[ptr] !== 0) {`);
                lines.push(`  if (steps > limit) throw new StepLimitExceededError(limit);`);
                break;
            case Op.JUMP_NONZERO:
                lines.push(`  steps += 1;`);
                lines.push(`}`);
                lines.push(`steps += 1;`);
                break;
        }
    }
    lines.push('if (steps > limit) throw new StepLimitExceededError(limit);');
    lines.push('return { output: out.slice(0, outLen), pointer: ptr, steps };');
    const code = lines.join('\n');
    return new Function('StepLimitExceededError', `return function(tape, input, startPtr, maxSteps) {\n${code}\n};`)(StepLimitExceededError);
}
export class BrainfuckVM {
    tapeSize;
    isPowerOfTwo;
    mask;
    maxSteps;
    jit;
    tape;
    pointer = 0;
    constructor(options = {}) {
        this.tapeSize = options.tapeSize ?? DEFAULT_TAPE_SIZE;
        this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
        this.jit = options.jit ?? true;
        this.tape = new Uint8Array(this.tapeSize);
        this.isPowerOfTwo = (this.tapeSize & (this.tapeSize - 1)) === 0 && this.tapeSize > 0;
        this.mask = this.tapeSize - 1;
    }
    /** Clears the tape and resets the pointer. */
    reset() {
        this.tape.fill(0);
        this.pointer = 0;
    }
    /** Moves the data pointer back to cell 0 without clearing the tape. */
    resetPointer() {
        this.pointer = 0;
    }
    /** Reads one cell (returns 0 when out of range). */
    readCell(position) {
        return position >= 0 && position < this.tapeSize ? this.tape[position] : 0;
    }
    /** Writes one cell; the value wraps modulo 256. Out-of-range writes are ignored. */
    writeCell(position, value) {
        if (position >= 0 && position < this.tapeSize)
            this.tape[position] = value & 0xff;
    }
    /** Returns a copy of `length` cells starting at `start` (clipped to the tape). */
    readTape(start, length) {
        const from = Math.max(0, start);
        const to = Math.min(start + length, this.tapeSize);
        return this.tape.slice(from, Math.max(from, to));
    }
    /** Writes bytes (or a UTF-8 string) starting at `start`; cells outside the tape are skipped. */
    writeTape(start, data) {
        const bytes = toBytes(data);
        for (let i = 0; i < bytes.length; i++) {
            const pos = start + i;
            if (pos >= 0 && pos < this.tapeSize)
                this.tape[pos] = bytes[i];
        }
    }
    /** Returns tape cells as a plain number array. */
    getTapeSlice(start = 0, length = 16) {
        return Array.from(this.readTape(start, length));
    }
    /** Runs a precompiled program (uses native JS JIT by default with transparent bytecode fallback). */
    run(program, input = '', maxSteps) {
        if (this.jit) {
            return this.runJit(program, input, maxSteps);
        }
        return this.runBytecode(program, input, maxSteps);
    }
    /** Runs a precompiled program using the optimized bytecode interpreter. */
    runBytecode(program, input = '', maxSteps) {
        const { ops, args, costs, mulTables } = program;
        const limit = maxSteps ?? this.maxSteps;
        const inputBytes = toBytes(input);
        const inputLen = inputBytes.length;
        const opCount = ops.length;
        const tape = this.tape;
        const size = this.tapeSize;
        const isPow2 = this.isPowerOfTwo;
        const mask = this.mask;
        let out = new Uint8Array(256);
        let outLen = 0;
        let inPtr = 0;
        let ptr = this.pointer;
        let steps = 0;
        let ip = 0;
        while (ip < opCount) {
            const op = ops[ip];
            if (op !== Op.MUL_ADD) {
                steps += costs[ip];
                if (steps > limit) {
                    this.pointer = ptr;
                    throw new StepLimitExceededError(limit);
                }
            }
            switch (ops[ip]) {
                case Op.ADD:
                    tape[ptr] += args[ip];
                    break;
                case Op.SUB:
                    tape[ptr] -= args[ip];
                    break;
                case Op.RIGHT:
                    ptr = isPow2 ? (ptr + args[ip]) & mask : (ptr + args[ip]) % size;
                    break;
                case Op.LEFT:
                    ptr = isPow2 ? (ptr - args[ip]) & mask : (((ptr - args[ip]) % size) + size) % size;
                    break;
                case Op.CLEAR:
                    tape[ptr] = 0;
                    break;
                case Op.SET:
                    tape[ptr] = args[ip];
                    break;
                case Op.SCAN_RIGHT:
                    while (tape[ptr] !== 0) {
                        ptr = isPow2 ? (ptr + 1) & mask : (ptr + 1) % size;
                        steps += 2;
                    }
                    break;
                case Op.SCAN_LEFT:
                    while (tape[ptr] !== 0) {
                        ptr = isPow2 ? (ptr - 1) & mask : (((ptr - 1) % size) + size) % size;
                        steps += 2;
                    }
                    break;
                case Op.MUL_ADD: {
                    const mult = tape[ptr];
                    if (mult !== 0) {
                        tape[ptr] = 0;
                        const table = mulTables[args[ip]];
                        const loopLen = costs[ip];
                        for (let t = 0; t < table.length; t++) {
                            const off = table[t][0];
                            const delta = table[t][1];
                            const target = isPow2 ? (ptr + off) & mask : (((ptr + off) % size) + size) % size;
                            tape[target] += mult * delta;
                        }
                        steps += mult * loopLen + 1;
                    }
                    else {
                        steps += 1;
                    }
                    if (steps > limit) {
                        this.pointer = ptr;
                        throw new StepLimitExceededError(limit);
                    }
                    break;
                }
                case Op.OUTPUT:
                    if (outLen === out.length) {
                        const grown = new Uint8Array(out.length * 2);
                        grown.set(out);
                        out = grown;
                    }
                    out[outLen++] = tape[ptr];
                    break;
                case Op.INPUT:
                    tape[ptr] = inPtr < inputLen ? inputBytes[inPtr++] : 0;
                    break;
                case Op.JUMP_ZERO:
                    if (tape[ptr] === 0)
                        ip = args[ip];
                    break;
                case Op.JUMP_NONZERO:
                    if (tape[ptr] !== 0)
                        ip = args[ip];
                    break;
            }
            ip++;
        }
        this.pointer = ptr;
        return out.slice(0, outLen);
    }
    /** Runs a precompiled program via JIT compilation to native JavaScript. */
    runJit(program, input = '', maxSteps) {
        try {
            const fn = compileToJs(program, this.tapeSize);
            const res = fn(this.tape, input, this.pointer, maxSteps ?? this.maxSteps);
            this.pointer = res.pointer;
            return res.output;
        }
        catch (err) {
            if (err instanceof StepLimitExceededError)
                throw err;
            // Transparent fallback to bytecode interpreter if environment restricts eval/new Function
            return this.runBytecode(program, input, maxSteps);
        }
    }
    /** Compiles and runs source, returning the output bytes. */
    execute(code, input = '', options = {}) {
        const program = compile(code, options.optimize ?? true);
        if (options.resetTape)
            this.reset();
        const useJit = options.jit ?? this.jit;
        if (useJit) {
            return this.runJit(program, input, options.maxSteps);
        }
        return this.runBytecode(program, input, options.maxSteps);
    }
    /** Like {@link execute} but decodes the output as UTF-8. */
    executeToString(code, input = '', options = {}) {
        return decoder.decode(this.execute(code, input, options));
    }
}
/** One-shot helper: runs `code` on a fresh VM. */
export function execute(code, input = '', options = {}) {
    const vm = new BrainfuckVM({ tapeSize: options.tapeSize, maxSteps: options.maxSteps, jit: options.jit });
    return vm.execute(code, input, { optimize: options.optimize, jit: options.jit });
}
