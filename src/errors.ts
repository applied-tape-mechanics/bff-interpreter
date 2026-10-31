/** Base class for all errors raised by the Brainfuck VM. */
export class BrainfuckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Raised when the source has unbalanced brackets. Services should map this to HTTP 400. */
export class BrainfuckSyntaxError extends BrainfuckError {
  /** Offsets (within the cleaned, comment-free source) of the offending bracket(s). */
  readonly positions: number[];

  constructor(message: string, positions: number[]) {
    super(message);
    this.positions = positions;
  }
}

/** Raised when a program executes more instructions than the configured limit. */
export class StepLimitExceededError extends BrainfuckError {
  readonly limit: number;

  constructor(limit: number) {
    super(`Exceeded maximum execution step limit (${limit.toLocaleString()})`);
    this.limit = limit;
  }
}
