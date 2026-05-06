#!/usr/bin/env python3
"""
OtterPool build script
Combines all screen HTML files into a single self-contained otterpool.html

Usage:
    python3 combine.py

Output:
    dist/otterpool.html
"""

import re
import os
import shutil

# ── CONFIG ────────────────────────────────────────────────────────────────────

SCREENS = [
    ('calendar',     'otter-pool-calendar-v7.html'),
    ('event',        'otter-pool-event.html'),
    ('create',       'otter-pool-create-event.html'),
    ('mytrips',      'otter-pool-my-trips.html'),
    ('progress',     'otter-pool-progress.html'),
    ('levels',       'otter-pool-levels.html'),
    ('approval',     'otter-pool-approval.html'),
    ('participants', 'otter-pool-participants.html'),
    ('posttrip',     'otter-pool-posttrip.html'),
    ('profile',      'otter-pool-profile.html'),
    ('signup',       'otter-pool-signup.html'),
]

SRC_DIR  = os.path.join(os.path.dirname(__file__), 'src', 'screens')
SHELL    = os.path.join(os.path.dirname(__file__), 'src', 'otter-pool-app.html')
DIST_DIR = os.path.join(os.path.dirname(__file__), 'dist')
OUT_FILE = os.path.join(DIST_DIR, 'otterpool.html')

# ── HELPERS ───────────────────────────────────────────────────────────────────

def extract_body(filepath):
    """Extract content between <body> tags using byte-safe method."""
    with open(filepath, 'rb') as f:
        raw = f.read()
    body_match = re.search(rb'<body[^>]*>', raw)
    if not body_match:
        print(f"  WARNING: no <body> tag in {os.path.basename(filepath)}")
        return ''
    start = body_match.end()
    end = raw.rfind(b'</body>')
    if end <= start:
        print(f"  WARNING: no </body> tag in {os.path.basename(filepath)}")
        return ''
    return raw[start:end].decode('utf-8', errors='replace').strip()


def extract_styles(filepath):
    """Extract all CSS from <style> blocks, stripping :root declarations."""
    with open(filepath, encoding='utf-8', errors='replace') as f:
        content = f.read()
    styles = re.findall(r'<style[^>]*>(.*?)</style>', content, re.DOTALL)
    combined = '\n'.join(styles)
    # Remove :root blocks - defined once in the shell
    combined = re.sub(r':root\s*\{[^}]+\}', '', combined)
    return combined.strip()


def extract_scripts(filepath):
    """Extract all JS from <script> blocks."""
    with open(filepath, encoding='utf-8', errors='replace') as f:
        content = f.read()
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
    return '\n'.join(scripts).strip()


def escape_for_template(s):
    """Escape a string for safe embedding in a JS template literal."""
    s = s.replace('\\', '\\\\')
    s = s.replace('`', '\\`')
    s = re.sub(r'\$\{', '\\${', s)
    # Escape </script> tags to prevent HTML parser from ending the script block
    s = s.replace('</script>', '<\\/script>')
    return s


# ── BUILD ─────────────────────────────────────────────────────────────────────

def build():
    print("OtterPool build script")
    print("─" * 40)

    # Validate source files exist
    if not os.path.exists(SHELL):
        print(f"ERROR: Shell not found at {SHELL}")
        return False

    missing = []
    for name, filename in SCREENS:
        path = os.path.join(SRC_DIR, filename)
        if not os.path.exists(path):
            missing.append(filename)

    if missing:
        print(f"ERROR: Missing screen files:")
        for f in missing:
            print(f"  {f}")
        return False

    # Read shell
    with open(SHELL, encoding='utf-8') as f:
        shell = f.read()

    # Process each screen
    all_styles = []
    screen_bodies = {}
    screen_scripts_map = {}

    for name, filename in SCREENS:
        path = os.path.join(SRC_DIR, filename)
        body    = extract_body(path)
        styles  = extract_styles(path)
        scripts = extract_scripts(path)

        all_styles.append(f'/* ══ {name.upper()} ══ */\n{styles}')
        screen_bodies[name]      = escape_for_template(body)
        screen_scripts_map[name] = scripts

        print(f"  ✓ {filename:<45} {len(body):>6,} chars body")

    # Build screenData JS
    screen_data_lines = ["const screenData = {};"]
    for name, _ in SCREENS:
        screen_data_lines.append(f"screenData['{name}'] = `{screen_bodies[name]}`;")
    screen_data_js = '\n'.join(screen_data_lines)

    # Build screen init functions
    init_fns = []
    for name, _ in SCREENS:
        scripts = screen_scripts_map[name]
        if scripts.strip():
            escaped_scripts = scripts.replace('</script>', '<\\/script>')
            init_fns.append(f"""window.runInit_{name} = function() {{
  try {{
    {escaped_scripts}
  }} catch(e) {{ console.warn('Init error in {name}:', e); }}
}};""")
    screen_init_js = '\n\n'.join(init_fns)

    # Build combined styles
    combined_styles = '\n\n'.join(all_styles)

    # Replace fetch-based loadScreen with inline version
    load_screen_fn = """function loadScreen(screenId, back) {
  const container = document.getElementById('screen-container');
  const html = screenData[screenId];
  if (!html) {
    container.innerHTML = '<div style="padding:2rem;text-align:center;font-family:serif;color:#7a8a78;">Screen not found: ' + screenId + '</div>';
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'screen-wrap' + (back ? ' slide-back' : '');
  wrapper.innerHTML = html;
  container.innerHTML = '';
  container.appendChild(wrapper);
  wireNavigation(wrapper, screenId);
  const fn = window['runInit_' + screenId];
  if (fn) fn();
}"""

    output = shell

    # Swap loadScreen
    output = re.sub(
        r'async function loadScreen\(screenId, back = false\) \{.*?^\}',
        load_screen_fn,
        output,
        flags=re.DOTALL | re.MULTILINE
    )

    # Remove fetch-only functions
    output = re.sub(r'function injectStyles\([^)]+\) \{.*?^\}\n', '', output, flags=re.DOTALL | re.MULTILINE)
    output = re.sub(r'function runScripts\([^)]+\) \{.*?^\}\n',   '', output, flags=re.DOTALL | re.MULTILINE)
    output = output.replace('injectStyles(screenId, doc);\n', '')
    output = output.replace('runScripts(wrapper);\n', '')

    # Inject combined CSS
    output = output.replace('</style>', combined_styles + '\n</style>', 1)

    # Inject screen data and init functions
    output = output.replace(
        '// ── INIT',
        screen_data_js + '\n\n' + screen_init_js + '\n\n// ── INIT'
    )

    # Ensure dist directory exists
    os.makedirs(DIST_DIR, exist_ok=True)

    # Write output
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(output)

    size_kb = os.path.getsize(OUT_FILE) / 1024
    print(f"\n✓ Built: {OUT_FILE}")
    print(f"  Size:   {size_kb:.0f} KB")
    print(f"  Screens: {len(SCREENS)}")
    return True


if __name__ == '__main__':
    success = build()
    if not success:
        exit(1)
