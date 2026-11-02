# Executed over SSH stdin. Credentials and full provider responses stay here.
import os, sys, json, time, pathlib, subprocess, threading, queue, shutil, datetime
import urllib.request, urllib.error

def text(value, limit=200):
    return value[:limit] if isinstance(value, str) else None

def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 1e18 else None

def timestamp(value):
    if isinstance(value, (int, float)):
        return int(value * 1000) if value > 0 else None
    try:
        return int(datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)
    except Exception:
        return None

def read_json(path):
    try:
        with open(path, encoding='utf-8') as stream:
            return json.loads(stream.read(2 * 1024 * 1024))
    except Exception:
        return {}

def runtime_env():
    env = dict(os.environ)
    # Non-interactive SSH often omits user-installed CLI / nvm paths.
    folders = [pathlib.Path.home()/p for p in ['.local/bin', '.npm-global/bin', '.cargo/bin']]
    nvm = pathlib.Path(env.get('NVM_DIR') or pathlib.Path.home()/'.nvm') / 'versions/node'
    if nvm.is_dir():
        folders += [p/'bin' for p in sorted(nvm.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)[:10]]
    env['PATH'] = env.get('PATH', '') + os.pathsep + os.pathsep.join(str(p) for p in folders if p.is_dir())
    return env

def executable(name, env=None):
    found = shutil.which(name, path=(env or os.environ).get('PATH'))
    if found:
        return found
    for folder in ['.local/bin', '.npm-global/bin', '.cargo/bin']:
        candidate = pathlib.Path.home() / folder / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return name

def base(provider):
    return dict(provider=provider, status='unavailable', observedAt=int(time.time()*1000), windows=[], sessions=[])

