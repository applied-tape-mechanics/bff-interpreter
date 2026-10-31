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
export declare const DEFAULT_TAPE_SIZE = 65536;
export declare const DEFAULT_MAX_STEPS: number;
/** Opcodes of the intermediate representation. */
export declare const Op: {
    readonly ADD: 0;
    readonly SUB: 1;
    readonly RIGHT: 2;
    readonly LEFT: 3;
    readonly OUTPUT: 4;
    readonly INPUT: 5;
    readonly JUMP_ZERO: 6;
    readonly JUMP_NONZERO: 7;
    readonly CLEAR: 8;
    readonly SET: 9;
    readonly SCAN_RIGHT: 10;
    readonly SCAN_LEFT: 11;
    readonly MUL_ADD: 12;
};
export type OpCode = (typeof Op)[keyof typeof Op];
export type MulAddTarget = readonly [offset: number, delta: number];
/** A compiled program: parallel arrays of opcode, argument, step cost, and multiply tables. */
export interface Program {
    readonly ops: Uint8Array;
    readonly args: Int32Array;
    readonly costs: Int32Array;
    readonly mulTables?: ReadonlyArray<ReadonlyArray<MulAddTarget>>;
}
export interface VMOptions {
    tapeSize?: number;
    maxSteps?: number;
    jit?: boolean;
}
export interface ExecuteOptions {
    /** Override the VM's step limit for this run. `0` is a valid (immediately failing) limit. */
    maxSteps?: number;
    /** Clear the whole tape and reset the pointer before running. */
    resetTape?: boolean;
    /** Collapse runs, scans, sets, and multiply/clear loops (default `true`). */
    optimize?: boolean;
    /** JIT compile to native JavaScript for maximum throughput (default `true`). */
    jit?: boolean;
}
/** Strips every non-Brainfuck character from the source using native regex. */
export declare function cleanCode(raw: string): string;
/** Compiles source into an IR program with bracket balance verification and loop folding. */
export declare function compile(raw: string, optimize?: boolean): Program;
/**
 * Compiles a Brainfuck program into an ultra-fast native JavaScript execution function.
 */
export declare function compileToJs(program: Program, tapeSize?: number): (tape: Uint8Array, input: string | Uint8Array, startPtr?: number, maxSteps?: number) => {
    output: Uint8Array;
    pointer: number;
    steps: number;
};
export declare class BrainfuckVM {
    readonly tapeSize: number;
    readonly isPowerOfTwo: boolean;
    readonly mask: number;
    maxSteps: number;
    jit: boolean;
    tape: Uint8Array;
    pointer: number;
    constructor(options?: VMOptions);
    /** Clears the tape and resets the pointer. */
    reset(): void;
    /** Moves the data pointer back to cell 0 without clearing the tape. */
    resetPointer(): void;
    /** Reads one cell (returns 0 when out of range). */
    readCell(position: number): number;
    /** Writes one cell; the value wraps modulo 256. Out-of-range writes are ignored. */
    writeCell(position: number, value: number): void;
    /** Returns a copy of `length` cells starting at `start` (clipped to the tape). */
    readTape(start: number, length: number): Uint8Array;
    /** Writes bytes (or a UTF-8 string) starting at `start`; cells outside the tape are skipped. */
    writeTape(start: number, data: string | Uint8Array): void;
    /** Returns tape cells as a plain number array. */
    getTapeSlice(start?: number, length?: number): number[];
    /** Runs a precompiled program (uses native JS JIT by default with transparent bytecode fallback). */
    run(program: Program, input?: string | Uint8Array, maxSteps?: number): Uint8Array;
    /** Runs a precompiled program using the optimized bytecode interpreter. */
    runBytecode(program: Program, input?: string | Uint8Array, maxSteps?: number): Uint8Array;
    /** Runs a precompiled program via JIT compilation to native JavaScript. */
    runJit(program: Program, input?: string | Uint8Array, maxSteps?: number): Uint8Array;
    /** Compiles and runs source, returning the output bytes. */
    execute(code: string, input?: string | Uint8Array, options?: ExecuteOptions): Uint8Array;
    /** Like {@link execute} but decodes the output as UTF-8. */
    executeToString(code: string, input?: string | Uint8Array, options?: ExecuteOptions): string;
}
/** One-shot helper: runs `code` on a fresh VM. */
export declare function execute(code: string, input?: string | Uint8Array, options?: ExecuteOptions & VMOptions): Uint8Array;
