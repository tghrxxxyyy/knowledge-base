#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建 website/search-index.json
扫描仓库全部 markdown，提取 路径/标题/摘要/板块/行数，供前端离线搜索。
用法: python3 build-index.py
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(ROOT)
SKIP_DIRS = {'.git', '.workbuddy', 'website'}

def strip_md(text: str) -> str:
    text = re.sub(r'```.*?```', ' ', text, flags=re.S)
    text = re.sub(r'`([^`]*)`', r'\1', text)
    text = re.sub(r'!\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'[#>*|\-]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def extract_title(text: str) -> str:
    m = re.search(r'^#\s+(.+)$', text, flags=re.M)
    return m.group(1).strip() if m else ''

def main():
    entries = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.')]
        for fname in sorted(filenames):
            if not fname.endswith('.md'):
                continue
            full = os.path.join(dirpath, fname)
            rel = os.path.relpath(full, REPO_ROOT).replace(os.sep, '/')
            try:
                with open(full, encoding='utf-8', errors='replace') as f:
                    content = f.read()
            except Exception as e:
                print(f'!! 读取失败 {rel}: {e}', file=sys.stderr)
                continue
            title = extract_title(content)
            excerpt = strip_md(content)[:160]
            parts = rel.split('/')
            board = parts[0] if len(parts) > 1 else '(根)'
            entries.append({
                'path': rel,
                'title': title or fname[:-3],
                'excerpt': excerpt,
                'board': board,
                'lines': content.count('\n') + 1,
            })
    out = os.path.join(ROOT, 'search-index.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'repo': 'tghrxxxyyy/knowledge-base', 'branch': 'main',
                   'generated': __import__('datetime').date.today().isoformat(),
                   'total': len(entries), 'entries': entries},
                  f, ensure_ascii=False, indent=1)
    print(f'OK: {len(entries)} 篇 -> {out} ({os.path.getsize(out) // 1024} KB)')

if __name__ == '__main__':
    main()
