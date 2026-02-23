import sys
from urllib.parse import quote

def make_url(shortcut_name: str) -> str:
  return f"shortcuts://run-shortcut?name={quote(shortcut_name)}"

print(make_url(" ".join(sys.argv[1:])))