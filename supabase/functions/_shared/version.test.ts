import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { versionResponse } from './version.ts';

describe('versionResponse', () => {
  it('function name and build version are returned as JSON', async () => {
    const res = versionResponse('validate_student_session', {
      'Access-Control-Allow-Origin': '*',
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get('Content-Type'), 'application/json');
    assertEquals(await res.json(), {
      ok: true,
      function: 'validate_student_session',
      version: 'dev',
    });
  });
});
