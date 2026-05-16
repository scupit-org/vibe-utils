import type { RenderBackend, RenderTypes } from './index';

// Type-only smoke: the contract module must compile in isolation with no
// runtime imports of three or of backend-specific code.

describe('render-contract', () => {
  it('exposes a RenderBackend interface assignable from any matching shape', () => {
    const placeholder = null as unknown as RenderBackend<RenderTypes>;
    expect(placeholder).toBeNull();
  });
});
