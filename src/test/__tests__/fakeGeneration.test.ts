import { describe, expect, it } from 'vitest';
import {
  fakeGenerationStream,
  fakeGenerationText,
} from '../fakeGeneration';

/**
 * The wizard's `runGeneration` parses these frames; we mirror the
 * same `\n\n` split + `event: …` + `data: …` contract here so the
 * helper itself is verified before any wizard test relies on it.
 */
function parseWire(text: string): Array<{ event: string; data: unknown }> {
  const frames: Array<{ event: string; data: unknown }> = [];
  for (const raw of text.split('\n\n')) {
    if (!raw.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    try {
      frames.push({ event, data: JSON.parse(dataLines.join('\n')) });
    } catch {
      frames.push({ event, data: dataLines.join('\n') });
    }
  }
  return frames;
}

describe('fakeGenerationText', () => {
  it('emits start → slot* → done with the framing runGeneration expects', () => {
    const text = fakeGenerationText([
      {
        promptId: 'p-1',
        campaignModelId: 'cm-1',
        modelDisplayName: 'GPT-5',
        status: 'ok',
        costUsd: 0.5,
        output: 'hello',
      },
    ]);
    const frames = parseWire(text);
    expect(frames.map((f) => f.event)).toEqual(['start', 'slot', 'done']);
    expect((frames[0].data as { total: number }).total).toBe(1);
    expect((frames[1].data as { status: string }).status).toBe('ok');
    expect((frames[2].data as { succeeded: number; spentUsd: number }))
      .toMatchObject({ succeeded: 1, spentUsd: 0.5 });
  });

  it('handles all three slot statuses and tallies the done summary', () => {
    const text = fakeGenerationText([
      {
        promptId: 'p',
        campaignModelId: 'a',
        modelDisplayName: 'A',
        status: 'ok',
        costUsd: 0.1,
      },
      {
        promptId: 'p',
        campaignModelId: 'b',
        modelDisplayName: 'B',
        status: 'error',
      },
      {
        promptId: 'p',
        campaignModelId: 'c',
        modelDisplayName: 'C',
        status: 'skipped_budget',
      },
    ]);
    const frames = parseWire(text);
    const slots = frames.filter((f) => f.event === 'slot');
    expect(slots.map((s) => (s.data as { status: string }).status)).toEqual([
      'ok',
      'error',
      'skipped_budget',
    ]);
    const done = frames.find((f) => f.event === 'done')!.data as {
      succeeded: number;
      failed: number;
      skippedForBudget: number;
    };
    expect(done).toMatchObject({
      succeeded: 1,
      failed: 1,
      skippedForBudget: 1,
    });
  });

  it('emits a budget_exceeded frame when configured', () => {
    const text = fakeGenerationText(
      [
        {
          promptId: 'p',
          campaignModelId: 'a',
          modelDisplayName: 'A',
          status: 'ok',
          costUsd: 0.49,
        },
      ],
      {
        budgetExceeded: {
          reason: 'cap',
          estimatedUsd: 0.05,
          spentUsd: 0.49,
          capUsd: 0.5,
        },
      },
    );
    const frames = parseWire(text);
    const events = frames.map((f) => f.event);
    expect(events).toContain('budget_exceeded');
    // Ordering: start → slot → budget_exceeded → done
    expect(events).toEqual(['start', 'slot', 'budget_exceeded', 'done']);
    const be = frames.find((f) => f.event === 'budget_exceeded')!.data as {
      capUsd: number;
    };
    expect(be.capUsd).toBe(0.5);
  });

  it('respects `total` override on the start frame', () => {
    const text = fakeGenerationText([], { total: 6 });
    const start = parseWire(text)[0];
    expect((start.data as { total: number }).total).toBe(6);
  });
});

describe('fakeGenerationStream', () => {
  it('wraps the wire text in a ReadableStream<Uint8Array>', async () => {
    const stream = fakeGenerationStream([
      {
        promptId: 'p',
        campaignModelId: 'a',
        modelDisplayName: 'A',
        status: 'ok',
      },
    ]);
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let body = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    const frames = parseWire(body);
    expect(frames.map((f) => f.event)).toEqual(['start', 'slot', 'done']);
  });
});
