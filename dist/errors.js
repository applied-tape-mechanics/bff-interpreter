/** Base class for all errors raised by the Brainfuck VM. */
export class BrainfuckError extends Error {
    constructor(message) {
        super(message);
        this.name = new.target.name;
    }
}
/** Raised when the source has unbalanced brackets. Services should map this to HTTP 400. */
export class BrainfuckSyntaxError extends BrainfuckError {
    /** Offsets (within the cleaned, comment-free source) of the offending bracket(s). */
    positions;
    constructor(message, positions) {
        super(message);
        this.positions = positions;
    }
}
/** Raised when a program executes more instructions than the configured limit. */
export class StepLimitExceededError extends BrainfuckError {
    limit;
    constructor(limit) {
        super(`Exceeded maximum execution step limit (${limit.toLocaleString()})`);
        this.limit = limit;
    }
}
