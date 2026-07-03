import { EDGE_BUILD_VERSION } from './build_version.ts'

export function versionResponse(functionName: string, corsHeaders: HeadersInit): Response {
  return new Response(JSON.stringify({
    ok: true,
    function: functionName,
    version: EDGE_BUILD_VERSION,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
