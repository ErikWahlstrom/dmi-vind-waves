"""Fail once per source outage, using completed workflow steps as incident state."""
import json
import os
from urllib.request import Request, urlopen

OUTAGE = 'Record DMI source outage'
REACHABLE = 'Record DMI source reachable'


def should_alert(read, repository, current_run):
    base = f'/repos/{repository}/actions'
    page = 1
    while True:
        runs = read(f'{base}/workflows/runinfo.yml/runs?branch=main&status=completed&per_page=100&page={page}')['workflow_runs']
        if not runs:
            return True
        for run in runs:
            if str(run['id']) == str(current_run) or run['conclusion'] == 'cancelled':
                continue
            jobs = read(f'{base}/runs/{run["id"]}/jobs?per_page=100')['jobs']
            steps = {step['name']: step['conclusion']
                     for job in jobs for step in job.get('steps', [])}
            if steps.get(OUTAGE) == 'success':
                return False
            if steps.get(REACHABLE) == 'success':
                return True
            if steps and OUTAGE not in steps and REACHABLE not in steps:
                # Bootstrap when the preceding workflow predates these markers.
                return True
            # An interrupted job must not reset an ongoing incident.
        page += 1


def main():
    def read(path):
        request = Request('https://api.github.com' + path, headers={
            'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'dmi-forecast-outage-alert',
        })
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    if should_alert(read, os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_RUN_ID']):
        print('::error::DMI source outage started. Saved forecast retained; further retries in this outage will be quiet.')
        return 1
    print('DMI outage continues. Already reported; retaining saved forecast and retrying on schedule.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
