#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
產生任意單一漢字的筆順資料（strokes），來源為 KanjiVG。

用途：從 KanjiVG（CC BY-SA 3.0）抓取單一漢字的 SVG 原始檔，取出
<g id="kvg:StrokePaths_XXXXX"> 底下依筆順排列的 <path d="..."> 座標字串，
輸出一份 JSON（{char: [d, d, ...]}），供人工把資料貼進 js/data.js 使用。

現況說明：這支腳本原本是為了「數字」「時間・星期」這批內容而寫的，
但後來決定這批內容（一二三四五六七八九十百／時分何曜日月火水木金土）
不做描紅練習——這些漢字台灣學生本來就會寫，只需要學日文念法，
所以目前 js/data.js 裡這些字沒有用到這支腳本產出的筆畫資料。
腳本與已產出的 tools/kanji_strokes.json 仍保留、進版控，
留著給以後如果真的要做「漢字描紅練習」（例如更進階的 JLPT 漢字）時重複使用。

這支腳本本身要進版控（過去同類生成腳本沒進版控，遺失後專案作者得重新
從零手動重建整個網站——這次不能重蹈覆轍），所以請勿把它加進 .gitignore。

用法：
    python tools/gen_kanji_strokes.py

輸出：
    tools/kanji_strokes.json
"""
import json
import re
import time
import urllib.request
import urllib.error

# 目標漢字：數字（Lesson 6）＋ 時間與星期（Lesson 7）
CHARS = list('一二三四五六七八九十百') + list('時分何曜日月火水木金土')

RAW_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg'
STROKEPATHS_RE = re.compile(
    r'<g[^>]*id="kvg:StrokePaths_[0-9a-fA-F]+"[^>]*>(.*?)</g>\s*(?:<g[^>]*id="kvg:StrokeNumbers_|</svg>)',
    re.DOTALL,
)
PATH_D_RE = re.compile(r'<path\b[^>]*\bd="([^"]+)"')


def codepoint(ch):
    return format(ord(ch), '05x')


def fetch_svg(ch):
    code = codepoint(ch)
    url = RAW_BASE.format(code=code)
    req = urllib.request.Request(url, headers={'User-Agent': 'nihongo-caotsun-mura-tools/1.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode('utf-8')


def extract_strokes(svg_text):
    m = STROKEPATHS_RE.search(svg_text)
    if not m:
        raise ValueError('找不到 kvg:StrokePaths 區塊')
    block = m.group(1)
    paths = PATH_D_RE.findall(block)
    if not paths:
        raise ValueError('kvg:StrokePaths 區塊內沒有 <path d="...">')
    return paths


def main():
    out = {}
    errors = []
    for ch in CHARS:
        code = codepoint(ch)
        try:
            svg_text = fetch_svg(ch)
            strokes = extract_strokes(svg_text)
            out[ch] = strokes
            print(f'OK  {ch} (U+{code.upper()})  {len(strokes)} 畫')
        except urllib.error.HTTPError as e:
            errors.append(ch)
            print(f'FAIL {ch} (U+{code.upper()})  HTTP {e.code}')
        except Exception as e:  # noqa: BLE001
            errors.append(ch)
            print(f'FAIL {ch} (U+{code.upper()})  {e}')
        time.sleep(0.2)  # 對 GitHub raw 客氣一點

    with open('tools/kanji_strokes.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f'\n完成：{len(out)}/{len(CHARS)} 字，輸出至 tools/kanji_strokes.json')
    if errors:
        print('失敗清單：', ' '.join(errors))


if __name__ == '__main__':
    main()
