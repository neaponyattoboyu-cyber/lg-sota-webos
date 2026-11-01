import hashlib,io,tarfile,urllib.request
from pathlib import Path
r=Path(__file__).resolve().parent
b=urllib.request.urlopen("https://github.com/SagerNet/sing-box/releases/download/v1.13.21/sing-box-1.13.21-linux-armv7.tar.gz",timeout=60).read()
with tarfile.open(fileobj=io.BytesIO(b),mode="r:gz") as t:
 p=next(m for m in t.getmembers() if m.isfile() and m.name.endswith("/sing-box"))
 binary=t.extractfile(p).read()
assert hashlib.sha256(binary).hexdigest()=="232ed3c5ef4e8d7ceae8e49b43e4111c7f86cc7efd79bfa5bd051ff085f0e00a"
p=r/"app/com.local.sota.tv/bin/sing-box"
p.parent.mkdir(parents=True,exist_ok=True)
p.write_bytes(binary)
print("Verified sing-box 1.13.21 ARMv7 prepared")
