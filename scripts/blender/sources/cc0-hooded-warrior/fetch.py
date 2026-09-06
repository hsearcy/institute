"""Recover the creator-published CC0 source without an account or credentials."""
from pathlib import Path
import hashlib
import html.parser
import subprocess
import urllib.parse
import urllib.request

SOURCE_ID = '1I2uMSoIxQbaciAEA5La9pHohjG4Je1fg'
ARCHIVE_SHA = 'ea2f38d16e810e8b984522ee8340fe10f24b7422f0323e58a95aed57c0783b53'
BLEND_SHA = '3f48d820b532677426ebae5ad77175faefc55f0ef4b071f523a4a97b5ab253ce'
folder = Path(__file__).resolve().parent
target = folder/'warrior-foundation.blend'

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

if target.exists() and digest(target) == BLEND_SHA:
    print('Verified existing authored-warrior source cache')
    raise SystemExit(0)

class DownloadForm(html.parser.HTMLParser):
    action = None
    inputs = None
    inside = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form' and attrs.get('id') == 'download-form':
            self.action = attrs.get('action')
            self.inputs = {}
            self.inside = True
        if tag == 'input' and self.inside and attrs.get('type') == 'hidden':
            self.inputs[attrs['name']] = attrs.get('value', '')

    def handle_endtag(self, tag):
        if tag == 'form':
            self.inside = False

url = 'https://drive.google.com/uc?' + urllib.parse.urlencode({'export': 'download', 'id': SOURCE_ID})
response = urllib.request.urlopen(url, timeout=120)
if 'text/html' in response.headers.get('Content-Type', ''):
    page = response.read().decode('utf-8')
    form = DownloadForm()
    form.feed(page)
    # This is Google's ordinary large-file scan notice, never a login/CAPTCHA flow.
    if 'too large for Google to scan for viruses' not in page or form.action != 'https://drive.usercontent.google.com/download':
        raise RuntimeError('Public download unavailable; inspect the creator source link manually')
    response = urllib.request.urlopen(form.action + '?' + urllib.parse.urlencode(form.inputs), timeout=120)
if 'text/html' in response.headers.get('Content-Type', ''):
    raise RuntimeError('Public download returned a webpage instead of the licensed archive')
archive = folder/'warrior-source.rar'
temporary = folder/'warrior-source.rar.tmp'
with response, temporary.open('wb') as output:
    while chunk := response.read(1024*1024):
        output.write(chunk)
if digest(temporary) != ARCHIVE_SHA:
    raise ValueError('Downloaded source differs from the audited archive')
temporary.replace(archive)
blend_temp = target.with_suffix('.blend.tmp')
with blend_temp.open('wb') as output:
    subprocess.run(['bsdtar', '-xOf', str(archive), 'warrior model/all in one.blend'], stdout=output, check=True)
if digest(blend_temp) != BLEND_SHA:
    raise ValueError('Extracted Blender source differs from the audited file')
blend_temp.replace(target)
print('Recovered and verified authored CC0 warrior source')
