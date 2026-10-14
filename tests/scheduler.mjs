import assert from 'node:assert/strict';
import { triggerRefresh } from '../cloudflare/worker.mjs';

const calls = [];
const env = { GITHUB_TOKEN: 'test-token' };
const result = await triggerRefresh(env, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? Response.json({ workflow_runs: [{ status: 'completed' }] }) : new Response(null, { status: 204 });
});
assert.equal(result, 'Forecast refresh requested');
assert.equal(calls.length, 2);
assert.equal(calls[1].options.method, 'POST');
assert.deepEqual(JSON.parse(calls[1].options.body), { ref: 'main' });
assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token');

for (const status of ['queued', 'in_progress', 'waiting']) {
    let requests = 0;
    const result = await triggerRefresh(env, async () => {
        requests++;
        return Response.json({ workflow_runs: [{ status }] });
    });
    assert.equal(result, 'Refresh already queued or running');
    assert.equal(requests, 1);
}
await assert.rejects(triggerRefresh({}), /secret is missing/);
await assert.rejects(triggerRefresh(env, async () => new Response(null, { status: 401 })), /GitHub HTTP 401/);
await assert.rejects(triggerRefresh(env, async () => Response.json({})), /Invalid GitHub workflow response/);
let count = 0;
await assert.rejects(triggerRefresh(env, async () => ++count === 1 ? Response.json({ workflow_runs: [] }) : new Response(null, { status: 503 })), /GitHub HTTP 503/);
console.log('Cloudflare scheduler checks passed: dispatch, duplicate prevention and error handling.');
