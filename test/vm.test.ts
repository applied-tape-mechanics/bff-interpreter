import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BrainfuckVM,
  BrainfuckSyntaxError,
  StepLimitExceededError,
  compile,
  compileToJs,
  execute,
  Op,
} from '../src/index.ts';

const HELLO =
  '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.';

const bytes = (...n: number[]) => Uint8Array.from(n);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('BrainfuckVM', () => {
  for (const optimize of [true, false]) {
    const label = optimize ? 'optimized' : 'raw';

    it(`runs hello world (${label})`, () => {
      assert.equal(text(new BrainfuckVM().execute(HELLO, '', { optimize })), 'Hello World!\n');
    });

    it(`wraps 8-bit cells (${label})`, () => {
      assert.deepEqual(execute('-.>-[+].', '', { optimize }), bytes(255, 0));
    });

    it(`echoes input until EOF (${label})`, () => {
      assert.equal(text(execute(',[.,]', 'BFF Brainfuck Rocks! 123', { optimize })), 'BFF Brainfuck Rocks! 123');
    });

    it(`stores 0 on EOF (${label})`, () => {
      assert.deepEqual(execute('+,.', '', { optimize }), bytes(0));
    });

    it(`wraps the pointer around the tape (${label})`, () => {
      const out = new BrainfuckVM({ tapeSize: 4 }).execute('<+.>>>>.', '', { optimize });
      assert.deepEqual(out, bytes(1, 1));
    });

    it(`counts steps identically (${label})`, () => {
      const code = '+'.repeat(300) + '.';
      assert.throws(() => new BrainfuckVM({ maxSteps: 100 }).execute(code, '', { optimize }), StepLimitExceededError);
    });
  }

  it('multiplication loop', () => {
    assert.equal(text(execute('+++++++[>++++++++<-]>.')), '8');
  });

  it('clear loop', () => {
    assert.equal(text(execute('+'.repeat(42) + '[-]' + '+'.repeat(65) + '.')), 'A');
  });

  it('set constant optimization folds [-]+++ into Op.SET', () => {
    const prog = compile('[-]+++++');
    assert.equal(prog.ops[0], Op.SET);
    assert.equal(prog.args[0], 5);
    assert.deepEqual(execute('+[-]+++++.'), bytes(5));
    assert.deepEqual(execute('+[-]-----.'), bytes(251));
  });

  it('scan loop optimization folds [>] and [<] into Op.SCAN_RIGHT and Op.SCAN_LEFT', () => {
    const progRight = compile('[>]');
    assert.equal(progRight.ops[0], Op.SCAN_RIGHT);

    const progLeft = compile('[<]');
    assert.equal(progLeft.ops[0], Op.SCAN_LEFT);

    // Test scan right and scan left matching raw execution
    const codeLeft = '++++>++++>++++>>++++<[<]>.';
    assert.deepEqual(execute(codeLeft), execute(codeLeft, '', { optimize: false }));
    assert.deepEqual(execute(codeLeft), bytes(4));

    const codeRight = '++++>++++>++++[>]>.';
    assert.deepEqual(execute(codeRight), execute(codeRight, '', { optimize: false }));
    assert.deepEqual(execute(codeRight), bytes(0));
  });

  it('multiply-add loop optimization folds [->++>+++<<] into Op.MUL_ADD', () => {
    const prog = compile('[->++>+++<<]');
    assert.equal(prog.ops[0], Op.MUL_ADD);
    assert.ok(prog.mulTables);
    assert.deepEqual(prog.mulTables[0], [[1, 2], [2, 3]]);

    // Multiply: 4 * 3 = 12 at cell 1, 4 * 5 = 20 at cell 2
    const code = '++++[->+++>+++++<<]>.>.';
    assert.deepEqual(execute(code), bytes(12, 20));
  });

  it('optimized and raw agree', () => {
    const code = '+++>+++++<[->+<]>.';
    assert.deepEqual(execute(code), execute(code, '', { optimize: false }));
    assert.deepEqual(execute(code), bytes(8));
  });

  it('ignores comment characters', () => {
    assert.deepEqual(execute('add +++ then print .'), bytes(3));
  });

  it('accepts Uint8Array and string input', () => {
    assert.deepEqual(execute(',.', bytes(7)), bytes(7));
    assert.deepEqual(execute(',.', 'é'), bytes(0xc3)); // first byte of the UTF-8 encoding
  });

  it('handles output larger than the initial buffer', () => {
    const out = execute('-[.-]');
    assert.equal(out.length, 255);
  });

  describe('JIT compilation (compileToJs)', () => {
    it('executes hello world via JIT', () => {
      const out = execute(HELLO, '', { jit: true });
      assert.equal(text(out), 'Hello World!\n');
    });

    it('handles input and output via JIT', () => {
      const out = execute(',[.,]', 'Brainfuck JIT', { jit: true });
      assert.equal(text(out), 'Brainfuck JIT');
    });

    it('handles multiply-add and scan loops via JIT', () => {
      const code = '++++[->+++>+++++<<]>.>.';
      assert.deepEqual(execute(code, '', { jit: true }), bytes(12, 20));
    });

    it('enforces step limit in JIT mode', () => {
      assert.throws(() => new BrainfuckVM({ maxSteps: 50 }).execute('+[]', '', { jit: true }), StepLimitExceededError);
    });
  });

  describe('errors', () => {
    it('unmatched [', () => {
      assert.throws(() => execute('++[>++'), BrainfuckSyntaxError);
    });

    it('unmatched ]', () => {
      assert.throws(() => execute('++>++]--'), BrainfuckSyntaxError);
    });

    it('syntax and step errors are distinguishable', () => {
      assert.throws(() => new BrainfuckVM({ maxSteps: 500 }).execute('+[]'), StepLimitExceededError);
    });

    it('step limit of exactly N allows N steps', () => {
      assert.deepEqual(new BrainfuckVM({ maxSteps: 1 }).execute('.'), bytes(0));
      assert.throws(() => new BrainfuckVM({ maxSteps: 0 }).execute('.'), StepLimitExceededError);
    });

    it('maxSteps: 0 override is honored', () => {
      assert.throws(() => new BrainfuckVM().execute('.', '', { maxSteps: 0 }), StepLimitExceededError);
    });
  });

  describe('persistent tape', () => {
    it('reads and writes cells and ranges', () => {
      const vm = new BrainfuckVM({ tapeSize: 1000 });
      vm.writeCell(10, 42);
      assert.equal(vm.readCell(10), 42);
      vm.writeCell(11, 300);
      assert.equal(vm.readCell(11), 44);
      vm.writeTape(20, 'BFF-TAPE');
      assert.equal(text(vm.readTape(20, 8)), 'BFF-TAPE');
      assert.deepEqual(vm.getTapeSlice(10, 2), [42, 44]);
    });

    it('keeps state between runs and resets on request', () => {
      const vm = new BrainfuckVM({ tapeSize: 1000 });
      vm.writeCell(10, 42);
      vm.pointer = 10;
      assert.deepEqual(vm.execute('.'), bytes(42));
      vm.resetPointer();
      assert.deepEqual(vm.execute('>>>>>>>>>>.', '', { resetTape: true }), bytes(0));
    });

    it('clips out-of-range access', () => {
      const vm = new BrainfuckVM({ tapeSize: 8 });
      assert.equal(vm.readCell(-1), 0);
      assert.equal(vm.readCell(8), 0);
      assert.equal(vm.readTape(-2, 4).length, 2);
      vm.writeTape(6, bytes(1, 2, 3, 4));
      assert.deepEqual(vm.getTapeSlice(6, 5), [1, 2]);
    });
  });
});
