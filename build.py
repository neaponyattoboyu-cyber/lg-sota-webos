from pathlib import Path
import os,shutil,subprocess
r=Path(__file__).resolve().parent
assert (r/"app/com.local.sota.tv/bin/sing-box").exists(),"Run python prepare_core.py first"
env=os.environ.copy();env["ARES_PROFILE"]="tv"
subprocess.run([shutil.which("npx"),"--yes","--package","@webos-tools/cli@3.2.6","ares-package","--no-minify",str(r/"app/com.local.sota.tv"),"-o",str(r/"dist")],check=True,env=env)
