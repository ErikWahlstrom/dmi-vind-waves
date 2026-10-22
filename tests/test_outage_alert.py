import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('outage_alert', Path(__file__).parents[1] / 'scripts/outage_alert.py')
alert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alert)


class OutageAlertTests(unittest.TestCase):
    def check_history(self, histories):
        runs = [{'id': i + 1, 'conclusion': conclusion}
                for i, (conclusion, _) in enumerate(histories)]

        def read(path):
            if '/workflows/' in path:
                return {'workflow_runs': runs if path.endswith('page=1') else []}
            run_id = int(path.split('/runs/')[1].split('/')[0])
            return {'jobs': [{'steps': [{'name': name, 'conclusion': conclusion}
                                       for name, conclusion in histories[run_id - 1][1].items()]}]}

        return alert.should_alert(read, 'owner/repo', 'current')

    def test_one_alert_then_quiet_until_recovery(self):
        recovered = ('success', {alert.REACHABLE: 'success', alert.OUTAGE: 'skipped'})
        first_outage = ('failure', {alert.OUTAGE: 'success', alert.REACHABLE: 'skipped'})
        ongoing = ('success', {alert.OUTAGE: 'success', alert.REACHABLE: 'skipped'})
        self.assertTrue(self.check_history([recovered]))
        self.assertFalse(self.check_history([first_outage, recovered]))
        self.assertFalse(self.check_history([ongoing, first_outage, recovered]))
        self.assertTrue(self.check_history([recovered, ongoing, first_outage]))

    def test_interrupted_checks_do_not_reset_incident(self):
        skipped = {alert.OUTAGE: 'skipped', alert.REACHABLE: 'skipped'}
        self.assertFalse(self.check_history([
            ('cancelled', {}), ('failure', skipped),
            ('success', {alert.OUTAGE: 'success'})]))

    def test_first_run_and_old_workflow_bootstrap_alert(self):
        self.assertTrue(self.check_history([]))
        self.assertTrue(self.check_history([('success', {'Capture and validate the printed forecast times': 'success'})]))

    def test_history_api_errors_remain_failures(self):
        def read(path):
            raise RuntimeError('GitHub unavailable')
        with self.assertRaises(RuntimeError):
            alert.should_alert(read, 'owner/repo', 'current')


if __name__ == '__main__':
    unittest.main()
