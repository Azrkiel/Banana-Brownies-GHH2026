"""Local API/RSS proof with a test-only manifest; never installs smoke weights for deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request


def rss(pid):
    if sys.platform == 'win32':
        # Windows venv launchers can host a child Python process. Count the full tree.
        command = ("$rows = Get-CimInstance Win32_Process; $ids = @(" + str(pid) + "); "
                   "$changed = $true; while ($changed) { $changed = $false; foreach ($row in $rows) { "
                   "if (($ids -contains [int]$row.ParentProcessId) -and ($ids -notcontains [int]$row.ProcessId)) { "
                   "$ids += [int]$row.ProcessId; $changed = $true } } }; "
                   "($rows | Where-Object { $ids -contains [int]$_.ProcessId } | Measure-Object WorkingSetSize -Sum).Sum")
        return int(subprocess.check_output(['powershell', '-NoProfile', '-Command', command], text=True).strip())
    status = Path(f'/proc/{pid}/status').read_text()
    return int(next(line.split()[1] for line in status.splitlines() if line.startswith('VmRSS:'))) * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    meta = json.loads(args.manifest.read_text())
    if meta.get('deployable') is not False:
        parser.error('This harness requires an explicitly non-deployable smoke manifest')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0)); port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        name = 'sign_c1_250.onnx'; target = directory/name
        shutil.copyfile(args.model,target)
        # Local harness override only. The original ignored smoke manifest stays non-deployable.
        meta.update(deployable=True,c1_model_url=name,c1_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),c1_size_bytes=target.stat().st_size)
        (directory/'manifest.json').write_text(json.dumps(meta))
        env = dict(os.environ,PYTHONPATH='server',INFER_ENABLED='1',INFER_MODEL_DIR=str(directory))
        process = subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',str(port)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            root=f'http://127.0.0.1:{port}'
            for _ in range(100):
                if process.poll() is not None: raise RuntimeError('API process exited')
                try:
                    with urllib.request.urlopen(root+'/api/health',timeout=1) as response:
                        if response.status==200: break
                except OSError: time.sleep(.1)
            else: raise RuntimeError('API did not start')
            baseline=rss(process.pid)
            body=struct.pack('<'+'e'*5568,*([0.1]*172+[1.,1.])*32)
            compute=[]
            for _ in range(110):
                request=urllib.request.Request(root+'/api/infer',data=body,headers={'Content-Type':'application/octet-stream','X-Landmark-Consent':'true','X-Model-SHA256':meta['c1_sha256']})
                with urllib.request.urlopen(request,timeout=30) as response: result=json.load(response)
                assert len(result['embedding'])==192 and result['topK']
                compute.append(result['latencyMs'])
            memory=rss(process.pid); times=sorted(compute[10:])
            result=dict(requests=110,baseline_rss_mb=baseline/1e6,active_rss_mb=memory/1e6,server_p50_ms=times[50],server_p95_ms=times[95],synthetic_only=True)
            print(json.dumps(result,indent=2))
            if memory>180_000_000: raise RuntimeError('Observed RSS exceeds Phase 5 acceptance budget')
        finally:
            if sys.platform == 'win32':
                subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
            else:
                process.terminate()
            process.wait(timeout=15)


if __name__=='__main__':
    main()
