const WORKFLOW = 'https://api.github.com/repos/ErikWahlstrom/dmi-vind-waves/actions/workflows/runinfo.yml';

export async function triggerRefresh(env, request = fetch) {
    if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is missing');
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dmi-forecast-scheduler'
    };
    const runs = await request(`${WORKFLOW}/runs?branch=main&per_page=5`, { headers });
    if (!runs.ok) throw new Error(`Cannot check forecast workflow: GitHub HTTP ${runs.status}`);
    const data = await runs.json();
    if (!Array.isArray(data.workflow_runs)) throw new Error('Invalid GitHub workflow response');
    if (data.workflow_runs.some(run => run.status !== 'completed')) {
        return 'Refresh already queued or running';
    }
    const response = await request(`${WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' })
    });
    if (!response.ok) throw new Error(`Cannot start forecast workflow: GitHub HTTP ${response.status}`);
    return 'Forecast refresh requested';
}

export default {
    async scheduled(controller, env) {
        console.log(await triggerRefresh(env));
    }
};
