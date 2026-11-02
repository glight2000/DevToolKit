import importlib.util, sys, os, pathlib, tempfile, json, unittest
from unittest.mock import patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('collector', sys.argv.pop())
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='devtoolkit-collector-')
        self.root = pathlib.Path(self.directory.name)
        self.env = patch.dict(os.environ, {'HOME': str(self.root), 'PATH': str(self.root)+':/usr/bin:/bin'}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.directory.cleanup)

    def executable(self, name, code):
        path = self.root/name
        path.write_text('#!'+sys.executable+'\n'+code)
        path.chmod(0o700)

    def test_codex_rpc_allowlist_and_missing_capabilities(self):
        self.executable('codex', '''import json,sys,time
for line in sys.stdin:
 r=json.loads(line); m=r['method']; result={}
 if 'id' not in r: continue
 if m=='account/read': result={'account':{'type':'chatgpt','email':'fixture@example.test','planType':'pro','access_token':'NEVER_EXPORT'}}
 if m=='account/rateLimits/read': result={'rateLimitsByLimitId':{'codex':{'primary':{'usedPercent':25,'windowDurationMins':300,'resetsAt':2000000000},'credits':{'balance':'12.5','hasCredits':True,'unlimited':False}}},'rateLimitResetCredits':{'availableCount':4,'credits':[{'id':'SECRET_REDEEM_HANDLE','title':'Reset','status':'available','expiresAt':2000000000}]}}
 if m=='account/usage/read': result={'summary':{'lifetimeTokens':12345},'dailyUsageBuckets':[{'startDate':'2026-10-09','tokens':123}]}
 if m=='thread/list': result={'data':[{'id':'conversation-1','name':'Refactor authentication','preview':'private prompt','cwd':'/work/project','updatedAt':1700000000,'turns':[{'token':'PRIVATE_FULL_CONTENT'}]}]}
 print(json.dumps({'id':r['id'],'result':result}),flush=True)
''')
        result = collector.collect_codex('')
        self.assertEqual(result['status'], 'live')
        self.assertEqual(result['windows'][0]['durationSeconds'], 18000)
        self.assertEqual(result['windows'][0]['resetsAt'], 2000000000000)
        self.assertEqual(result['coupons']['available'], 4) # Service count can exceed detail rows.
        self.assertEqual(result['usage']['daily'][0]['tokens'], 123)
        self.assertEqual(result['sessions'][0]['title'], 'Refactor authentication')
        serialized = json.dumps(result)
        for secret in ['NEVER_EXPORT','SECRET_REDEEM_HANDLE','PRIVATE_FULL_CONTENT','private prompt']:
            self.assertNotIn(secret, serialized)

    def test_claude_remote_only_auth_and_sessions(self):
        home = self.root/'.claude'; home.mkdir()
        (home/'.credentials.json').write_text(json.dumps({'claudeAiOauth':{'accessToken':'REMOTE_ONLY_TOKEN','subscriptionType':'max'}}))
        (home/'history.jsonl').write_text(json.dumps({'sessionId':'s1','display':'Fix widgets','project':'/project','timestamp':1700000000000})+'\n')
        self.executable('claude', 'print(\'{"loggedIn":true,"email":"fixture@example.test","subscriptionType":"max"}\')')
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{"five_hour":{"utilization":30,"resets_at":"2030-01-01T00:00:00Z"},"extra_usage":{"is_enabled":true,"used_credits":100,"monthly_limit":500}}'
        class Opener:
            def open(self, request, timeout):
                assert request.full_url == 'https://api.anthropic.com/api/oauth/usage'
                assert request.get_header('Authorization') == 'Bearer REMOTE_ONLY_TOKEN'
                return Response()
        with patch.object(collector.urllib.request, 'build_opener', return_value=Opener()):
            result = collector.collect_claude('')
        self.assertEqual(result['status'], 'live')
        self.assertEqual(result['sessions'][0]['title'], 'Fix widgets')
        self.assertEqual(result['credits']['used'], 1)
        self.assertNotIn('coupons', result)
        self.assertNotIn('REMOTE_ONLY_TOKEN', json.dumps(result))

    def test_missing_clients_and_credentials_are_not_zero_quota(self):
        with patch.object(collector, 'executable', return_value='/does/not/exist'):
            codex = collector.collect_codex('')
            claude = collector.collect_claude('')
        self.assertEqual(codex['status'], 'unavailable')
        self.assertEqual(claude['status'], 'signed-out')
        self.assertNotIn('coupons', codex)
        self.assertEqual(codex['windows'], [])

if __name__ == '__main__': unittest.main()