class Rpc:
    def __init__(self, env):
        self.process = subprocess.Popen([executable('codex', env), 'app-server'], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
        self.messages = queue.Queue(64)
        self.sequence = 0
        def reader():
            try:
                while True:
                    line = self.process.stdout.readline(4 * 1024 * 1024)
                    if not line:
                        break
                    obj = json.loads(line)
                    if 'id' in obj:
                        self.messages.put(obj)
            except Exception:
                pass
        threading.Thread(target=reader, daemon=True).start()

    def send(self, message):
        self.process.stdin.write(json.dumps(message) + '\n')
        self.process.stdin.flush()

    def call(self, method, params=None):
        self.sequence += 1
        self.send(dict(id=self.sequence, method=method, params=params or {}))
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            response = self.messages.get(timeout=max(.01, deadline-time.monotonic()))
            if response.get('id') != self.sequence:
                continue
            if 'error' in response:
                raise RuntimeError('Provider request unavailable')
            return response.get('result') or {}
        raise TimeoutError()

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdin.close()
        self.process.stdout.close()

def collect_codex(home):
    result = base('codex')
    env = runtime_env()
    if home:
        env['CODEX_HOME'] = os.path.expanduser(home)
    rpc = None
    try:
        rpc = Rpc(env)
        rpc.call('initialize', dict(clientInfo=dict(name='devtoolkit_remote_observer', version='1.0.0'), capabilities=dict(experimentalApi=True)))
        rpc.send(dict(method='initialized', params={}))
        try:
            account = rpc.call('account/read', dict(refreshToken=False)).get('account')
            if not account:
                result.update(status='signed-out', message='远端 Codex 未登录')
            else:
                result.update(account=text(account.get('email')), plan=text(account.get('planType')), status='unavailable')
                if account.get('type') == 'apiKey':
                    result.update(plan='API key', message='API key 登录不提供订阅额度')
                else:
                    limits = rpc.call('account/rateLimits/read')
                    buckets = limits.get('rateLimitsByLimitId') or {'codex': limits.get('rateLimits') or {}}
                    for key, bucket in list(buckets.items())[:20]:
                        result['plan'] = result.get('plan') or text(bucket.get('planType'))
                        for slot in ['primary', 'secondary']:
                            window = bucket.get(slot) or {}
                            used = number(window.get('usedPercent'))
                            if used is None:
                                continue
                            minutes = number(window.get('windowDurationMins'))
                            label = (str(int(minutes / 60)) + ' 小时' if minutes and minutes % 60 == 0 else str(minutes) + ' 分钟') if minutes else slot
                            result['windows'].append(dict(id=str(key)+':'+slot, label=(text(bucket.get('limitName')) or str(key))+' · '+label, usedPercent=min(100,used), resetsAt=timestamp(window.get('resetsAt')), durationSeconds=minutes*60 if minutes else None))
                        credit = bucket.get('credits')
                        if isinstance(credit, dict) and 'credits' not in result:
                            result['credits'] = dict(balance=text(credit.get('balance')), unlimited=credit.get('unlimited') is True, unit='credits')
                    coupons = limits.get('rateLimitResetCredits')
                    if isinstance(coupons, dict) and number(coupons.get('availableCount')) is not None:
                        result['coupons'] = dict(available=coupons['availableCount'], detailsAvailable=isinstance(coupons.get('credits'), list), items=[dict(title=text(c.get('title')) or '额度重置券', expiresAt=timestamp(c.get('expiresAt'))) for c in (coupons.get('credits') or [])[:200] if c.get('status') == 'available'])
                    result['status'] = 'live'
                    try:
                        usage = rpc.call('account/usage/read')
                        summary = usage.get('summary') or {}
                        result['usage'] = {k: number(summary.get(k)) for k in ['lifetimeTokens','peakDailyTokens','currentStreakDays']}
                        result['usage']['daily'] = [dict(date=text(row.get('startDate'), 20), tokens=number(row.get('tokens'))) for row in (usage.get('dailyUsageBuckets') or [])[-90:]]
                    except Exception:
                        pass
        except Exception:
            result.update(status='error', message='Codex 账号或额度查询失败：请检查远端登录、网络和 CLI 版本')
        try:
            threads = rpc.call('thread/list', dict(limit=100, sortKey='updated_at', sortDirection='desc'))
            result['sessions'] = [dict(id=text(t.get('id')), title=text(t.get('name') or t.get('preview') or t.get('id')), cwd=text(t.get('cwd'), 1000) or '', updatedAt=timestamp(t.get('updatedAt'))) for t in threads.get('data', [])[:100]]
            result['sessionsMessage'] = '最近 100 条会话（不含归档）；环境历史不一定属于当前登录账号'
        except Exception:
            result['sessionsMessage'] = '会话列表不可用，请检查远端 Codex app-server 版本'
    except Exception:
        result['message'] = '找不到可用的 Codex app-server，请确认远端 PATH 中有 codex'
    finally:
        if rpc:
            rpc.close()
    return result

def claude_sessions(home):
    sessions = {}
    history = home / 'history.jsonl'
    try:
        with open(history, 'rb') as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size-2*1024*1024))
            if size > 2*1024*1024:
                stream.readline()
            for line in stream:
                try:
                    row = json.loads(line)
                    sid = text(row.get('sessionId'))
                    if sid:
                        sessions[sid] = dict(id=sid, title=text(row.get('display')) or sid, cwd=text(row.get('project'),1000) or '', updatedAt=number(row.get('timestamp')))
                except Exception:
                    pass
    except OSError:
        pass
    projects = home / 'projects'
    if projects.is_dir():
        for index, project in enumerate(projects.iterdir()):
            if index >= 300:
                break
            for row in read_json(project / 'sessions-index.json').get('entries', [])[:500]:
                sid = text(row.get('sessionId'))
                if sid:
                    sessions[sid] = dict(id=sid, title=text(row.get('summary') or row.get('firstPrompt')) or sid, cwd=text(row.get('projectPath'),1000) or '', updatedAt=timestamp(row.get('modified')))
    return sorted(sessions.values(), key=lambda s:s.get('updatedAt') or 0, reverse=True)[:100]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def collect_claude(home):
    result = base('claude')
    env = runtime_env()
    if home:
        env['CLAUDE_CONFIG_DIR'] = os.path.expanduser(home)
    directory = pathlib.Path(env.get('CLAUDE_CONFIG_DIR') or pathlib.Path.home()/'.claude')
    result['sessions'] = claude_sessions(directory)
    result['sessionsMessage'] = '最近 100 条本地索引／历史会话；环境历史不一定属于当前登录账号'
    auth = {}
    try:
        command = subprocess.run([executable('claude', env), 'auth', 'status'], env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, text=True)
        auth = json.loads(command.stdout)
        result.update(account=text(auth.get('email')), plan=text(auth.get('subscriptionType')))
    except Exception:
        pass
    if any(env.get(k) for k in ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY']) or auth.get('authMethod') in ['api_key','apiKey']:
        result.update(message='此环境使用 API key 或自定义服务，不按订阅额度查询', plan='API / 自定义服务')
        return result
    credential = read_json(directory / '.credentials.json').get('claudeAiOauth') or {}
    token = env.get('CLAUDE_CODE_OAUTH_TOKEN') or credential.get('accessToken')
    result['plan'] = result.get('plan') or text(credential.get('subscriptionType'))
    if not token:
        result.update(status='unavailable' if auth.get('loggedIn') else 'signed-out', message='CLI 已登录，但此凭据后端暂不提供额度读取' if auth.get('loggedIn') else '远端 Claude 未登录或凭据不可读')
        return result
    try:
        request = urllib.request.Request('https://api.anthropic.com/api/oauth/usage', headers={'Authorization':'Bearer '+token, 'Accept':'application/json', 'anthropic-beta':'oauth-2025-04-20'})
        with urllib.request.build_opener(NoRedirect).open(request, timeout=12) as response:
            usage = json.loads(response.read(1024*1024))
        for key, label, seconds in [('five_hour','5 小时',18000),('seven_day','7 天',604800),('seven_day_sonnet','Sonnet · 7 天',604800),('seven_day_opus','Opus · 7 天',604800)]:
            value = usage.get(key) or {}
            used = number(value.get('utilization'))
            if used is not None:
                result['windows'].append(dict(id=key, label=label, usedPercent=min(100,used), resetsAt=timestamp(value.get('resets_at')), durationSeconds=seconds))
        extra = usage.get('extra_usage') or {}
        if extra.get('is_enabled'):
            result['credits'] = dict(unit='USD', used=extra['used_credits']/100 if number(extra.get('used_credits')) is not None else None, limit=extra['monthly_limit']/100 if number(extra.get('monthly_limit')) is not None else None)
        result.update(status='live', message='额度来自 Claude CLI 兼容接口；重置券未提供')
    except urllib.error.HTTPError as error:
        result.update(status='error', message='Claude 额度接口限流，稍后重试' if error.code == 429 else 'Claude 额度查询失败（HTTP '+str(error.code)+'），请检查登录与访问权限')
    except Exception:
        result.update(status='error', message='Claude 额度查询失败，请检查远端网络')
    return result

def main(config):
    results = []
    for provider in config.get('providers', []):
        try:
            results.append(collect_codex(config.get('codexHome')) if provider == 'codex' else collect_claude(config.get('claudeHome')))
        except Exception:
            failed = base(provider)
            failed.update(status='error', message='远端数据格式或运行环境不兼容')
            results.append(failed)
    return results
