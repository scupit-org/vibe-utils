type ErrorConstructor = new (message: string) => Error;

export class AssertionError extends Error {}
export class NotImplementedError extends EvalError {}

// Node has its own assertions module, but React Native doesn't run on node.
//
// Okay, `asserts` is amazing.
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
// https://stackoverflow.com/questions/71624824/what-does-the-typescript-asserts-operator-do
// https://github.com/microsoft/TypeScript/pull/32695
// https://stackoverflow.com/questions/49362725/typescript-assert-like-type-guard
export function assertThat<T extends boolean>(
  message: string,
  condition: T,
  ErrorType: ErrorConstructor = AssertionError
): asserts condition {
  // TODO: Maybe add a condition so this only runs in dev mode.
  // Running asserts in production could be valuable too though.
  if (!condition) {
    throw new ErrorType(`Assertion failed: ${message}`);
  }
}

export function assertUnreachable(message?: string): never {
  let fullMessage: string =
    '"Unreachable" assertion failed - code marked unreachable was reached.';

  if (message) {
    fullMessage += ` Message: ${message}`;
  }

  throw new AssertionError(fullMessage);
}

export function notImplemented(message?: string): never {
  let fullMessage: string =
    "Tried to use code which hasn't been implemented yet.";

  if (message) {
    fullMessage += ` Message: ${message}`;
  }

  throw new NotImplementedError(fullMessage);
}
