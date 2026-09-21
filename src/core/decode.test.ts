import { describe, expect, it, vi } from 'vitest';
import { DecoderPipeline } from './decode';
describe('decoder fallback pipeline', () => {
  const blob = new Blob(['fixture']);
  it('falls through unsupported engines and exceptions', async () => {
    const last = vi.fn(async () => 'weixin://payload');
    const pipeline = new DecoderPipeline([
      { id: 'unavailable', decode: async () => null },
      {
        id: 'broken',
        decode: async () => {
          throw new Error('unsupported');
        },
      },
      { id: 'working', decode: last },
    ]);
    expect(await pipeline.decode(blob)).toBe('weixin://payload');
    expect(last).toHaveBeenCalledWith(blob);
  });
  it('stops at first successful result', async () => {
    const later = vi.fn();
    const pipeline = new DecoderPipeline([
      { id: 'first', decode: async () => 'value' },
      { id: 'later', decode: later },
    ]);
    expect(await pipeline.decode(blob)).toBe('value');
    expect(later).not.toHaveBeenCalled();
  });
  it('returns null for an undecodable image and supports registered engines', async () => {
    const pipeline = new DecoderPipeline();
    expect(await pipeline.decode(blob)).toBeNull();
    pipeline.register({ id: 'custom', decode: async () => 'custom format' });
    expect(await pipeline.decode(blob)).toBe('custom format');
  });
});
