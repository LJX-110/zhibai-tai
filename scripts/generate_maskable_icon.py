"""生成 PWA / iOS 图标（public/icon-maskable.png、public/icon-180.png）。

- icon-maskable.png：PWA maskable 专用（512x512，全底铺色、无透明/圆角，
  关键内容须落在内切圆 80% 半径（安全区）内，否则平台遮罩会裁掉图案）
- icon-180.png：iOS 添加到主屏幕用（180x180，Safari 只认 apple-touch-icon，
  不读 manifest；规范是方形全底，系统自行加圆角遮罩）

常规 icon-192/512.png 是"圆角卡片 + 外圈白环贴边"的设计，复用为 maskable
会被系统放大裁切外圈；这里按瓦当样式重绘：内容整体收缩到安全区内。

用法：python scripts/generate_maskable_icon.py
改过 favicon-v2.svg 视觉后，需重跑本脚本保持图标同源。
"""

from PIL import Image, ImageDraw, ImageFont

BLUE = (46, 90, 140)      # #2E5A8C 黛蓝底
GOLD = (227, 194, 92)     # #E3C25C 鎏金
WHITE = (255, 255, 255)
FONT_PATH = r"C:\Windows\Fonts\simkai.ttf"


def draw_wadang(size: int) -> Image.Image:
    """瓦当样式：全蓝底 + 双白环 + 四向鎏金箭头 + 楷体白文「知」。"""
    img = Image.new("RGBA", (size, size), BLUE)
    d = ImageDraw.Draw(img)
    c = size / 2
    # 内容最外缘（白环外缘）压在安全区半径 40% 以内
    outer_r = size * 0.34    # 外白环中心半径
    outer_w = size * 0.039   # 外环线宽
    inner_r = size * 0.285   # 弦纹半径
    inner_w = size * 0.01    # 弦纹线宽
    arrow_tip = outer_r + outer_w / 2 - size * 0.008
    arrow_base = outer_r - size * 0.066

    # 外白环 + 弦纹
    for r, w, color in ((outer_r, int(outer_w), WHITE),
                        (inner_r, int(inner_w), WHITE)):
        d.ellipse((c - r, c - r, c + r, c + r), outline=color, width=int(w))

    # 四向鎏金箭头（朝外），宽度为箭头跨度的一半
    half = int((arrow_tip - arrow_base) * 0.75)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        tip = (c + dx * arrow_tip, c + dy * arrow_tip)
        b1 = (c + dx * arrow_base - dy * half, c + dy * arrow_base + dx * half)
        b2 = (c + dx * arrow_base + dy * half, c + dy * arrow_base - dx * half)
        d.polygon([tip, b1, b2], fill=GOLD)

    # 楷体白文「知」居中
    font = ImageFont.truetype(FONT_PATH, int(size * 0.21))
    bbox = d.textbbox((0, 0), "知", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((c - w / 2 - bbox[0], c - h / 2 - bbox[1]), "知", font=font, fill=WHITE)
    return img


def main() -> None:
    public = r"e:\WorkSpace\work\知白台\public"
    draw_wadang(512).save(rf"{public}\icon-maskable.png")
    draw_wadang(180).save(rf"{public}\icon-180.png")
    print("saved icon-maskable.png (512) & icon-180.png (180)")


if __name__ == "__main__":
    main()