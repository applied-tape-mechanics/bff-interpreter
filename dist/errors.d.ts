/** Base class for all errors raised by the Brainfuck VM. */
export declare class BrainfuckError extends Error {
    constructor(message: string);
}
/** Raised when the source has unbalanced brackets. Services should map this to HTTP 400. */
export declare class BrainfuckSyntaxError extends BrainfuckError {
    /** Offsets (within the cleaned, comment-free source) of the offending bracket(s). */
    readonly positions: number[];
    constructor(message: string, positions: number[]);
}
/** Raised when a program executes more instructions than the configured limit. */
export declare class StepLimitExceededError extends BrainfuckError {
    readonly limit: number;
    constructor(limit: number);
}
