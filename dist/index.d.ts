export { BrainfuckVM, DEFAULT_MAX_STEPS, DEFAULT_TAPE_SIZE, Op, cleanCode, compile, compileToJs, execute, } from './vm.ts';
export type { ExecuteOptions, MulAddTarget, OpCode, Program, VMOptions } from './vm.ts';
export { BrainfuckError, BrainfuckSyntaxError, StepLimitExceededError } from './errors.ts';
