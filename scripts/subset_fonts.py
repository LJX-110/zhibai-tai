# -*- coding: utf-8 -*-
"""
书法字体子集化脚本
- 字符集 = GB2312 一级常用字(3755) ∪ 全仓源码字符 ∪ ASCII/全角标点
- 覆盖不了的长尾字（生僻字/用户自造词）回退到系统楷体栈，视觉略混但可用
- 用法：python scripts/subset_fonts.py
"""
import glob
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = [
    ("ma-shan-zheng-400.woff2"),
    ("zcool-xiaowei-400.woff2"),
]

def gb2312_level1():
    """GB2312 区 16-55 = 一级常用汉字 3755（按频度排序的常用集）"""
    chars = []
    for qu in range(16, 56):
        for wei in range(1, 95):
            try:
                chars.append(bytes([qu + 0xA0, wei + 0xA0]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return chars

def source_chars():
    chars = set()
    patterns = ["src/**/*.ts", "src/**/*.tsx", "src/**/*.css", "index.html", "public/*.svg"]
    for pat in patterns:
        for path in glob.glob(os.path.join(ROOT, pat), recursive=True):
            try:
                with io.open(path, "r", encoding="utf-8") as f:
                    chars.update(f.read())
            except (OSError, UnicodeDecodeError):
                pass
    return chars

def main():
    base = gb2312_level1()
    extra = source_chars()
    ascii_punct = [chr(c) for c in range(0x20, 0x7F)]
    cjk_punct = (
        "，。、；：？！…—·ˉˇ¨〃々～‖＂＇｀＂〔〕〈〉《》「」『』〖〗【】"
        "（）［］｛｝，．：；！？＇＂％＃＠＆＊＼－＋＝＜＞｜～￥"
        "一二三四五六七八九十〇零元角分亿万千佰拾"
    )
    charset = sorted(set(base) | extra | set(ascii_punct) | set(cjk_punct))
    text = "".join(c for c in charset if ord(c) >= 0x20 or c == " ")
    print(f"charset size: {len(text)}")

    # 保留码位必须含 ASCII 空格与常见拉丁（避免组件里 font 图标类fallback）
    for name in FONTS:
        # 完整字体存于 full/（首次运行需手动移入），子集覆盖原文件名，CSS 零改动
        src_path = os.path.join(ROOT, "src/assets/fonts/full", name)
        out_path = os.path.join(ROOT, "src/assets/fonts", name)
        before = os.path.getsize(src_path)
        cmd = [
            sys.executable, "-m", "fontTools.subset",
            src_path,
            f"--text={text}",
            "--flavor=woff2",
            f"--output-file={out_path}",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        after = os.path.getsize(out_path)
        print(f"{name}: {before/1024:.0f}KB -> {after/1024:.0f}KB")

if __name__ == "__main__":
    main()
